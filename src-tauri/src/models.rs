use std::io;
use tauri::{AppHandle, Manager};

pub fn register_offline_models(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let executable = std::env::current_exe()?;
    let mut candidates = vec![app.path().resource_dir()?.join("models")];
    if let Some(parent) = executable.parent() {
        candidates.push(parent.join("models"));
    }
    if cfg!(debug_assertions) {
        candidates.push(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("bundled-models"));
    }
    let Some(root) = candidates.into_iter().find(|candidate| candidate.is_dir()) else {
        return Ok(());
    };
    let directory = app.path().data_dir()?.join("Capsule OS");
    std::fs::create_dir_all(&directory)?;
    let root = root.canonicalize()?;
    let record = serde_json::json!({ "version": 1, "root": root });
    let temporary = directory.join(format!("toolbox-models-{}.tmp", std::process::id()));
    let target = directory.join("toolbox-models.json");
    std::fs::write(&temporary, serde_json::to_vec(&record).map_err(io::Error::other)?)?;
    std::fs::rename(temporary, target)?;
    Ok(())
}
