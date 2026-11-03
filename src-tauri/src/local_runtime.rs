use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

struct Runtime {
    root: PathBuf,
    directory: PathBuf,
    child: Mutex<Option<Child>>,
}

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

pub fn initialize(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let root = app.path().resource_dir()?.join("runtime");
    let root = if cfg!(debug_assertions) && !root.join("node.exe").is_file() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runtime")
    } else {
        root
    };
    let directory = app.path().data_dir()?.join("Capsule OS").join("ToolboxRuntime");
    #[cfg(debug_assertions)]
    let directory = std::env::var_os("CAPSULE_TEST_DATA_DIRECTORY").map(PathBuf::from).unwrap_or(directory);
    RUNTIME.set(Runtime { root, directory, child: Mutex::new(None) })
        .map_err(|_| "Toolbox runtime was initialized twice.")?;
    Ok(())
}

pub async fn endpoint() -> Result<PathBuf, String> {
    let runtime = RUNTIME.get().ok_or("Toolbox runtime has not been initialized.")?;
    let pid = {
        let mut guard = runtime.child.lock().map_err(|_| "Toolbox runtime lock is unavailable.")?;
        if let Some(child) = guard.as_mut() {
            if let Some(code) = child.try_wait().map_err(|e| e.to_string())? {
                log::error!("Toolbox runtime exited: {code}");
                *guard = None;
            }
        }
        if guard.is_none() {
            let node = runtime.root.join("node.exe");
            let entry = runtime.root.join("assistant").join("toolbox-runtime.cjs");
            if !node.is_file() || !entry.is_file() {
                return Err("The bundled Toolbox runtime is missing. Install the self-contained Toolbox build; a separate Browser or system Node is not a substitute.".into());
            }
            std::fs::create_dir_all(&runtime.directory).map_err(|e| e.to_string())?;
            let log = std::fs::OpenOptions::new().create(true).truncate(true).write(true)
                .open(runtime.directory.join("runtime.log")).map_err(|e| e.to_string())?;
            let mut command = Command::new(node);
            command.arg("assistant\\toolbox-runtime.cjs").current_dir(&runtime.root)
                .env("CAPSULE_RUNTIME_DIRECTORY", &runtime.directory)
                .env("CAPSULE_BRIDGE_DIRECTORY", runtime.directory.join("sessions").join(std::process::id().to_string()))
                .env_remove("NODE_OPTIONS").env_remove("NODE_PATH")
                .stdin(Stdio::piped()).stdout(Stdio::from(log.try_clone().map_err(|e| e.to_string())?))
                .stderr(Stdio::from(log));
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            *guard = Some(command.spawn().map_err(|e| format!("Unable to start bundled Toolbox runtime: {e}"))?);
        }
        guard.as_ref().ok_or("Toolbox runtime did not start.")?.id()
    };
    let path = runtime.directory.join("sessions").join(std::process::id().to_string()).join("bridge.json");
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            if bytes.len() <= 4096 {
                if let Ok(record) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if record.get("pid").and_then(serde_json::Value::as_u64) == Some(pid as u64) {
                        return Ok(path);
                    }
                }
            }
        }
        {
            let mut guard = runtime.child.lock().map_err(|_| "Toolbox runtime lock is unavailable.")?;
            if let Some(child) = guard.as_mut() {
                if let Some(code) = child.try_wait().map_err(|e| e.to_string())? {
                    *guard = None;
                    return Err(format!("Toolbox runtime exited during startup ({code}). See ToolboxRuntime\\runtime.log."));
                }
            }
        }
        if Instant::now() >= deadline {
            return Err("Toolbox runtime startup timed out. See ToolboxRuntime\\runtime.log.".into());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

pub fn shutdown() {
    if let Some(runtime) = RUNTIME.get() {
        if let Ok(mut guard) = runtime.child.lock() {
            if let Some(mut child) = guard.take() {
                // EOF asks Node to close its model worker and authenticated bridge.
                drop(child.stdin.take());
                std::thread::spawn(move || {
                    for _ in 0..50 {
                        if matches!(child.try_wait(), Ok(Some(_))) { return; }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                });
            }
        }
    }
}
