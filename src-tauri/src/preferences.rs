use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, command};

const MAX_PREFERENCES: usize = 20;
const MAX_PREFERENCE_LENGTH: usize = 240;

fn preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("preferences.json"))
        .map_err(|error| format!("Unable to locate local Capsule preferences: {error}"))
}

#[derive(Serialize, Deserialize)]
struct PreferenceDocument {
    version: u32,
    entries: Vec<String>,
    #[serde(default)]
    receipts: Vec<MemoryReceipt>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReceipt {
    id: String,
    timestamp: u64,
    action: String,
    changed_count: usize,
    reason: String,
}

async fn load_document(app: &AppHandle) -> Result<PreferenceDocument, String> {
    let path = preferences_path(app)?;
    let content = match tokio::fs::read(path).await {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PreferenceDocument {
                version: 1,
                entries: Vec::new(),
                receipts: Vec::new(),
            });
        }
        Err(error) => return Err(format!("Unable to read local Capsule preferences: {error}")),
    };
    if content.len() > 32 * 1024 {
        return Err("Local Capsule preferences exceed the safety limit.".to_string());
    }
    let document: PreferenceDocument = serde_json::from_slice(&content)
        .map_err(|_| "Local Capsule preferences are invalid.".to_string())?;
    if document.version != 1
        || document.entries.len() > MAX_PREFERENCES
        || document
            .entries
            .iter()
            .any(|entry| entry.chars().count() > MAX_PREFERENCE_LENGTH)
        || document.receipts.len() > 200
    {
        return Err("Local Capsule preferences exceed the supported format.".to_string());
    }
    Ok(document)
}

async fn store_document(app: &AppHandle, document: &PreferenceDocument) -> Result<(), String> {
    let path = preferences_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Local Capsule preference path is invalid.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Unable to create local Capsule data folder: {error}"))?;
    let content = serde_json::to_vec_pretty(document)
        .map_err(|error| format!("Unable to serialize local Capsule preferences: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, content)
        .await
        .map_err(|error| format!("Unable to write local Capsule preferences: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("Unable to save local Capsule preferences: {error}"))
}

fn new_receipt(action: &str, changed_count: usize, reason: &str) -> MemoryReceipt {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    MemoryReceipt {
        id: format!("memory-{}-{}", std::process::id(), now.as_nanos()),
        timestamp: now.as_secs(),
        action: action.to_string(),
        changed_count,
        reason: reason.to_string(),
    }
}

#[command]
pub async fn get_preferences(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(load_document(&app).await?.entries)
}

#[command]
pub async fn get_preference_receipts(app: AppHandle) -> Result<Vec<MemoryReceipt>, String> {
    Ok(load_document(&app).await?.receipts)
}

#[command]
pub async fn save_preferences(
    app: AppHandle,
    entries: Vec<String>,
    reason: String,
) -> Result<MemoryReceipt, String> {
    if entries.len() > MAX_PREFERENCES
        || entries
            .iter()
            .any(|entry| entry.trim().is_empty() || entry.chars().count() > MAX_PREFERENCE_LENGTH)
    {
        return Err("Add at most 20 non-empty preferences, up to 240 characters each.".to_string());
    }
    let reason = reason.trim();
    if reason.is_empty() || reason.chars().count() > 240 {
        return Err(
            "Explain why you want to save these preferences (up to 240 characters).".to_string(),
        );
    }
    let mut unique = Vec::with_capacity(entries.len());
    for entry in entries {
        let trimmed = entry.trim().to_string();
        if !unique.iter().any(|existing: &String| existing == &trimmed) {
            unique.push(trimmed);
        }
    }
    let mut document = load_document(&app).await?;
    let changed = document.entries != unique;
    let changed_count = document
        .entries
        .iter()
        .filter(|entry| !unique.contains(entry))
        .count()
        + unique
            .iter()
            .filter(|entry| !document.entries.contains(entry))
            .count();
    if changed {
        let receipt = new_receipt("updated", changed_count, reason);
        document.receipts.push(receipt.clone());
        if document.receipts.len() > 200 {
            document.receipts.drain(..document.receipts.len() - 200);
        }
        document.entries = unique;
        store_document(&app, &document).await?;
        Ok(receipt)
    } else {
        Err("No preference changes to save.".to_string())
    }
}

#[command]
pub async fn erase_preferences(app: AppHandle, reason: String) -> Result<MemoryReceipt, String> {
    let mut document = load_document(&app).await?;
    let changed_count = document.entries.len();
    if changed_count == 0 {
        return Err("There are no stored Capsule preferences to erase.".to_string());
    }
    let reason = reason.trim();
    if reason.chars().count() > 240 {
        return Err("The erasure reason must be 240 characters or fewer.".to_string());
    }
    let receipt = new_receipt(
        "erased",
        changed_count,
        if reason.is_empty() {
            "User requested local preference erasure."
        } else {
            reason
        },
    );
    document.entries.clear();
    document.receipts.push(receipt.clone());
    if document.receipts.len() > 200 {
        document.receipts.drain(..document.receipts.len() - 200);
    }
    store_document(&app, &document).await?;
    Ok(receipt)
}
