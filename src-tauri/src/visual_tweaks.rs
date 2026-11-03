use serde::{Deserialize, Serialize};
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, command};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    HWND_BROADCAST, SMTO_ABORTIFHUNG, SendMessageTimeoutW, WM_SETTINGCHANGE,
};
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};

const PERSONALIZE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
const TRANSPARENCY_VALUE: &str = "EnableTransparency";
const WINDOW_METRICS_KEY: &str = r"Control Panel\Desktop\WindowMetrics";
const WINDOW_ANIMATION_VALUE: &str = "MinAnimate";
const MAX_RECEIPTS: usize = 200;
const MAX_RECEIPT_BYTES: usize = 256 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VisualSetting {
    Transparency,
    WindowAnimations,
}

impl VisualSetting {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "transparency" => Ok(Self::Transparency),
            "windowAnimations" => Ok(Self::WindowAnimations),
            _ => Err("Choose a supported appearance setting.".to_string()),
        }
    }

    fn registry_location(self) -> (&'static str, &'static str) {
        match self {
            Self::Transparency => (PERSONALIZE_KEY, TRANSPARENCY_VALUE),
            Self::WindowAnimations => (WINDOW_METRICS_KEY, WINDOW_ANIMATION_VALUE),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChangeSource {
    UserSwitch,
    AgentSuggestion,
}

impl ChangeSource {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "user-switch" => Ok(Self::UserSwitch),
            "agent-suggestion" => Ok(Self::AgentSuggestion),
            _ => Err("Change source is not supported.".to_string()),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTweakSnapshot {
    pub transparency: Option<bool>,
    pub window_animations: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualTweakReceipt {
    pub id: String,
    pub setting: VisualSetting,
    pub before: Option<bool>,
    pub after: bool,
    pub source: ChangeSource,
    #[serde(default)]
    pub reason: Option<String>,
    pub changed_at: u64,
    #[serde(default)]
    pub rolled_back_at: Option<u64>,
}

fn is_missing(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(2) | Some(3))
}

fn read_setting(setting: VisualSetting) -> Result<Option<bool>, String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let (path, name) = setting.registry_location();
    let key = match user.open_subkey_with_flags(path, KEY_READ) {
        Ok(key) => key,
        Err(error) if is_missing(&error) => return Ok(None),
        Err(error) => return Err(format!("Unable to inspect this Windows setting: {error}")),
    };

    match setting {
        VisualSetting::Transparency => match key.get_value::<u32, _>(name) {
            Ok(value @ 0..=1) => Ok(Some(value == 1)),
            Ok(_) => Err("Windows transparency setting has an unsupported value.".to_string()),
            Err(error) if is_missing(&error) => Ok(None),
            Err(error) => Err(format!("Unable to inspect Windows transparency: {error}")),
        },
        VisualSetting::WindowAnimations => match key.get_value::<String, _>(name) {
            Ok(value) if value == "0" => Ok(Some(false)),
            Ok(value) if value == "1" => Ok(Some(true)),
            Ok(_) => Err("Windows window-animation setting has an unsupported value.".to_string()),
            Err(error) if is_missing(&error) => Ok(None),
            Err(error) => Err(format!(
                "Unable to inspect Windows window animations: {error}"
            )),
        },
    }
}

fn write_setting(setting: VisualSetting, value: Option<bool>) -> Result<(), String> {
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let (path, name) = setting.registry_location();

    match value {
        Some(enabled) => {
            let (key, _) = user
                .create_subkey_with_flags(path, KEY_READ | KEY_WRITE)
                .map_err(|error| {
                    format!("Unable to open the current-user appearance setting: {error}")
                })?;
            match setting {
                VisualSetting::Transparency => key
                    .set_value(name, &u32::from(enabled))
                    .map_err(|error| format!("Unable to change Windows transparency: {error}")),
                VisualSetting::WindowAnimations => {
                    let value = if enabled { "1" } else { "0" };
                    key.set_value(name, &value.to_string())
                        .map_err(|error| format!("Unable to change window animations: {error}"))
                }
            }
        }
        None => {
            let key = match user.open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
                Ok(key) => key,
                Err(error) if is_missing(&error) => return Ok(()),
                Err(error) => {
                    return Err(format!(
                        "Unable to restore the previous Windows setting: {error}"
                    ));
                }
            };
            match key.delete_value(name) {
                Ok(()) => Ok(()),
                Err(error) if is_missing(&error) => Ok(()),
                Err(error) => Err(format!(
                    "Unable to restore the previous Windows setting: {error}"
                )),
            }
        }
    }
}

fn broadcast_setting_change(setting: VisualSetting) {
    let name = match setting {
        VisualSetting::Transparency => "ImmersiveColorSet",
        VisualSetting::WindowAnimations => "WindowMetrics",
    };
    let setting: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
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

pub(crate) fn broadcast_catalog_preference(id: &str) {
    match id {
        "dark-theme" => crate::windows_tweaks::broadcast_theme_change(),
        "no-transparency" => broadcast_setting_change(VisualSetting::Transparency),
        "no-window-animations" => broadcast_setting_change(VisualSetting::WindowAnimations),
        _ => {}
    }
}

fn receipt_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("visual-tweak-receipts.json"))
        .map_err(|error| format!("Unable to locate local appearance receipts: {error}"))
}

async fn read_receipts(app: &AppHandle) -> Result<Vec<VisualTweakReceipt>, String> {
    let content = match tokio::fs::read(receipt_path(app)?).await {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Unable to read appearance receipts: {error}")),
    };
    if content.len() > MAX_RECEIPT_BYTES {
        return Err("Appearance receipt history exceeds its safety limit.".to_string());
    }
    let receipts: Vec<VisualTweakReceipt> = serde_json::from_slice(&content)
        .map_err(|_| "Appearance receipt history is invalid.".to_string())?;
    if receipts.len() > MAX_RECEIPTS {
        return Err("Appearance receipt history exceeds its item limit.".to_string());
    }
    Ok(receipts)
}

async fn save_receipts(app: &AppHandle, receipts: &[VisualTweakReceipt]) -> Result<(), String> {
    let path = receipt_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Appearance receipt path is invalid.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Unable to create the local receipt folder: {error}"))?;
    let content = serde_json::to_vec_pretty(receipts)
        .map_err(|error| format!("Unable to serialize appearance receipts: {error}"))?;
    if content.len() > MAX_RECEIPT_BYTES {
        return Err("Appearance receipt history exceeds its safety limit.".to_string());
    }
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, content)
        .await
        .map_err(|error| format!("Unable to write the appearance receipt: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("Unable to save the appearance receipt: {error}"))
}

fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn check_expected_value(current: Option<bool>, expected: Option<bool>) -> Result<(), String> {
    if current == expected {
        Ok(())
    } else {
        Err(
            "Windows setting changed since inspection. Refresh and review it before applying."
                .to_string(),
        )
    }
}

fn receipt_id() -> String {
    format!(
        "visual-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

#[command]
pub async fn inspect_visual_tweaks(
    state: State<'_, super::windows_tweaks::CapsuleState>,
) -> Result<VisualTweakSnapshot, String> {
    let _operation = state.visual_operation.lock().await;
    Ok(VisualTweakSnapshot {
        transparency: read_setting(VisualSetting::Transparency)?,
        window_animations: read_setting(VisualSetting::WindowAnimations)?,
    })
}

#[command]
pub async fn get_visual_tweak_receipts(
    app: AppHandle,
    state: State<'_, super::windows_tweaks::CapsuleState>,
) -> Result<Vec<VisualTweakReceipt>, String> {
    let _operation = state.visual_operation.lock().await;
    read_receipts(&app).await
}

#[command]
pub async fn set_visual_tweak(
    setting: String,
    enabled: bool,
    expected_value: Option<bool>,
    source: String,
    reason: Option<String>,
    app: AppHandle,
    state: State<'_, super::windows_tweaks::CapsuleState>,
) -> Result<VisualTweakReceipt, String> {
    let setting = VisualSetting::parse(&setting)?;
    let source = ChangeSource::parse(&source)?;
    let reason = match (source, reason) {
        (ChangeSource::UserSwitch, None) => None,
        (ChangeSource::AgentSuggestion, Some(reason))
            if !reason.trim().is_empty() && reason.chars().count() <= 200 =>
        {
            Some(reason.trim().to_string())
        }
        _ => {
            return Err(
                "Provide a bounded reason only when applying an agent suggestion.".to_string(),
            );
        }
    };
    let _operation = state.visual_operation.lock().await;
    let mut receipts = read_receipts(&app).await?;
    let before = read_setting(setting)?;
    check_expected_value(before, expected_value)?;
    if before == Some(enabled) {
        return Err("Windows is already using that setting.".to_string());
    }

    if let Err(error) = write_setting(setting, Some(enabled)) {
        let recovery = write_setting(setting, before);
        return Err(match recovery {
            Ok(()) => error,
            Err(recovery_error) => format!("{error}; automatic recovery failed: {recovery_error}"),
        });
    }
    let verified = match read_setting(setting) {
        Ok(value) => value == Some(enabled),
        Err(error) => {
            let recovery = write_setting(setting, before);
            return Err(match recovery {
                Ok(()) => format!("{error}; the previous setting was restored."),
                Err(recovery_error) => {
                    format!("{error}; automatic recovery failed: {recovery_error}")
                }
            });
        }
    };
    if !verified {
        let recovery = write_setting(setting, before);
        return Err(match recovery {
            Ok(()) => {
                "Windows did not retain the requested value; the previous setting was restored."
                    .to_string()
            }
            Err(error) => format!(
                "Windows did not retain the requested value; automatic recovery failed: {error}"
            ),
        });
    }
    broadcast_setting_change(setting);

    let receipt = VisualTweakReceipt {
        id: receipt_id(),
        setting,
        before,
        after: enabled,
        source,
        reason,
        changed_at: timestamp(),
        rolled_back_at: None,
    };
    receipts.push(receipt.clone());
    if receipts.len() > MAX_RECEIPTS {
        receipts.drain(..receipts.len() - MAX_RECEIPTS);
    }
    if let Err(error) = save_receipts(&app, &receipts).await {
        let recovery = write_setting(setting, before);
        broadcast_setting_change(setting);
        return Err(match recovery {
            Ok(()) => format!("{error}; the Windows setting was restored."),
            Err(recovery_error) => format!("{error}; automatic recovery failed: {recovery_error}"),
        });
    }
    Ok(receipt)
}

#[command]
pub async fn rollback_visual_tweak(
    setting: String,
    app: AppHandle,
    state: State<'_, super::windows_tweaks::CapsuleState>,
) -> Result<VisualTweakReceipt, String> {
    let setting = VisualSetting::parse(&setting)?;
    let _operation = state.visual_operation.lock().await;
    let mut receipts = read_receipts(&app).await?;
    let index = receipts
        .iter()
        .rposition(|receipt| receipt.setting == setting && receipt.rolled_back_at.is_none())
        .ok_or_else(|| "There is no active change for this setting to roll back.".to_string())?;
    let receipt = receipts[index].clone();
    if read_setting(setting)? != Some(receipt.after) {
        return Err(
            "Windows setting changed after the Capsule tweak. No values were overwritten."
                .to_string(),
        );
    }
    if let Err(error) = write_setting(setting, receipt.before) {
        let recovery = write_setting(setting, Some(receipt.after));
        return Err(match recovery {
            Ok(()) => error,
            Err(recovery_error) => format!("{error}; automatic recovery failed: {recovery_error}"),
        });
    }
    let verified = match read_setting(setting) {
        Ok(value) => value == receipt.before,
        Err(error) => {
            let recovery = write_setting(setting, Some(receipt.after));
            return Err(match recovery {
                Ok(()) => format!("{error}; the applied setting was restored."),
                Err(recovery_error) => {
                    format!("{error}; automatic recovery failed: {recovery_error}")
                }
            });
        }
    };
    if !verified {
        let recovery = write_setting(setting, Some(receipt.after));
        return Err(match recovery {
            Ok(()) => {
                "Windows did not retain the previous value; the applied setting was restored."
                    .to_string()
            }
            Err(error) => format!(
                "Windows did not retain the previous value; automatic recovery failed: {error}"
            ),
        });
    }
    broadcast_setting_change(setting);
    receipts[index].rolled_back_at = Some(timestamp());
    if let Err(error) = save_receipts(&app, &receipts).await {
        let recovery = write_setting(setting, Some(receipt.after));
        broadcast_setting_change(setting);
        return Err(match recovery {
            Ok(()) => format!("{error}; the applied setting was restored."),
            Err(recovery_error) => format!("{error}; automatic recovery failed: {recovery_error}"),
        });
    }
    Ok(receipts[index].clone())
}

#[cfg(test)]
mod tests {
    use super::{ChangeSource, VisualSetting, check_expected_value};

    #[test]
    fn setting_and_source_inputs_are_fixed_allowlists() {
        assert_eq!(
            VisualSetting::parse("transparency").expect("transparency is supported"),
            VisualSetting::Transparency
        );
        assert_eq!(
            VisualSetting::parse("windowAnimations").expect("window animations are supported"),
            VisualSetting::WindowAnimations
        );
        assert!(VisualSetting::parse("registryPath").is_err());
        assert_eq!(
            ChangeSource::parse("agent-suggestion").expect("source is supported"),
            ChangeSource::AgentSuggestion
        );
        assert!(ChangeSource::parse("shell").is_err());
    }

    #[test]
    fn settings_change_only_if_the_inspected_value_is_still_current() {
        assert!(check_expected_value(Some(true), Some(true)).is_ok());
        assert!(check_expected_value(None, None).is_ok());
        assert!(check_expected_value(Some(false), Some(true)).is_err());
        assert!(check_expected_value(None, Some(false)).is_err());
    }
}
