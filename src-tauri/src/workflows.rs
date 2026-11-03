use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

const MAX_WORKFLOWS: usize = 100;
const MAX_STEPS: usize = 20;
const MAX_NAME_CHARS: usize = 80;
const MAX_DESCRIPTION_CHARS: usize = 240;
const MAX_STEP_CHARS: usize = 240;
const MAX_STORE_BYTES: usize = 512 * 1024;
static ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserWorkflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDraft {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub steps: Vec<String>,
}

#[derive(Deserialize, Serialize)]
struct WorkflowDocument {
    version: u32,
    workflows: Vec<UserWorkflow>,
}

fn workflows_path() -> Result<PathBuf, String> {
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "Windows roaming app-data is unavailable.".to_string())?;
    Ok(PathBuf::from(app_data)
        .join("Capsule OS")
        .join("workflows.json"))
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

fn new_workflow_id(timestamp: u64) -> String {
    format!(
        "workflow-{}-{timestamp}-{}",
        std::process::id(),
        ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

fn valid_workflow(workflow: &UserWorkflow) -> bool {
    !workflow.id.is_empty()
        && workflow.id.len() <= 80
        && workflow
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        && !workflow.name.trim().is_empty()
        && workflow.name.chars().count() <= MAX_NAME_CHARS
        && workflow.description.chars().count() <= MAX_DESCRIPTION_CHARS
        && !workflow.steps.is_empty()
        && workflow.steps.len() <= MAX_STEPS
        && workflow
            .steps
            .iter()
            .all(|step| !step.trim().is_empty() && step.chars().count() <= MAX_STEP_CHARS)
}

fn validate_document(document: &WorkflowDocument) -> Result<(), String> {
    if document.version != 1
        || document.workflows.len() > MAX_WORKFLOWS
        || document
            .workflows
            .iter()
            .any(|workflow| !valid_workflow(workflow))
    {
        return Err("The local workflow library is invalid or exceeds its limits.".to_string());
    }
    let mut ids = document
        .workflows
        .iter()
        .map(|workflow| workflow.id.as_str())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    if ids.len() != document.workflows.len() {
        return Err("The local workflow library contains duplicate IDs.".to_string());
    }
    Ok(())
}

async fn load_document() -> Result<WorkflowDocument, String> {
    let path = workflows_path()?;
    let content = match tokio::fs::read(path).await {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(WorkflowDocument {
                version: 1,
                workflows: Vec::new(),
            });
        }
        Err(error) => return Err(format!("Unable to read local workflows: {error}")),
    };
    if content.len() > MAX_STORE_BYTES {
        return Err("The local workflow library exceeds the size limit.".to_string());
    }
    let document: WorkflowDocument = serde_json::from_slice(&content)
        .map_err(|_| "The local workflow library is malformed.".to_string())?;
    validate_document(&document)?;
    Ok(document)
}

async fn store_document(document: &WorkflowDocument) -> Result<(), String> {
    validate_document(document)?;
    let path = workflows_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "The local workflow library path is invalid.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Unable to create the local Capsule data folder: {error}"))?;
    let content = serde_json::to_vec_pretty(document)
        .map_err(|error| format!("Unable to serialize local workflows: {error}"))?;
    if content.len() > MAX_STORE_BYTES {
        return Err("The local workflow library exceeds the size limit.".to_string());
    }
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, content)
        .await
        .map_err(|error| format!("Unable to write the local workflow library: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("Unable to save the local workflow library: {error}"))
}

#[command]
pub async fn list_user_workflows() -> Result<Vec<UserWorkflow>, String> {
    Ok(load_document().await?.workflows)
}

#[command]
pub async fn save_user_workflow(draft: WorkflowDraft) -> Result<UserWorkflow, String> {
    let name = draft.name.trim().to_string();
    let description = draft.description.trim().to_string();
    let steps = draft
        .steps
        .into_iter()
        .map(|step| step.trim().to_string())
        .collect::<Vec<_>>();
    if name.is_empty()
        || name.chars().count() > MAX_NAME_CHARS
        || description.chars().count() > MAX_DESCRIPTION_CHARS
        || steps.is_empty()
        || steps.len() > MAX_STEPS
        || steps
            .iter()
            .any(|step| step.is_empty() || step.chars().count() > MAX_STEP_CHARS)
    {
        return Err(
            "Use a name up to 80 characters, a description up to 240, and 1–20 steps up to 240 characters each."
                .to_string(),
        );
    }

    let mut document = load_document().await?;
    let now = now_millis();
    let workflow = if let Some(id) = draft.id {
        let current = document
            .workflows
            .iter_mut()
            .find(|workflow| workflow.id == id)
            .ok_or_else(|| "That workflow no longer exists in the local library.".to_string())?;
        current.name = name;
        current.description = description;
        current.steps = steps;
        current.updated_at = now;
        current.clone()
    } else {
        if document.workflows.len() >= MAX_WORKFLOWS {
            return Err("The local workflow library is full (100 workflows maximum).".to_string());
        }
        let workflow = UserWorkflow {
            id: new_workflow_id(now),
            name,
            description,
            steps,
            created_at: now,
            updated_at: now,
        };
        document.workflows.push(workflow.clone());
        workflow
    };
    store_document(&document).await?;
    Ok(workflow)
}

#[command]
pub async fn delete_user_workflow(workflow_id: String) -> Result<(), String> {
    let mut document = load_document().await?;
    let original_length = document.workflows.len();
    document
        .workflows
        .retain(|workflow| workflow.id != workflow_id);
    if document.workflows.len() == original_length {
        return Err("That workflow no longer exists in the local library.".to_string());
    }
    store_document(&document).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workflow(id: &str) -> UserWorkflow {
        UserWorkflow {
            id: id.to_string(),
            name: "Study plan".to_string(),
            description: "Organize a study session.".to_string(),
            steps: vec!["Choose a topic".to_string(), "Review notes".to_string()],
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn accepts_neutral_data_only_workflow() {
        assert!(
            validate_document(&WorkflowDocument {
                version: 1,
                workflows: vec![workflow("workflow-1")],
            })
            .is_ok()
        );
    }

    #[test]
    fn rejects_empty_steps_and_duplicate_ids() {
        let mut invalid = workflow("workflow-1");
        invalid.steps.clear();
        assert!(
            validate_document(&WorkflowDocument {
                version: 1,
                workflows: vec![invalid],
            })
            .is_err()
        );
        assert!(
            validate_document(&WorkflowDocument {
                version: 1,
                workflows: vec![workflow("workflow-1"), workflow("workflow-1")],
            })
            .is_err()
        );
    }
}
