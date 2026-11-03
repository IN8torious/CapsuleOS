use serde::{Deserialize, Serialize};
use std::io;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, command};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    HWND_BROADCAST, SMTO_ABORTIFHUNG, SendMessageTimeoutW, WM_SETTINGCHANGE,
};
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};

const THEME_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
const APP_THEME_VALUE: &str = "AppsUseLightTheme";
const SYSTEM_THEME_VALUE: &str = "SystemUsesLightTheme";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ThemeValues {
    apps_use_light_theme: Option<u32>,
    system_uses_light_theme: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreview {
    id: String,
    choice: String,
    before: ThemeValues,
    after: ThemeValues,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeReceipt {
    pub id: String,
    pub choice: String,
    pub before: ThemeValues,
    pub after: ThemeValues,
    pub changed_at: u64,
    pub rolled_back: bool,
}

#[derive(Default)]
pub struct CapsuleState {
    pending_theme: Mutex<Option<ThemePreview>>,
    pub visual_operation: tokio::sync::Mutex<()>,
}

fn read_value(key: &RegKey, name: &str) -> Result<Option<u32>, String> {
    match key.get_value::<u32, _>(name) {
        Ok(value) => Ok(Some(value)),
        Err(error) if matches!(error.raw_os_error(), Some(2) | Some(3)) => Ok(None),
        Err(error) => Err(format!(
            "Unable to read the approved Windows theme value: {error}"
        )),
    }
}

fn read_theme_values() -> Result<ThemeValues, String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let key = match user.open_subkey_with_flags(THEME_KEY, KEY_READ) {
        Ok(key) => key,
        Err(error) if matches!(error.raw_os_error(), Some(2) | Some(3)) => {
            return Ok(ThemeValues::default());
        }
        Err(error) => return Err(format!("Unable to inspect Windows theme settings: {error}")),
    };
    Ok(ThemeValues {
        apps_use_light_theme: read_value(&key, APP_THEME_VALUE)?,
        system_uses_light_theme: read_value(&key, SYSTEM_THEME_VALUE)?,
    })
}

fn write_value(key: &RegKey, name: &str, value: Option<u32>) -> Result<(), String> {
    match value {
        Some(value) => key
            .set_value(name, &value)
            .map_err(|error| format!("Unable to write the approved Windows theme value: {error}")),
        None => match key.delete_value(name) {
            Ok(()) => Ok(()),
            Err(error) if matches!(error.raw_os_error(), Some(2) | Some(3)) => Ok(()),
            Err(error) => Err(format!(
                "Unable to restore the previous Windows theme value: {error}"
            )),
        },
    }
}

fn write_theme_values(values: &ThemeValues) -> Result<(), String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = user
        .create_subkey_with_flags(THEME_KEY, KEY_READ | KEY_WRITE)
        .map_err(|error| {
            format!("Unable to open current-user personalization settings: {error}")
        })?;
    write_value(&key, APP_THEME_VALUE, values.apps_use_light_theme)?;
    if let Err(error) = write_value(&key, SYSTEM_THEME_VALUE, values.system_uses_light_theme) {
        return Err(error);
    }
    Ok(())
}

pub(crate) fn broadcast_theme_change() {
    let setting: Vec<u16> = "ImmersiveColorSet"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            setting.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            1000,
            std::ptr::null_mut(),
        );
    }
}

fn desired_theme(choice: &str) -> Result<ThemeValues, String> {
    let value = match choice {
        "dark" => 0,
        "light" => 1,
        _ => return Err("Choose either the Windows dark theme or light theme.".to_string()),
    };
    Ok(ThemeValues {
        apps_use_light_theme: Some(value),
        system_uses_light_theme: Some(value),
    })
}

fn receipt_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("windows-change-receipts.json"))
        .map_err(|error| format!("Unable to locate local Windows-change receipts: {error}"))
}

async fn read_receipts(app: &AppHandle) -> Result<Vec<ThemeReceipt>, String> {
    let path = receipt_path(app)?;
    let content = match tokio::fs::read(path).await {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Unable to read the Windows-change receipts: {error}"
            ));
        }
    };
    if content.len() > 256 * 1024 {
        return Err("Windows-change receipt history exceeds its safety limit.".to_string());
    }
    serde_json::from_slice(&content)
        .map_err(|_| "Windows-change receipt history is invalid.".to_string())
}

async fn append_receipt(app: &AppHandle, receipt: ThemeReceipt) -> Result<(), String> {
    let path = receipt_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Windows-change receipt path is invalid.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Unable to create the local receipt folder: {error}"))?;
    let mut receipts = read_receipts(app).await?;
    receipts.push(receipt);
    if receipts.len() > 200 {
        receipts.drain(..receipts.len() - 200);
    }
    let content = serde_json::to_vec_pretty(&receipts)
        .map_err(|error| format!("Unable to serialize Windows-change receipts: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, content)
        .await
        .map_err(|error| format!("Unable to write the Windows-change receipt: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("Unable to save the Windows-change receipt: {error}"))
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[command]
pub fn inspect_theme() -> Result<ThemeValues, String> {
    read_theme_values()
}

#[command]
pub async fn get_last_theme_receipt(app: AppHandle) -> Result<Option<ThemeReceipt>, String> {
    Ok(read_receipts(&app)
        .await?
        .into_iter()
        .rev()
        .find(|receipt| !receipt.rolled_back))
}

#[command]
pub fn preview_theme_change(
    choice: String,
    state: State<'_, CapsuleState>,
) -> Result<ThemePreview, String> {
    let after = desired_theme(&choice)?;
    let before = read_theme_values()?;
    if before == after {
        return Err(format!("Windows is already set to the {choice} theme."));
    }
    let id = format!(
        "theme-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let preview = ThemePreview {
        id,
        choice,
        before,
        after,
    };
    *state
        .pending_theme
        .lock()
        .map_err(|_| "Windows theme approval state is unavailable.".to_string())? =
        Some(preview.clone());
    Ok(preview)
}

#[command]
pub async fn apply_theme_change(
    app: AppHandle,
    preview_id: String,
    state: State<'_, CapsuleState>,
) -> Result<ThemeReceipt, String> {
    let _operation = state.visual_operation.lock().await;
    let preview = {
        let mut pending = state
            .pending_theme
            .lock()
            .map_err(|_| "Windows theme approval state is unavailable.".to_string())?;
        match pending.take() {
            Some(preview) if preview.id == preview_id => preview,
            Some(preview) => {
                *pending = Some(preview);
                return Err(
                    "The Windows change preview is stale. Review it again before approval."
                        .to_string(),
                );
            }
            None => return Err("No pending Windows change is awaiting approval.".to_string()),
        }
    };
    if read_theme_values()? != preview.before {
        return Err(
            "Windows theme settings changed since preview. Create a fresh preview.".to_string(),
        );
    }
    if let Err(error) = write_theme_values(&preview.after) {
        if let Err(rollback_error) = write_theme_values(&preview.before) {
            return Err(format!(
                "{error}; automatic recovery also failed: {rollback_error}"
            ));
        }
        return Err(error);
    }
    broadcast_theme_change();

    let receipt = ThemeReceipt {
        id: preview.id,
        choice: preview.choice,
        before: preview.before.clone(),
        after: preview.after,
        changed_at: timestamp(),
        rolled_back: false,
    };
    if let Err(error) = append_receipt(&app, receipt.clone()).await {
        if let Err(rollback_error) = write_theme_values(&preview.before) {
            return Err(format!(
                "{error}; automatic recovery also failed: {rollback_error}"
            ));
        }
        broadcast_theme_change();
        return Err(format!("{error}; the Windows theme was restored."));
    }
    Ok(receipt)
}

#[command]
pub async fn rollback_last_theme_change(app: AppHandle, state: State<'_, CapsuleState>) -> Result<ThemeReceipt, String> {
    let _operation = state.visual_operation.lock().await;
    let mut receipts = read_receipts(&app).await?;
    let receipt = receipts
        .iter()
        .rev()
        .find(|receipt| !receipt.rolled_back)
        .cloned()
        .ok_or_else(|| "There is no approved theme change available to roll back.".to_string())?;
    if read_theme_values()? != receipt.after {
        return Err(
            "Windows theme changed after the Capsule OS tweak. No values were overwritten."
                .to_string(),
        );
    }
    if let Err(error) = write_theme_values(&receipt.before) {
        if let Err(recovery_error) = write_theme_values(&receipt.after) {
            return Err(format!(
                "{error}; automatic recovery also failed: {recovery_error}"
            ));
        }
        return Err(error);
    }
    broadcast_theme_change();
    if let Some(record) = receipts
        .iter_mut()
        .rev()
        .find(|record| record.id == receipt.id)
    {
        record.rolled_back = true;
        record.changed_at = timestamp();
    }
    let path = receipt_path(&app)?;
    let content = serde_json::to_vec_pretty(&receipts)
        .map_err(|error| format!("Unable to serialize Windows-change receipts: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    if let Err(error) = tokio::fs::write(&temporary, &content).await {
        let recovery = write_theme_values(&receipt.after);
        return Err(format!(
            "Unable to write the rollback receipt: {error}; settings restored: {}",
            recovery.is_err()
        ));
    }

    if let Err(error) = tokio::fs::rename(&temporary, &path).await {
        let recovery = write_theme_values(&receipt.after);
        broadcast_theme_change();
        return Err(format!(
            "Unable to save the rollback receipt: {error}; settings restored: {}",
            recovery.is_err()
        ));
    }
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::{ThemeValues, desired_theme};

    #[test]
    fn theme_proposals_only_accept_declared_modes() {
        assert_eq!(
            desired_theme("dark").expect("dark is allowlisted"),
            ThemeValues {
                apps_use_light_theme: Some(0),
                system_uses_light_theme: Some(0),
            }
        );
        assert_eq!(
            desired_theme("light").expect("light is allowlisted"),
            ThemeValues {
                apps_use_light_theme: Some(1),
                system_uses_light_theme: Some(1),
            }
        );
        assert!(desired_theme("anything-else").is_err());
    }
}
