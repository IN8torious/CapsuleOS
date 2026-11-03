use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::path::PathBuf;
use std::time::Duration;
use tauri::command;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::time::timeout;

const CONTRACT_VERSION: u32 = 2;
const PIPE_PREFIX: &str = r"\\.\pipe\capsule-os-browser-";
const MAX_REPLY_BYTES: usize = 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 2 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const MODEL_REQUEST_TIMEOUT: Duration = Duration::from_secs(145);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeEndpoint {
    version: u32,
    pipe_path: String,
    token: String,
    pid: u32,
}

fn endpoint_path() -> Result<PathBuf, String> {
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "Windows roaming app-data is unavailable.".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("Capsule OS")
        .join("Browser")
        .join("bridge.json"))
}

fn validate_pipe_path(pipe_path: &str) -> bool {
    pipe_path
        .strip_prefix(PIPE_PREFIX)
        .map(|suffix| {
            suffix.len() == 24
                && suffix
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
        .unwrap_or(false)
}

fn validate_token(token: &str) -> bool {
    token.len() == 64
        && token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_operation_fields(operation: &str, fields: &Value) -> bool {
    let Some(fields) = fields.as_object() else {
        return false;
    };
    match operation {
        "bible-reference" => fields.len() == 2 && fields.get("payload").and_then(Value::as_object).is_some_and(|payload| {
            match fields.get("action").and_then(Value::as_str) {
                Some("status") => payload.is_empty(),
                Some("configure") => payload.len() == 1 && payload.get("enabled").and_then(Value::as_bool).is_some(),
                Some("verse") => payload.len() == 1 && payload.get("citation").and_then(Value::as_str)
                    .is_some_and(|citation| !citation.trim().is_empty() && citation.chars().count() <= 100),
                _ => false
            }
        }),
        "workspace-access" => fields.len() == 2 && fields.get("payload").and_then(Value::as_object).is_some_and(|payload| {
            match fields.get("action").and_then(Value::as_str) {
                Some("status") | Some("revoke") | Some("undo") => payload.is_empty(),
                Some("grant") => payload.len() == 2 && payload.get("confirmed").and_then(Value::as_bool) == Some(true)
                    && payload.get("folder").and_then(Value::as_str).is_some_and(|folder| !folder.contains('\0') && folder.len() <= 32768 && std::path::Path::new(folder).is_absolute()),
                _ => false
            }
        }),
        "orchestrator" => fields.len() == 2 && fields.get("payload").and_then(Value::as_object).is_some_and(|payload| {
            match fields.get("action").and_then(Value::as_str) {
                Some("status") | Some("stop") => payload.is_empty(),
                Some("start") => payload.len() == 3 && payload.get("confirmed").and_then(Value::as_bool) == Some(true)
                    && payload.get("goal").and_then(Value::as_str).is_some_and(|goal| !goal.trim().is_empty() && goal.chars().count() <= 600)
                    && payload.get("maxCycles").and_then(Value::as_u64).is_some_and(|cycles| (1..=3).contains(&cycles)),
                _ => false
            }
        }),
        "wsl-setup-plan" | "wsl-setup-execute" => fields.len() == if operation == "wsl-setup-plan" { 1 } else { 3 }
            && fields.get("distro").and_then(Value::as_str).is_some_and(|name| !name.is_empty() && name.len() <= 80 && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')))
            && (operation == "wsl-setup-plan" || (fields.get("confirmed").and_then(Value::as_bool) == Some(true)
                && fields.get("approvalId").and_then(Value::as_str).is_some_and(|id| id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')))),
        "html-components" if fields.get("action").and_then(Value::as_str) == Some("import") => fields.len() == 2
            && fields.get("payload").and_then(Value::as_object).is_some_and(|payload| payload.len() == 2
                && payload.get("name").and_then(Value::as_str).is_some_and(|name| !name.trim().is_empty()
                    && name.chars().count() <= 120 && !name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\')))
                && payload.get("source").and_then(Value::as_str).is_some_and(|source| !source.trim().is_empty()
                    && source.len() <= 256 * 1024 && !source.contains('\0'))),
        "html-components" => fields.len() == 2
            && fields.get("action").and_then(Value::as_str).is_some_and(|action| ["inspect", "library", "propose", "retain", "export", "forget", "discard"].contains(&action))
            && fields.get("payload").and_then(Value::as_object).is_some_and(|payload| payload.len() <= 3)
            && serde_json::to_vec(fields).map(|bytes| bytes.len() <= 16000).unwrap_or(false),
        "snapshot"
        | "assistant-status"
        | "agent-runtime-inspect"
        | "assistant-catalog"
        | "assistant-unload-model"
        | "assistant-cancel-download"
        | "learning-list"
        | "review-cache-status"
        | "mod-analysis-start"
        | "mod-list-kernel-proposals" => fields.is_empty(),
        "agent-runtime-configure" => {
            let Some(settings) = fields.get("settings").and_then(Value::as_object) else {
                return false;
            };
            let policy = settings.get("policy").and_then(Value::as_str);
            fields.len() == 1 && settings.len() == 2
                && matches!(policy, Some("windows") | Some("prefer-wsl"))
                && settings.get("distro").and_then(Value::as_str).map(|distro| {
                    if distro.is_empty() { return policy == Some("windows"); }
                    distro.len() <= 80 && distro.bytes().next().map(|b| b.is_ascii_alphanumeric()).unwrap_or(false)
                        && distro.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
                }).unwrap_or(false)
        }
        "wsl-distribution-action" => {
            fields.len() == 3
                && matches!(fields.get("action").and_then(Value::as_str), Some("start") | Some("stop"))
                && fields.get("confirmed").and_then(Value::as_bool) == Some(true)
                && fields.get("distro").and_then(Value::as_str).map(|distro| {
                    !distro.is_empty() && distro.len() <= 80
                        && distro.bytes().next().map(|b| b.is_ascii_alphanumeric()).unwrap_or(false)
                        && distro.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
                }).unwrap_or(false)
        }
        "route-catalog-task" => {
            fields.len() == 1
                && fields
                    .get("taskId")
                    .and_then(Value::as_u64)
                    .map(|task_id| task_id <= 10_000)
                    .unwrap_or(false)
        }
        "assistant-load-model" | "assistant-download-model" => {
            fields.len() == 1
                && fields
                    .get("modelId")
                    .and_then(Value::as_str)
                    .map(|model_id| {
                        !model_id.is_empty()
                            && model_id.len() <= 80
                            && model_id.bytes().all(|byte| {
                                byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'.')
                            })
                    })
                    .unwrap_or(false)
        }
        "appearance-tweak-proposals" => {
            let Some(settings) = fields.get("settings").and_then(Value::as_object) else {
                return false;
            };
            fields.len() == 2
                && fields
                    .get("goal")
                    .and_then(Value::as_str)
                    .map(|goal| !goal.trim().is_empty() && goal.chars().count() <= 240)
                    .unwrap_or(false)
                && settings.len() == 2
                && ["transparency", "windowAnimations"].iter().all(|key| {
                    settings
                        .get(*key)
                        .map(|value| value.is_null() || value.is_boolean())
                        .unwrap_or(false)
                })
        }
        "scene-html-edit" => {
            fields.len() == 2
                && fields.get("source").and_then(Value::as_str)
                    .map(|source| !source.trim().is_empty() && source.encode_utf16().count() <= 8000).unwrap_or(false)
                && fields.get("goal").and_then(Value::as_str)
                    .map(|goal| !goal.trim().is_empty() && goal.encode_utf16().count() <= 600).unwrap_or(false)
        }
        "review-cache-clear" => fields.len() == 1
            && fields.get("confirmed").and_then(Value::as_bool) == Some(true),
        "learning-forget" => fields.len() == 1
            && fields.get("lessonId").and_then(Value::as_str)
                .map(|id| id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')).unwrap_or(false),
        "learning-approve" => fields.len() == 5
            && fields.get("confirmed").and_then(Value::as_bool) == Some(true)
            && fields.get("findingId").and_then(Value::as_str).map(|id| id.len() <= 80).unwrap_or(false)
            && fields.get("sourceSha256").and_then(Value::as_str)
                .map(|hash| hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))).unwrap_or(false)
            && fields.get("text").and_then(Value::as_str).map(|text| !text.trim().is_empty() && text.encode_utf16().count() <= 600).unwrap_or(false)
            && matches!(fields.get("category").and_then(Value::as_str),
                Some("structure" | "style" | "interaction" | "accessibility" | "performance" | "evidence")),
        "mod-inspect-package" => {
            fields.len() == 1
                && fields
                    .get("filePath")
                    .and_then(Value::as_str)
                    .map(|path| !path.trim().is_empty() && path.len() <= 32_768)
                    .unwrap_or(false)
        }
        "mod-analysis-status" => {
            fields.len() == 1
                && fields
                    .get("jobId")
                    .and_then(Value::as_str)
                    .map(|job_id| {
                        job_id.len() == 36
                            && job_id.bytes().all(|byte| {
                                byte.is_ascii_digit()
                                    || (b'a'..=b'f').contains(&byte)
                                    || byte == b'-'
                            })
                    })
                    .unwrap_or(false)
        }
        "mod-save-auditor-proposal" => {
            fields.len() == 1
                && fields
                    .get("findingIds")
                    .and_then(Value::as_array)
                    .map(|ids| {
                        (1..=4).contains(&ids.len())
                            && ids.iter().all(Value::is_string)
                            && ids
                                .iter()
                                .filter_map(Value::as_str)
                                .collect::<std::collections::HashSet<_>>()
                                .len()
                                == ids.len()
                    })
                    .unwrap_or(false)
        }
        "mod-create-kernel-proposal" => {
            fields.len() == 2
                && fields
                    .get("name")
                    .and_then(Value::as_str)
                    .map(|name| !name.trim().is_empty() && name.len() <= 100)
                    .unwrap_or(false)
                && fields
                    .get("parentId")
                    .map(|parent_id| {
                        parent_id.is_null()
                            || parent_id
                                .as_str()
                                .map(|id| {
                                    id.len() == 36
                                        && id.bytes().all(|byte| {
                                            byte.is_ascii_digit()
                                                || (b'a'..=b'f').contains(&byte)
                                                || byte == b'-'
                                        })
                                })
                                .unwrap_or(false)
                    })
                    .unwrap_or(false)
        }
        _ => false,
    }
}

#[command]
pub async fn html_component_action(action: String, payload: Value) -> Result<Value, String> {
    request_browser("html-components", json!({"action":action,"payload":payload}), MODEL_REQUEST_TIMEOUT).await
}

#[command]
pub async fn export_reduced_html_copy(app: tauri::AppHandle, source_sha256: String, component_ids: Vec<String>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::io::Write;
    let result = request_browser("html-components", json!({
        "action":"export", "payload":{"sourceSha256":source_sha256,"componentIds":component_ids}
    }), MODEL_REQUEST_TIMEOUT).await?;
    let html = result.get("html").and_then(Value::as_str).ok_or("The runtime did not return selected HTML.")?.to_owned();
    if html.len() > 1024 * 1024 { return Err("The reduced copy exceeds its file limit.".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app.dialog().file().add_filter("Reduced HTML copy", &["html"])
            .set_file_name("capsule-reduced-source.html").blocking_save_file() else {
                return Ok(json!({"ok":false,"cancelled":true}));
            };
        let path = file.into_path().map_err(|e| e.to_string())?;
        if path.extension().and_then(|e| e.to_str()).is_none_or(|e| !e.eq_ignore_ascii_case("html")) {
            return Err("Choose a new .html copy filename.".to_string());
        }
        let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(&path)
            .map_err(|e| format!("Cannot create the reduced copy (existing files are never overwritten): {e}"))?;
        output.write_all(html.as_bytes()).and_then(|_| output.sync_all())
            .map_err(|e| format!("The reduced copy could not be fully written: {e}"))?;
        Ok(json!({"ok":true,"file":path,"bytes":html.len(),"sourceSha256":source_sha256}))
    }).await.map_err(|e| e.to_string())?
}

#[command]
pub async fn preview_wsl_setup(distro: String) -> Result<Value, String> {
    request_browser("wsl-setup-plan", json!({"distro":distro}), MODEL_REQUEST_TIMEOUT).await
}

#[command]
pub async fn apply_wsl_setup(distro: String, approval_id: String, confirmed: bool) -> Result<Value, String> {
    request_browser("wsl-setup-execute", json!({"distro":distro,"approvalId":approval_id,"confirmed":confirmed}), Duration::from_secs(720)).await
}

async fn request_browser(
    operation: &str,
    fields: Value,
    request_timeout: Duration,
) -> Result<Value, String> {
    if !valid_operation_fields(operation, &fields) {
        return Err("The requested Capsule bridge operation has invalid parameters.".to_string());
    }

    let path = if matches!(operation, "snapshot" | "route-catalog-task") {
        endpoint_path()?
    } else {
        crate::local_runtime::endpoint().await?
    };
    timeout(request_timeout, async {
        let content = tokio::fs::read(&path)
            .await
            .map_err(|error| format!("Capsule OS Browser is not connected: {error}"))?;
        if content.len() > 4096 {
            return Err("Capsule browser bridge metadata is invalid.".to_string());
        }

        let endpoint: BridgeEndpoint = serde_json::from_slice(&content)
            .map_err(|_| "Capsule browser bridge metadata is malformed.".to_string())?;
        if endpoint.version != CONTRACT_VERSION
            || !validate_pipe_path(&endpoint.pipe_path)
            || !validate_token(&endpoint.token)
            || endpoint.pid == 0
        {
            return Err("Capsule browser and toolbox contracts are incompatible.".to_string());
        }

        let mut pipe = ClientOptions::new()
            .open(&endpoint.pipe_path)
            .map_err(|error| format!("Capsule OS Browser is not connected: {error}"))?;
        let mut request: Map<String, Value> = fields.as_object().cloned().ok_or_else(|| {
            "The requested Capsule bridge operation has invalid parameters.".to_string()
        })?;
        request.insert("version".to_string(), Value::from(CONTRACT_VERSION));
        request.insert("token".to_string(), Value::from(endpoint.token));
        request.insert("operation".to_string(), Value::from(operation));
        let mut bytes = serde_json::to_vec(&Value::Object(request))
            .map_err(|error| format!("Unable to encode Capsule bridge request: {error}"))?;
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err("Capsule bridge request is too large.".to_string());
        }
        bytes.push(b'\n');

        pipe.write_all(&bytes)
            .await
            .map_err(|error| format!("Capsule bridge request could not be sent: {error}"))?;
        pipe.shutdown()
            .await
            .map_err(|error| format!("Capsule bridge connection could not be closed: {error}"))?;

        let mut reader = BufReader::new(pipe).take(MAX_REPLY_BYTES as u64);
        let mut reply = Vec::new();
        reader
            .read_until(b'\n', &mut reply)
            .await
            .map_err(|error| format!("Capsule bridge response could not be read: {error}"))?;
        if reply.len() >= MAX_REPLY_BYTES || reply.last() != Some(&b'\n') {
            return Err(
                "Capsule browser sent an invalid or oversized bridge response.".to_string(),
            );
        }
        let value: Value = serde_json::from_slice(&reply[..reply.len() - 1])
            .map_err(|_| "Capsule browser sent malformed bridge data.".to_string())?;
        if value.get("contractVersion").and_then(Value::as_u64) != Some(u64::from(CONTRACT_VERSION))
        {
            return Err("Capsule browser returned an incompatible companion contract.".to_string());
        }
        if value.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Capsule browser rejected the request.")
                .to_string());
        }
        Ok(value)
    })
    .await
    .map_err(|_| "Capsule browser bridge request timed out.".to_string())?
}

#[command]
pub async fn get_browser_snapshot() -> Result<Value, String> {
    let response = request_browser("snapshot", json!({}), REQUEST_TIMEOUT).await?;
    Ok(response.get("snapshot").cloned().ok_or_else(|| {
        "Capsule browser response did not contain a workspace snapshot.".to_string()
    })?)
}

#[command]
pub async fn route_browser_task(task_id: u32) -> Result<Value, String> {
    request_browser(
        "route-catalog-task",
        json!({ "taskId": task_id }),
        REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn get_assistant_status() -> Result<Value, String> {
    request_browser("assistant-status", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn orchestrator_action(action: String, payload: Value) -> Result<Value, String> {
    request_browser("orchestrator", json!({ "action": action, "payload": payload }), Duration::from_secs(8)).await
}

#[command]
pub async fn bible_reference_action(action: String, payload: Value) -> Result<Value, String> {
    request_browser("bible-reference", json!({ "action": action, "payload": payload }), Duration::from_secs(8)).await
}

#[command]
pub async fn workspace_autonomy_action(action: String) -> Result<Value, String> {
    if !["status", "revoke", "undo"].contains(&action.as_str()) {
        return Err("Workspace authorization requires the native folder picker.".into());
    }
    request_browser("workspace-access", json!({"action":action,"payload":{}}), Duration::from_secs(8)).await
}

#[command]
pub async fn authorize_document_workspace(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Authorize reversible document edits in this project folder").blocking_pick_folder()
    }).await.map_err(|error| error.to_string())?;
    let Some(folder) = folder else { return Ok(json!({"ok":true,"cancelled":true})); };
    let folder = folder.into_path().map_err(|error| error.to_string())?;
    request_browser("workspace-access", json!({"action":"grant","payload":{"folder":folder,"confirmed":true}}), Duration::from_secs(8)).await
}

#[command]
pub async fn inspect_agent_runtime() -> Result<Value, String> {
    request_browser("agent-runtime-inspect", json!({}), Duration::from_secs(35)).await
}

#[command]
pub async fn configure_agent_runtime(settings: Value) -> Result<Value, String> {
    request_browser("agent-runtime-configure", json!({ "settings": settings }), Duration::from_secs(25)).await
}

#[command]
pub async fn manage_wsl_distribution(action: String, distro: String, confirmed: bool) -> Result<Value, String> {
    request_browser("wsl-distribution-action", json!({
        "action": action, "distro": distro, "confirmed": confirmed
    }), Duration::from_secs(35)).await
}

#[command]
pub async fn get_assistant_catalog() -> Result<Value, String> {
    request_browser("assistant-catalog", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn load_assistant_model(model_id: String) -> Result<Value, String> {
    request_browser(
        "assistant-load-model",
        json!({ "modelId": model_id }),
        MODEL_REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn unload_assistant_model() -> Result<Value, String> {
    request_browser("assistant-unload-model", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn download_assistant_model(model_id: String) -> Result<Value, String> {
    request_browser(
        "assistant-download-model",
        json!({ "modelId": model_id }),
        REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn cancel_assistant_model_download() -> Result<Value, String> {
    request_browser("assistant-cancel-download", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn propose_appearance_tweaks(goal: String, settings: Value) -> Result<Value, String> {
    request_browser(
        "appearance-tweak-proposals",
        json!({ "goal": goal, "settings": settings }),
        MODEL_REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn propose_scene_html_edit(source: String, goal: String) -> Result<Value, String> {
    request_browser("scene-html-edit", json!({ "source": source, "goal": goal }), MODEL_REQUEST_TIMEOUT).await
}

#[command]
pub async fn inspect_mod_package(file_path: String) -> Result<Value, String> {
    request_browser(
        "mod-inspect-package",
        json!({ "filePath": file_path }),
        REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn start_mod_analysis() -> Result<Value, String> {
    request_browser("mod-analysis-start", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn list_approved_learning() -> Result<Value, String> {
    request_browser("learning-list", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn review_cache_status() -> Result<Value, String> {
    request_browser("review-cache-status", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn clear_review_cache(confirmed: bool) -> Result<Value, String> {
    request_browser("review-cache-clear", json!({ "confirmed": confirmed }), REQUEST_TIMEOUT).await
}

#[command]
pub async fn approve_source_lesson(
    finding_id: String, source_sha256: String, text: String, category: String, confirmed: bool,
) -> Result<Value, String> {
    request_browser("learning-approve", json!({
        "findingId": finding_id, "sourceSha256": source_sha256,
        "text": text, "category": category, "confirmed": confirmed,
    }), REQUEST_TIMEOUT).await
}

#[command]
pub async fn forget_source_lesson(lesson_id: String) -> Result<Value, String> {
    request_browser("learning-forget", json!({ "lessonId": lesson_id }), REQUEST_TIMEOUT).await
}

#[command]
pub async fn get_mod_analysis_status(job_id: String) -> Result<Value, String> {
    request_browser(
        "mod-analysis-status",
        json!({ "jobId": job_id }),
        REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn save_mod_auditor_proposal(finding_ids: Vec<String>) -> Result<Value, String> {
    request_browser(
        "mod-save-auditor-proposal",
        json!({ "findingIds": finding_ids }),
        REQUEST_TIMEOUT,
    )
    .await
}

#[command]
pub async fn list_mod_kernel_proposals() -> Result<Value, String> {
    request_browser("mod-list-kernel-proposals", json!({}), REQUEST_TIMEOUT).await
}

#[command]
pub async fn create_mod_kernel_proposal(
    name: String,
    parent_id: Option<String>,
) -> Result<Value, String> {
    request_browser(
        "mod-create-kernel-proposal",
        json!({ "name": name, "parentId": parent_id }),
        MODEL_REQUEST_TIMEOUT,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::valid_operation_fields;
    use serde_json::json;

    #[test]
    fn workflow_and_workspace_contracts_do_not_accept_tools_or_implicit_grants() {
        assert!(valid_operation_fields("bible-reference", &json!({"action":"status","payload":{}})));
        assert!(valid_operation_fields("bible-reference", &json!({"action":"configure","payload":{"enabled":false}})));
        assert!(valid_operation_fields("bible-reference", &json!({"action":"verse","payload":{"citation":"1 Corinthians 13:4"}})));
        assert!(!valid_operation_fields("bible-reference", &json!({"action":"configure","payload":{"enabled":true,"folder":"anything"}})));
        assert!(!valid_operation_fields("bible-reference", &json!({"action":"execute","payload":{}})));
        assert!(valid_operation_fields("orchestrator", &json!({"action":"start","payload":{"goal":"Improve a document","maxCycles":3,"confirmed":true}})));
        assert!(!valid_operation_fields("orchestrator", &json!({"action":"start","payload":{"goal":"Improve a document","maxCycles":4,"confirmed":true}})));
        assert!(!valid_operation_fields("orchestrator", &json!({"action":"apply","payload":{}})));
        for action in ["status", "revoke", "undo"] {
            assert!(valid_operation_fields("workspace-access", &json!({"action":action,"payload":{}})));
            assert!(!valid_operation_fields("workspace-access", &json!({"action":action,"payload":{"file":"anything"}})));
        }
        assert!(valid_operation_fields("workspace-access", &json!({"action":"grant","payload":{"folder":std::env::temp_dir(),"confirmed":true}})));
        assert!(!valid_operation_fields("workspace-access", &json!({"action":"grant","payload":{"folder":std::env::temp_dir(),"confirmed":false}})));
        assert!(!valid_operation_fields("workspace-access", &json!({"action":"grant","payload":{"folder":"relative","confirmed":true}})));
        assert!(!valid_operation_fields("workspace-access", &json!({"action":"execute","payload":{}})));
    }

    #[test]
    fn local_assistant_surface_matches_learning_and_cache_contracts() {
        let catalog: Vec<serde_json::Value> = serde_json::from_str(include_str!("..\\..\\assistant\\model-catalog.json")).unwrap();
        for model in catalog {
            for operation in ["assistant-load-model", "assistant-download-model"] {
                assert!(valid_operation_fields(operation, &json!({"modelId": model["id"]})));
                assert!(!valid_operation_fields(operation, &json!({"modelId": "../arbitrary"})));
            }
        }
        for operation in ["learning-list", "review-cache-status", "assistant-unload-model"] {
            assert!(valid_operation_fields(operation, &json!({})));
            assert!(!valid_operation_fields(operation, &json!({"command": "anything"})));
        }
        assert!(valid_operation_fields("learning-forget", &json!({"lessonId": "12345678-1234-1234-1234-123456789abc"})));
        let valid = json!({
            "findingId": "review-1", "sourceSha256": "a".repeat(64),
            "text": "Use semantic headings.", "category": "structure", "confirmed": true
        });
        assert!(valid_operation_fields("learning-approve", &valid));
        for (key, value) in [("confirmed", json!(false)), ("category", json!("shell")), ("text", json!("x".repeat(601)))] {
            let mut invalid = valid.clone();
            invalid[key] = value;
            assert!(!valid_operation_fields("learning-approve", &invalid));
        }
        assert!(valid_operation_fields("review-cache-clear", &json!({"confirmed": true})));
        assert!(!valid_operation_fields("review-cache-clear", &json!({"confirmed": false})));
    }
    #[test]
    fn wsl_operations_require_exact_settings_and_confirmed_scoped_actions() {
        assert!(valid_operation_fields("agent-runtime-inspect", &json!({})));
        assert!(valid_operation_fields("agent-runtime-configure", &json!({
            "settings": { "policy": "prefer-wsl", "distro": "Pengwin" }
        })));
        assert!(!valid_operation_fields("agent-runtime-configure", &json!({
            "settings": { "policy": "prefer-wsl", "distro": "Pengwin", "shell": "bash" }
        })));
        assert!(valid_operation_fields("wsl-distribution-action", &json!({
            "action": "stop", "distro": "Pengwin", "confirmed": true
        })));
        for action in ["shutdown", "unregister", "install", "exec"] {
            assert!(!valid_operation_fields("wsl-distribution-action", &json!({
                "action": action, "distro": "Pengwin", "confirmed": true
            })));
        }
        assert!(!valid_operation_fields("wsl-distribution-action", &json!({
            "action": "stop", "distro": "Pengwin", "confirmed": false
        })));
        assert!(!valid_operation_fields("wsl-distribution-action", &json!({
            "action": "start", "distro": "--exec", "confirmed": true
        })));
    }

    #[test]
    fn appearance_proposals_accept_only_the_two_bounded_settings() {
        assert!(valid_operation_fields(
            "appearance-tweak-proposals",
            &json!({
                "goal": "Reduce window motion",
                "settings": {
                    "transparency": true,
                    "windowAnimations": false
                }
            })
        ));
        assert!(!valid_operation_fields(
            "appearance-tweak-proposals",
            &json!({
                "goal": "Reduce motion",
                "settings": {
                    "transparency": true,
                    "windowAnimations": false,
                    "command": "whoami"
                }
            })
        ));
        assert!(!valid_operation_fields(
            "appearance-tweak-proposals",
            &json!({
                "goal": "Reduce motion",
                "settings": {
                    "transparency": "on",
                    "windowAnimations": false
                }
            })
        ));
    }
}
