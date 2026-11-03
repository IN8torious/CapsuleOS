use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, command};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_OUTPUT: usize = 6000;

static BUSY: AtomicBool = AtomicBool::new(false);
static APPROVAL: Mutex<Option<RepairPreview>> = Mutex::new(None);
static APPROVAL_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn system_program(name: &str) -> Result<PathBuf, String> {
    let mut buffer = vec![0u16; 32768];
    let size = unsafe {
        windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32)
    } as usize;
    if size == 0 || size >= buffer.len() { return Err("Cannot locate the Windows system tools.".into()); }
    let directory = String::from_utf16(&buffer[..size]).map_err(|e| e.to_string())?;
    Ok(PathBuf::from(directory).join(name))
}

fn now() -> Result<u64, String> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairPreview {
    approval_id: String,
    task: String,
    kind: String,
    command: String,
    warning: String,
    created_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReceipt {
    id: String,
    task: String,
    kind: String,
    command: String,
    status: String,
    output: String,
    updated_at: u64,
}

fn receipt_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("repair-receipt.json"))
}

fn save_receipt(app: &AppHandle, receipt: &RepairReceipt) -> Result<(), String> {
    let file = receipt_path(app)?;
    std::fs::create_dir_all(file.parent().ok_or("Missing repair receipt directory.")?).map_err(|e| e.to_string())?;
    let temporary = file.with_extension("tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(receipt).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, file).map_err(|e| format!("Cannot save the repair receipt: {e}"))
}

#[command]
pub fn get_repair_receipt(app: AppHandle) -> Result<Option<RepairReceipt>, String> {
    let file = receipt_path(&app)?;
    let bytes = match std::fs::read(file) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read the repair receipt: {error}")),
    };
    if bytes.len() > 65536 { return Err("Repair receipt exceeds its size limit.".into()); }
    serde_json::from_slice(&bytes).map(Some).map_err(|e| format!("Invalid repair receipt: {e}"))
}

fn fixed_action(kind: &str, task: &str) -> Result<(PathBuf, Vec<String>), String> {
    match kind {
        "repair" => {
            let (program, args) = repair_command(task).ok_or("Choose a supported repair task.")?;
            Ok((system_program(program)?, args))
        }
        "security-fix" => {
            let script = fix_script(task).ok_or("Choose a supported security fix.")?;
            Ok((system_program("WindowsPowerShell\\v1.0\\powershell.exe")?, vec![
                "-NoProfile".into(), "-NonInteractive".into(), "-Command".into(),
                format!("$ErrorActionPreference = 'Stop'; {script}"),
            ]))
        }
        _ => Err("Choose a fixed repair or security action.".into()),
    }
}

#[command]
pub fn preview_repair(task_id: String, kind: String) -> Result<RepairPreview, String> {
    let (program, args) = fixed_action(&kind, &task_id)?;
    let created_at = now()?;
    let preview = RepairPreview {
        approval_id: format!("repair-{}-{created_at}-{}", std::process::id(), APPROVAL_SEQUENCE.fetch_add(1, Ordering::SeqCst)),
        task: task_id, kind,
        command: format!("\"{}\" {}", program.display(), args.join(" ")),
        warning: "Windows will request administrator consent for this fixed action only. Keep the app open. Repairs can take up to an hour, may need internet or a restart, and do not have automatic Undo. Cancelling UAC starts no action.".into(),
        created_at,
    };
    *APPROVAL.lock().map_err(|_| "Repair approval is unavailable.")? = Some(preview.clone());
    Ok(preview)
}

fn consume_approval(task: &str, kind: &str, approval_id: &str, confirmed: bool) -> Result<RepairPreview, String> {
    if !confirmed { return Err("Nothing was run because the action was not confirmed.".into()); }
    let preview = APPROVAL.lock().map_err(|_| "Repair approval is unavailable.")?.take()
        .ok_or("Preview the exact action before approving it.")?;
    if preview.approval_id != approval_id || preview.task != task || preview.kind != kind
        || now()?.saturating_sub(preview.created_at) > 5 * 60 * 1000 {
        return Err("The repair approval changed or expired. Review the current action again.".into());
    }
    Ok(preview)
}

// Fixed allowlist of read-mostly Windows repair tools. The frontend sends only an id.
fn repair_command(id: &str) -> Option<(&'static str, Vec<String>)> {
    let strings = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match id {
        "dism-check" => Some(("dism.exe", strings(&["/Online", "/Cleanup-Image", "/CheckHealth"]))),
        "dism-scan" => Some(("dism.exe", strings(&["/Online", "/Cleanup-Image", "/ScanHealth"]))),
        "dism-restore" => Some(("dism.exe", strings(&["/Online", "/Cleanup-Image", "/RestoreHealth"]))),
        "sfc-verify" => Some(("sfc.exe", strings(&["/verifyonly"]))),
        "sfc-scan" => Some(("sfc.exe", strings(&["/scannow"]))),
        "chkdsk-scan" => {
            let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string());
            let valid = drive.len() == 2 && drive.ends_with(':') && drive.chars().next().is_some_and(|c| c.is_ascii_alphabetic());
            if valid { Some(("chkdsk.exe", vec![drive, "/scan".to_string()])) } else { None }
        }
        _ => None,
    }
}

// Fixes only turn protections back on or refresh definitions; nothing is disabled or removed.
fn fix_script(id: &str) -> Option<&'static str> {
    match id {
        "firewall-on" => Some("Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True"),
        "defender-realtime-on" => Some("Set-MpPreference -DisableRealtimeMonitoring $false"),
        "defender-update" => Some("Update-MpSignature"),
        "defender-quick-scan" => Some("Start-MpScan -ScanType QuickScan"),
        "uac-on" => Some("Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -Name EnableLUA -Value 1"),
        _ => None,
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairResult {
    task: String,
    success: bool,
    output: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityState {
    report: serde_json::Value,
}

fn clean(bytes: &[u8]) -> String {
    let text: String = String::from_utf8_lossy(bytes).chars().filter(|c| *c != '\0' && *c != '\r').collect();
    let text = text.trim().to_string();
    if text.chars().count() > MAX_OUTPUT {
        let tail: String = text.chars().rev().take(MAX_OUTPUT).collect::<Vec<_>>().into_iter().rev().collect();
        format!("…{tail}")
    } else {
        text
    }
}

fn run(program: &std::path::Path, args: &[String]) -> Result<RepairResult, String> {
    let output = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "Could not start the Windows tool.".to_string())?;
    let mut text = clean(&output.stdout);
    let err = clean(&output.stderr);
    if !err.is_empty() {
        text = format!("{text}\n{err}").trim().to_string();
    }
    Ok(RepairResult { task: String::new(), success: output.status.success(), output: text })
}

struct BusyGuard;
impl BusyGuard {
    fn acquire() -> Result<Self, String> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| BusyGuard)
            .map_err(|_| "Another repair is already running. Wait for it to finish.".to_string())
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

pub(crate) fn run_approved_helper(request: serde_json::Value) -> Result<RepairResult, String> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields, rename_all = "camelCase")]
    struct Request { mode: String, task_id: String }
    let request: Request = serde_json::from_value(request).map_err(|e| format!("Invalid approved repair: {e}"))?;
    let (program, args) = fixed_action(&request.mode, &request.task_id)?;
    if !crate::elevation::is_elevated()? { return Err("Administrator approval is required for this action.".into()); }
    let mut result = run(&program, &args)?;
    result.task = request.task_id;
    Ok(result)
}

async fn execute_approved(app: AppHandle, task: String, kind: &str, approval_id: String, confirmed: bool) -> Result<RepairResult, String> {
    let _guard = BusyGuard::acquire()?;
    let preview = consume_approval(&task, kind, &approval_id, confirmed)?;
    if get_repair_receipt(app.clone())?.is_some_and(|receipt| ["awaiting-admin", "running", "uncertain"].contains(&receipt.status.as_str())) {
        return Err("A previous repair has an unresolved receipt. Inspect Windows and the repair-receipt.json journal before attempting another action; do not start a duplicate repair.".into());
    }
    let mut receipt = RepairReceipt {
        id: preview.approval_id, task: task.clone(), kind: kind.into(), command: preview.command,
        status: "awaiting-admin".into(), output: String::new(), updated_at: now()?,
    };
    save_receipt(&app, &receipt)?;
    let mut channel = match crate::elevation::ApprovalChannel::connect().await {
        Ok(channel) => channel,
        Err(error) => {
            receipt.status = "not-started".into(); receipt.output = error.clone(); receipt.updated_at = now()?;
            save_receipt(&app, &receipt)?;
            return Err(error);
        }
    };
    receipt.status = "running".into(); receipt.updated_at = now()?;
    save_receipt(&app, &receipt)?;
    let result: Result<RepairResult, String> = channel.execute_with_timeout(
        &serde_json::json!({ "mode": kind, "taskId": task }), Duration::from_secs(60 * 60)
    ).await;
    receipt.updated_at = now()?;
    match &result {
        Ok(result) => {
            receipt.status = if result.success { "completed" } else { "failed" }.into();
            receipt.output = result.output.clone();
        }
        Err(error) => { receipt.status = "uncertain".into(); receipt.output = error.clone(); }
    }
    save_receipt(&app, &receipt).map_err(|e| format!("The action returned, but its final receipt could not be saved: {e}. Inspect the pending journal before retrying."))?;
    result
}

#[command]
pub async fn run_repair(app: AppHandle, task_id: String, approval_id: String, confirmed: bool) -> Result<RepairResult, String> {
    execute_approved(app, task_id, "repair", approval_id, confirmed).await
}

const SECURITY_REPORT: &str = "$d = Get-MpComputerStatus -ErrorAction SilentlyContinue; \
$f = Get-NetFirewallProfile -ErrorAction SilentlyContinue | Select-Object Name,Enabled; \
$u = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' -ErrorAction SilentlyContinue).EnableLUA; \
[pscustomobject]@{ \
defenderRealtime = if ($d) { [bool]$d.RealTimeProtectionEnabled } else { $null }; \
defenderAntivirus = if ($d) { [bool]$d.AntivirusEnabled } else { $null }; \
signatureAgeDays = if ($d) { [int]$d.AntivirusSignatureAge } else { $null }; \
firewall = @($f | ForEach-Object { [pscustomobject]@{ name = [string]$_.Name; enabled = [bool]$_.Enabled } }); \
uacEnabled = if ($null -ne $u) { [bool]$u } else { $null } \
} | ConvertTo-Json -Compress -Depth 4";

fn powershell(script: &str) -> Result<String, String> {
    let output = Command::new(system_program("WindowsPowerShell\\v1.0\\powershell.exe")?)
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "Could not start Windows PowerShell.".to_string())?;
    if output.status.success() {
        Ok(clean(&output.stdout))
    } else {
        let text = clean(&output.stderr).to_lowercase();
        if text.contains("denied") || text.contains("administrator") {
            Err("Windows did not permit this security inspection.".to_string())
        } else {
            Err("Windows did not accept the change.".to_string())
        }
    }
}

#[command]
pub async fn inspect_security() -> Result<SecurityState, String> {
    let text = tauri::async_runtime::spawn_blocking(|| powershell(SECURITY_REPORT))
        .await
        .map_err(|_| "The security check stopped unexpectedly.".to_string())??;
    let report = serde_json::from_str(&text).map_err(|e| format!("Windows returned an invalid security report: {e}"))?;
    Ok(SecurityState { report })
}

#[command]
pub async fn apply_security_fix(app: AppHandle, fix_id: String, approval_id: String, confirmed: bool) -> Result<RepairResult, String> {
    execute_approved(app, fix_id, "security-fix", approval_id, confirmed).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repair_approvals_are_action_specific_single_use_and_reject_shell_fields() {
        assert!(fixed_action("shell", "anything").is_err());
        assert!(fixed_action("repair", "dism.exe /Remove-Package").is_err());
        assert!(run_approved_helper(serde_json::json!({"mode":"repair", "taskId":"dism-check", "command":"anything"})).is_err());
        let preview = preview_repair("dism-check".into(), "repair".into()).unwrap();
        assert!(std::path::Path::new(preview.command.split('"').nth(1).unwrap()).is_absolute());
        assert!(consume_approval("sfc-scan", "repair", &preview.approval_id, true).is_err());
        let preview = preview_repair("sfc-verify".into(), "repair".into()).unwrap();
        assert!(consume_approval("sfc-verify", "repair", &preview.approval_id, false).is_err());
        assert!(consume_approval("sfc-verify", "repair", &preview.approval_id, true).is_ok());
        assert!(consume_approval("sfc-verify", "repair", &preview.approval_id, true).is_err());
        assert!(fixed_action("security-fix", "firewall-off").is_err());
    }
}
