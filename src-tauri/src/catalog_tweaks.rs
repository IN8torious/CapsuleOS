use crate::elevation::{ApprovalChannel, is_elevated};
use crate::windows_tweaks::CapsuleState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State, command};
use winreg::enums::{
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE, REG_DWORD, REG_SZ,
};
use winreg::{RegKey, RegValue};

#[derive(Clone, Debug, Deserialize)]
struct Tweak {
    id: String,
    title: String,
    values: Vec<ValueSpec>,
}

#[derive(Clone, Debug, Deserialize)]
struct ValueSpec {
    root: String,
    path: String,
    name: String,
    #[serde(rename = "type")]
    kind: String,
    apply: String,
    revert: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct SavedValue {
    kind: String,
    bytes: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    tweak_id: String,
    title: String,
    index: usize,
    location: String,
    before: Option<SavedValue>,
    after: SavedValue,
    desired: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub id: String,
    changes: Vec<Change>,
    needs_admin: bool,
    status: String,
}

#[derive(Default)]
pub struct CatalogState {
    preview: Mutex<Option<Batch>>,
}

fn catalog() -> Result<Vec<Tweak>, String> {
    serde_json::from_str(include_str!("../tweak-catalog.json"))
        .map_err(|e| format!("The built-in settings catalog is invalid: {e}"))
}

fn spec_for<'a>(all: &'a [Tweak], change: &Change) -> Result<&'a ValueSpec, String> {
    all.iter()
        .find(|t| t.id == change.tweak_id)
        .and_then(|t| t.values.get(change.index))
        .ok_or_else(|| "Receipt contains a setting outside the built-in allowlist.".to_string())
}

fn hive(spec: &ValueSpec) -> Result<RegKey, String> {
    match spec.root.as_str() {
        "HKCU" => Ok(RegKey::predef(HKEY_CURRENT_USER)),
        "HKLM" => Ok(RegKey::predef(HKEY_LOCAL_MACHINE)),
        _ => Err("Invalid built-in registry hive.".into()),
    }
}

fn missing(e: &std::io::Error) -> bool {
    matches!(e.raw_os_error(), Some(2) | Some(3))
}

fn read(spec: &ValueSpec) -> Result<Option<SavedValue>, String> {
    let key = match hive(spec)?.open_subkey_with_flags(&spec.path, KEY_READ) {
        Ok(key) => key,
        Err(e) if missing(&e) => return Ok(None),
        Err(e) => return Err(format!("Cannot inspect {}\\{}: {e}", spec.root, spec.path)),
    };
    match key.get_raw_value(&spec.name) {
        Ok(v) => {
            let kind = match v.vtype {
                REG_DWORD => "REG_DWORD",
                REG_SZ => "REG_SZ",
                _ => {
                    return Err(format!(
                        "{} has an unexpected registry type; no change allowed.",
                        spec.name
                    ));
                }
            };
            if v.bytes.len() > 4096 {
                return Err(format!(
                    "{} exceeds the registry snapshot size limit.",
                    spec.name
                ));
            }
            Ok(Some(SavedValue {
                kind: kind.into(),
                bytes: v.bytes.into_owned(),
            }))
        }
        Err(e) if missing(&e) => Ok(None),
        Err(e) => Err(format!("Cannot inspect {}: {e}", spec.name)),
    }
}

fn desired(spec: &ValueSpec) -> Result<SavedValue, String> {
    let bytes = match spec.kind.as_str() {
        "REG_DWORD" => spec
            .apply
            .parse::<u32>()
            .map_err(|e| format!("Invalid built-in DWORD: {e}"))?
            .to_le_bytes()
            .to_vec(),
        "REG_SZ" => spec
            .apply
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect(),
        _ => return Err("Unsupported built-in registry type.".into()),
    };
    Ok(SavedValue {
        kind: spec.kind.clone(),
        bytes,
    })
}

fn write(spec: &ValueSpec, value: &Option<SavedValue>) -> Result<(), String> {
    let error = |e| {
        format!(
            "Cannot change {}\\{}\\{}: {e}. Machine-wide settings require starting Capsule Toolbox as administrator.",
            spec.root, spec.path, spec.name
        )
    };
    match value {
        Some(v) => {
            let kind = match v.kind.as_str() {
                "REG_DWORD" => REG_DWORD,
                "REG_SZ" => REG_SZ,
                _ => return Err("Unsupported receipt registry type.".into()),
            };
            let (key, _) = hive(spec)?
                .create_subkey_with_flags(&spec.path, KEY_READ | KEY_WRITE)
                .map_err(error)?;
            key.set_raw_value(
                &spec.name,
                &RegValue {
                    vtype: kind,
                    bytes: v.bytes.clone().into(),
                },
            )
            .map_err(error)
        }
        None => {
            let key = match hive(spec)?.open_subkey_with_flags(&spec.path, KEY_READ | KEY_WRITE) {
                Ok(k) => k,
                Err(e) if missing(&e) => return Ok(()),
                Err(e) => return Err(error(e)),
            };
            match key.delete_value(&spec.name) {
                Ok(()) => Ok(()),
                Err(e) if missing(&e) => Ok(()),
                Err(e) => Err(error(e)),
            }
        }
    }
}

fn save(app: &AppHandle, batch: &Batch) -> Result<(), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create settings receipt folder: {e}"))?;
    let bytes = serde_json::to_vec_pretty(batch).map_err(|e| e.to_string())?;
    let temp = dir.join("catalog-settings.json.tmp");
    std::fs::write(&temp, bytes).map_err(|e| format!("Cannot write settings receipt: {e}"))?;
    std::fs::rename(temp, dir.join("catalog-settings.json"))
        .map_err(|e| format!("Cannot save settings receipt: {e}"))
}

fn load(app: &AppHandle) -> Result<Option<Batch>, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("catalog-settings.json");
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if missing(&e) => return Ok(None),
        Err(e) => return Err(format!("Cannot read settings receipt: {e}")),
    };
    if bytes.len() > 1024 * 1024 {
        return Err("Settings receipt is too large.".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("Invalid settings receipt: {e}"))
}

fn restore(all: &[Tweak], changes: &[Change]) -> Result<(), String> {
    let result = restore_with(all, changes, read, write);
    notify_preferences(changes);
    result
}

fn notify_preferences(changes: &[Change]) {
    let ids: std::collections::HashSet<&str> = changes
        .iter()
        .map(|change| change.tweak_id.as_str())
        .collect();
    for id in ids {
        crate::visual_tweaks::broadcast_catalog_preference(id);
    }
}

fn restore_with(
    all: &[Tweak],
    changes: &[Change],
    mut read_value: impl FnMut(&ValueSpec) -> Result<Option<SavedValue>, String>,
    mut write_value: impl FnMut(&ValueSpec, &Option<SavedValue>) -> Result<(), String>,
) -> Result<(), String> {
    let mut errors = Vec::new();
    for change in changes.iter().rev() {
        let result = (|| {
            let spec = spec_for(all, change)?;
            let current = read_value(spec)?;
            if current == change.before {
                return Ok(());
            }
            if current != Some(change.after.clone()) {
                return Err(
                    "A newer registry value was found; it was not overwritten during recovery."
                        .to_string(),
                );
            }
            write_value(spec, &change.before)?;
            if read_value(spec)? != change.before {
                return Err("Restore verification failed.".to_string());
            }
            Ok(())
        })();
        if let Err(e) = result {
            errors.push(format!("{}: {e}", change.title));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

fn apply_with(
    all: &[Tweak],
    changes: &[Change],
    mut read_value: impl FnMut(&ValueSpec) -> Result<Option<SavedValue>, String>,
    mut write_value: impl FnMut(&ValueSpec, &Option<SavedValue>) -> Result<(), String>,
) -> (usize, Result<(), String>) {
    let mut attempted = 0;
    let result = (|| {
        for change in changes {
            let spec = spec_for(all, change)?;
            if read_value(spec)? != change.before {
                return Err(format!(
                    "{} changed during the batch; no newer value was overwritten.",
                    change.title
                ));
            }
            attempted += 1;
            if change.before == Some(change.after.clone()) {
                continue;
            }
            write_value(spec, &Some(change.after.clone()))?;
            if read_value(spec)? != Some(change.after.clone()) {
                return Err(format!(
                    "{} did not retain the requested registry value.",
                    change.title
                ));
            }
        }
        Ok(())
    })();
    (attempted, result)
}

#[derive(Serialize, Deserialize)]
pub(crate) struct HelperOutcome {
    status: String,
    error: Option<String>,
}

fn validate_batch(all: &[Tweak], batch: &Batch) -> Result<(), String> {
    if batch.changes.is_empty() || batch.changes.len() > 200 {
        return Err("Invalid approved settings count.".into());
    }
    let mut targets = std::collections::HashSet::new();
    for change in &batch.changes {
        let spec = spec_for(all, change)?;
        if !targets.insert((change.tweak_id.clone(), change.index))
            || !approved_after(spec, change)?
            || change.before.as_ref().is_some_and(|v| {
                v.bytes.len() > 4096 || !["REG_DWORD", "REG_SZ"].contains(&v.kind.as_str())
            })
        {
            return Err("Approved values do not match the fixed settings catalog.".into());
        }
    }
    Ok(())
}

fn approved_after(spec: &ValueSpec, change: &Change) -> Result<bool, String> {
    if change.after == desired(spec)? {
        return Ok(change.desired == spec.apply);
    }
    if !["dark-theme", "no-transparency", "no-window-animations"]
        .contains(&change.tweak_id.as_str())
    {
        return Ok(false);
    }
    let Some(value) = &spec.revert else {
        return Ok(false);
    };
    let reverse = ValueSpec {
        apply: value.clone(),
        ..spec.clone()
    };
    Ok(change.after == desired(&reverse)? && change.desired == *value)
}

pub(crate) fn run_approved_helper(request: serde_json::Value) -> Result<HelperOutcome, String> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Request {
        mode: String,
        batch: Batch,
    }
    let request: Request =
        serde_json::from_value(request).map_err(|e| format!("Invalid approved request: {e}"))?;
    let all = catalog()?;
    validate_batch(&all, &request.batch)?;
    let changes = &request.batch.changes;
    match request.mode.as_str() {
        "apply" => {
            if changes
                .iter()
                .any(|change| change.tweak_id == "no-power-throttling")
            {
                crate::performance_device::require_ac_for_throttling_override()?;
            }
            for change in changes {
                if read(spec_for(&all, change)?)? != change.before {
                    return Err(format!(
                        "{} changed before administrator approval completed. No settings were applied.",
                        change.title
                    ));
                }
            }
            let (attempted, result) = apply_with(&all, changes, read, write);
            match result {
                Ok(()) => {
                    notify_preferences(changes);
                    Ok(HelperOutcome {
                        status: "applied".into(),
                        error: None,
                    })
                }
                Err(error) => {
                    let recovery = restore(&all, &changes[..attempted]);
                    Ok(HelperOutcome {
                        status: if recovery.is_ok() {
                            "recovered"
                        } else {
                            "recovery-needed"
                        }
                        .into(),
                        error: Some(format!(
                            "{error}; recovery: {}",
                            recovery
                                .map(|_| "original values restored".into())
                                .unwrap_or_else(|e| e)
                        )),
                    })
                }
            }
        }
        "undo" => {
            for change in changes {
                let current = read(spec_for(&all, change)?)?;
                if current != Some(change.after.clone()) && current != change.before {
                    return Err(format!(
                        "{} has a newer value; rollback did not overwrite it.",
                        change.title
                    ));
                }
            }
            match restore(&all, changes) {
                Ok(()) => Ok(HelperOutcome {
                    status: "rolled-back".into(),
                    error: None,
                }),
                Err(error) => Ok(HelperOutcome {
                    status: "recovery-needed".into(),
                    error: Some(error),
                }),
            }
        }
        _ => Err("The helper supports only approved catalog apply and undo operations.".into()),
    }
}

async fn execute_approved(app: &AppHandle, batch: &mut Batch, mode: &str) -> Result<(), String> {
    let mut channel = if is_elevated()? {
        None
    } else {
        Some(ApprovalChannel::connect().await?)
    };
    batch.status = "pending".into();
    save(app, batch)?;
    let request = serde_json::json!({ "mode": mode, "batch": batch });
    let result: Result<HelperOutcome, String> = match channel.as_mut() {
        Some(channel) => channel.execute(&request).await,
        None => run_approved_helper(request),
    };
    let outcome = match result {
        Ok(outcome) => outcome,
        Err(error) => {
            batch.status = "recovery-needed".into();
            let receipt = save(app, batch);
            return Err(format!(
                "{error}; the batch is blocked pending guarded Undo recovery; receipt: {}",
                receipt.map(|_| "saved".to_string()).unwrap_or_else(|e| e)
            ));
        }
    };
    batch.status = outcome.status;
    if let Err(error) = save(app, batch) {
        return Err(format!(
            "{error}. Use Undo last batch before another change; the pending journal was preserved."
        ));
    }
    if let Some(error) = outcome.error {
        return Err(error);
    }
    Ok(())
}

#[command]
pub fn inspect_catalog_tweaks(ids: Vec<String>) -> Result<Batch, String> {
    let all = catalog()?;
    if ids.is_empty() || ids.len() > all.len() {
        return Err("Select between one and the catalog's maximum number of settings.".into());
    }
    let mut changes = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut needs_admin = false;
    for id in ids {
        if !seen.insert(id.clone()) {
            return Err("Duplicate setting selected.".into());
        }
        let tweak = all
            .iter()
            .find(|t| t.id == id)
            .ok_or("Unknown setting id.")?;
        for (index, spec) in tweak.values.iter().enumerate() {
            needs_admin |= spec.root == "HKLM";
            changes.push(Change {
                tweak_id: id.clone(),
                title: tweak.title.clone(),
                index,
                location: format!("{}\\{}\\{}", spec.root, spec.path, spec.name),
                before: read(spec)?,
                after: desired(spec)?,
                desired: spec.apply.clone(),
            });
        }
    }
    let batch = Batch {
        id: format!(
            "settings-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos()
        ),
        changes,
        needs_admin,
        status: "preview".into(),
    };
    Ok(batch)
}

#[command]
pub fn preview_catalog_tweaks(
    ids: Vec<String>,
    state: State<'_, CatalogState>,
) -> Result<Batch, String> {
    let batch = inspect_catalog_tweaks(ids)?;
    *state.preview.lock().map_err(|e| e.to_string())? = Some(batch.clone());
    Ok(batch)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppearanceChoice {
    setting: String,
    enabled: bool,
}

#[command]
pub fn preview_appearance_settings(
    settings: Vec<AppearanceChoice>,
    state: State<'_, CatalogState>,
) -> Result<Batch, String> {
    if settings.is_empty() || settings.len() > 3 {
        return Err("Choose one to three appearance preferences.".into());
    }
    let mut choices = std::collections::HashMap::new();
    for choice in settings {
        let (id, apply) = match choice.setting.as_str() {
            "theme" => ("dark-theme", choice.enabled),
            "transparency" => ("no-transparency", !choice.enabled),
            "windowAnimations" => ("no-window-animations", !choice.enabled),
            _ => return Err("Unknown appearance preference.".into()),
        };
        if choices.insert(id.to_string(), apply).is_some() {
            return Err("Duplicate appearance preference.".into());
        }
    }
    let mut batch = inspect_catalog_tweaks(choices.keys().cloned().collect())?;
    let all = catalog()?;
    for change in &mut batch.changes {
        if !choices[&change.tweak_id] {
            let spec = spec_for(&all, change)?;
            let value = spec
                .revert
                .clone()
                .ok_or("Appearance default is not defined.")?;
            let reverse = ValueSpec {
                apply: value.clone(),
                ..spec.clone()
            };
            change.after = desired(&reverse)?;
            change.desired = value;
        }
    }
    validate_batch(&all, &batch)?;
    *state.preview.lock().map_err(|e| e.to_string())? = Some(batch.clone());
    Ok(batch)
}

#[command]
pub async fn apply_catalog_tweaks(
    app: AppHandle,
    preview_id: String,
    confirmed: bool,
    state: State<'_, CatalogState>,
    windows: State<'_, CapsuleState>,
) -> Result<Batch, String> {
    if !confirmed {
        return Err("Settings were not confirmed; nothing changed.".into());
    }
    let _guard = windows.visual_operation.lock().await;
    if let Some(previous) = load(&app)? {
        if ["pending", "recovery-needed"].contains(&previous.status.as_str()) {
            return Err("The previous batch needs recovery. Use Undo last batch before applying new settings.".into());
        }
    }
    let mut batch = {
        let mut pending = state.preview.lock().map_err(|e| e.to_string())?;
        if pending.as_ref().map(|b| b.id.as_str()) != Some(preview_id.as_str()) {
            return Err("Settings preview is stale. Review the selection again.".into());
        }
        pending.take().ok_or("No pending settings preview.")?
    };
    let all = catalog()?;
    validate_batch(&all, &batch)?;
    for change in &batch.changes {
        if read(spec_for(&all, change)?)? != change.before {
            return Err(format!(
                "{} changed since preview. No settings were applied; review again.",
                change.title
            ));
        }
    }
    execute_approved(&app, &mut batch, "apply").await?;
    Ok(batch)
}

#[command]
pub async fn rollback_catalog_tweaks(
    app: AppHandle,
    confirmed: bool,
    windows: State<'_, CapsuleState>,
) -> Result<Batch, String> {
    if !confirmed {
        return Err("Rollback was not confirmed.".into());
    }
    let _guard = windows.visual_operation.lock().await;
    let mut batch = load(&app)?.ok_or("There is no catalog-settings batch to undo.")?;
    if !["applied", "pending", "recovery-needed"].contains(&batch.status.as_str()) {
        return Err(format!(
            "Cannot roll back receipt with status {}.",
            batch.status
        ));
    }
    let all = catalog()?;
    validate_batch(&all, &batch)?;
    for change in &batch.changes {
        let spec = spec_for(&all, change)?;
        let current = read(spec)?;
        if current != Some(change.after.clone()) && current != change.before {
            return Err(format!(
                "{} changed after applying. Rollback stopped without overwriting newer values.",
                change.title
            ));
        }
    }
    execute_approved(&app, &mut batch, "undo").await?;
    Ok(batch)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspection_rejects_invalid_ids_without_reading_or_writing_registry() {
        assert!(
            inspect_catalog_tweaks(vec![])
                .unwrap_err()
                .contains("Select between")
        );
        assert!(
            inspect_catalog_tweaks(vec!["unknown".into()])
                .unwrap_err()
                .contains("Unknown")
        );
        assert!(
            inspect_catalog_tweaks(vec!["dark-theme".into(); catalog().unwrap().len() + 1])
                .unwrap_err()
                .contains("Select between")
        );
    }

    #[test]
    fn allowlist_is_fixed_and_values_encode() {
        let all = catalog().unwrap();
        assert_eq!(all.len(), 73);
        for t in all {
            for spec in t.values {
                assert!(["HKCU", "HKLM"].contains(&spec.root.as_str()));
                let value = desired(&spec).unwrap();
                if spec.kind == "REG_DWORD" {
                    assert_eq!(value.bytes.len(), 4);
                } else {
                    assert!(value.bytes.ends_with(&[0, 0]));
                }
            }
        }
    }

    fn sample() -> (Vec<Tweak>, Vec<Change>) {
        let all = catalog().unwrap();
        let t = &all[0];
        let changes = t
            .values
            .iter()
            .enumerate()
            .map(|(index, spec)| Change {
                tweak_id: t.id.clone(),
                title: t.title.clone(),
                index,
                location: spec.name.clone(),
                before: None,
                after: desired(spec).unwrap(),
                desired: spec.apply.clone(),
            })
            .collect();
        (all, changes)
    }

    #[test]
    fn elevated_helper_rejects_modified_targets_values_and_duplicate_writes() {
        let (all, changes) = sample();
        let mut batch = Batch {
            id: "test".into(),
            changes,
            needs_admin: false,
            status: "preview".into(),
        };
        assert!(validate_batch(&all, &batch).is_ok());
        batch.changes.push(batch.changes[0].clone());
        assert!(validate_batch(&all, &batch).is_err());
        batch.changes.pop();
        batch.changes[0].after.bytes = vec![99, 0, 0, 0];
        assert!(validate_batch(&all, &batch).is_err());
        batch.changes[0].tweak_id = "unlisted".into();
        assert!(validate_batch(&all, &batch).is_err());
    }

    #[test]
    fn appearance_reverse_values_are_fixed_not_arbitrary_registry_data() {
        let (all, mut changes) = sample();
        let spec = spec_for(&all, &changes[0]).unwrap();
        let reverse = ValueSpec {
            apply: spec.revert.clone().unwrap(),
            ..spec.clone()
        };
        changes[0].after = desired(&reverse).unwrap();
        changes[0].desired = reverse.apply.clone();
        assert!(approved_after(spec, &changes[0]).unwrap());
        changes[0].after.bytes = vec![99, 0, 0, 0];
        assert!(!approved_after(spec, &changes[0]).unwrap());
        let gaming = all.iter().find(|t| t.id == "no-game-dvr").unwrap();
        changes[0].tweak_id = gaming.id.clone();
        changes[0].after = SavedValue {
            kind: "REG_DWORD".into(),
            bytes: vec![1, 0, 0, 0],
        };
        changes[0].desired = "1".into();
        assert!(!approved_after(&gaming.values[0], &changes[0]).unwrap());
    }

    #[test]
    fn helper_rejects_unknown_operations_before_any_registry_io() {
        let (_, changes) = sample();
        let batch = Batch {
            id: "test".into(),
            changes,
            needs_admin: false,
            status: "preview".into(),
        };
        assert!(
            run_approved_helper(serde_json::json!({ "mode": "shell", "batch": batch })).is_err()
        );
    }

    #[test]
    fn apply_verifies_and_restore_recovers_original_values() {
        let (all, changes) = sample();
        let values =
            std::cell::RefCell::new(std::collections::HashMap::<String, SavedValue>::new());
        let read = |s: &ValueSpec| Ok(values.borrow().get(&s.name).cloned());
        let write = |s: &ValueSpec, v: &Option<SavedValue>| {
            if let Some(v) = v {
                values.borrow_mut().insert(s.name.clone(), v.clone());
            } else {
                values.borrow_mut().remove(&s.name);
            }
            Ok(())
        };
        assert!(apply_with(&all, &changes, read, write).1.is_ok());
        assert_eq!(values.borrow().len(), 2);
        assert!(restore_with(&all, &changes, read, write).is_ok());
        assert!(values.borrow().is_empty());
    }

    #[test]
    fn failed_write_recovers_prior_changes_without_real_registry_writes() {
        let (all, changes) = sample();
        let values =
            std::cell::RefCell::new(std::collections::HashMap::<String, SavedValue>::new());
        let read = |s: &ValueSpec| Ok(values.borrow().get(&s.name).cloned());
        let write = |s: &ValueSpec, v: &Option<SavedValue>| {
            if s.name == "SystemUsesLightTheme" && v.is_some() {
                return Err("Access denied".into());
            }
            if let Some(v) = v {
                values.borrow_mut().insert(s.name.clone(), v.clone());
            } else {
                values.borrow_mut().remove(&s.name);
            }
            Ok(())
        };
        let (attempted, result) = apply_with(&all, &changes, read, write);
        assert!(result.unwrap_err().contains("Access denied"));
        assert_eq!(attempted, 2);
        assert!(restore_with(&all, &changes[..attempted], read, write).is_ok());
        assert!(values.borrow().is_empty());
    }

    #[test]
    fn recovery_never_overwrites_a_newer_value() {
        let (all, changes) = sample();
        let mut newer = changes[0].after.clone();
        newer.bytes = vec![3, 0, 0, 0];
        let result = restore_with(
            &all,
            &changes[..1],
            |_| Ok(Some(newer.clone())),
            |_, _| panic!("must not write"),
        );
        assert!(result.unwrap_err().contains("newer registry value"));
    }

    #[test]
    fn readback_mismatch_is_a_failure_and_unknown_targets_are_rejected() {
        let (all, mut changes) = sample();
        let (_, result) = apply_with(&all, &changes, |_| Ok(None), |_, _| Ok(()));
        assert!(result.unwrap_err().contains("did not retain"));
        changes[0].tweak_id = "unlisted-setting".into();
        assert!(spec_for(&all, &changes[0]).is_err());
    }
}
