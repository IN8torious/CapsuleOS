use serde::{Deserialize, Serialize};
use std::io::{BufRead, Read, Write};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use windows_sys::Win32::{
    Foundation::{GetLastError, LocalFree},
    Security::Authorization::ConvertSidToStringSidW,
    Security::{
        GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TOKEN_USER, TokenElevation, TokenUser,
    },
    System::Pipes::{GetNamedPipeClientProcessId, GetNamedPipeServerProcessId},
    System::Threading::{GetCurrentProcess, GetProcessId, OpenProcessToken},
    UI::Shell::{SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW},
    UI::WindowsAndMessaging::SW_HIDE,
};

const LIMIT: usize = 1024 * 1024;
const PREFIX: &str = r"\\.\pipe\capsule-approved-settings-";

fn token() -> Result<OwnedHandle, String> {
    let mut handle = std::ptr::null_mut();
    if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut handle) } == 0 {
        return Err(format!(
            "Cannot inspect the Windows security token: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}

pub fn is_elevated() -> Result<bool, String> {
    let token = token()?;
    let mut elevation: TOKEN_ELEVATION = unsafe { std::mem::zeroed() };
    let mut size = 0;
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenElevation,
            &mut elevation as *mut _ as _,
            std::mem::size_of_val(&elevation) as u32,
            &mut size,
        )
    } == 0
    {
        return Err(format!(
            "Cannot inspect administrator elevation: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(elevation.TokenIsElevated != 0)
}

fn user_sid() -> Result<String, String> {
    let token = token()?;
    let mut size = 0;
    unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            std::ptr::null_mut(),
            0,
            &mut size,
        );
    }
    if size == 0 || size > 65536 {
        return Err("Cannot inspect the Windows user identity.".into());
    }
    let mut storage = vec![0usize; (size as usize).div_ceil(std::mem::size_of::<usize>())];
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            storage.as_mut_ptr() as _,
            size,
            &mut size,
        )
    } == 0
    {
        return Err("Cannot read the Windows user identity.".into());
    }
    let user = unsafe { &*(storage.as_ptr() as *const TOKEN_USER) };
    let mut text = std::ptr::null_mut();
    if unsafe { ConvertSidToStringSidW(user.User.Sid, &mut text) } == 0 {
        return Err("Cannot decode the Windows user identity.".into());
    }
    let mut length = 0;
    unsafe {
        while *text.add(length) != 0 {
            length += 1;
        }
    }
    let sid = String::from_utf16(unsafe { std::slice::from_raw_parts(text, length) });
    unsafe {
        LocalFree(text as _);
    }
    sid.map_err(|_| "Invalid Windows user identity.".into())
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

pub struct ApprovalChannel {
    pipe: NamedPipeServer,
    _process: OwnedHandle,
    sid: String,
}

impl ApprovalChannel {
    pub async fn connect() -> Result<Self, String> {
        let sid = user_sid()?;
        let parent = std::process::id();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let name = format!("{PREFIX}{parent}-{nonce}");
        let pipe = ServerOptions::new()
            .first_pipe_instance(true)
            .max_instances(1)
            .reject_remote_clients(true)
            .create(&name)
            .map_err(|e| format!("Cannot create the approval channel: {e}"))?;
        let process = tauri::async_runtime::spawn_blocking(move || {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe = exe
                .to_str()
                .ok_or("The application path is not valid Unicode.")?;
            let executable = wide(exe);
            let verb = wide("runas");
            let parameters = wide(&format!("--capsule-settings-helper \"{name}\" {parent}"));
            let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
            info.cbSize = std::mem::size_of_val(&info) as u32;
            info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
            info.lpVerb = verb.as_ptr();
            info.lpFile = executable.as_ptr();
            info.lpParameters = parameters.as_ptr();
            info.nShow = SW_HIDE;
            if unsafe { ShellExecuteExW(&mut info) } == 0 {
                let error = unsafe { GetLastError() };
                return Err(if error == 1223 {
                    "Administrator approval was cancelled. No settings were changed.".into()
                } else {
                    format!("Windows could not request administrator approval (error {error}).")
                });
            }
            if info.hProcess.is_null() {
                return Err("Windows did not return an elevated helper process.".into());
            }
            Ok(unsafe { OwnedHandle::from_raw_handle(info.hProcess) })
        })
        .await
        .map_err(|e| format!("Administrator approval stopped: {e}"))??;
        tokio::time::timeout(Duration::from_secs(30), pipe.connect())
            .await
            .map_err(|_| {
                "The elevated helper did not connect. No settings were changed.".to_string()
            })?
            .map_err(|e| format!("The elevated helper could not connect: {e}"))?;
        let mut peer = 0;
        if unsafe { GetNamedPipeClientProcessId(pipe.as_raw_handle(), &mut peer) } == 0
            || peer != unsafe { GetProcessId(process.as_raw_handle()) }
        {
            return Err("The approval channel peer did not match the elevated helper.".into());
        }
        Ok(Self {
            pipe,
            _process: process,
            sid,
        })
    }

    pub async fn execute<T: Serialize, R: for<'a> Deserialize<'a>>(
        &mut self,
        request: &T,
    ) -> Result<R, String> {
        self.execute_with_timeout(request, Duration::from_secs(60)).await
    }

    pub async fn execute_with_timeout<T: Serialize, R: for<'a> Deserialize<'a>>(
        &mut self,
        request: &T,
        timeout: Duration,
    ) -> Result<R, String> {
        let mut bytes =
            serde_json::to_vec(&serde_json::json!({ "userSid": self.sid, "operation": request }))
                .map_err(|e| e.to_string())?;
        if bytes.len() > LIMIT {
            return Err("Approved settings exceed the helper's size limit.".into());
        }
        bytes.push(b'\n');
        self.pipe
            .write_all(&bytes)
            .await
            .map_err(|e| format!("Cannot send approved settings: {e}"))?;
        let mut response = Vec::new();
        let mut byte = [0u8; 1];
        tokio::time::timeout(timeout, async {
            loop {
                self.pipe.read_exact(&mut byte).await.map_err(|e| format!("Elevated helper response was interrupted: {e}"))?;
                if byte[0] == b'\n' { break; }
                response.push(byte[0]);
                if response.len() > LIMIT { return Err("Elevated helper response exceeds its size limit.".to_string()); }
            }
            Ok::<(), String>(())
        }).await.map_err(|_| "Elevated helper timed out; its outcome is uncertain. Inspect the pending receipt before attempting another change.".to_string())??;
        serde_json::from_slice::<Result<R, String>>(&response)
            .map_err(|e| format!("Invalid elevated helper result: {e}"))?
    }
}

pub fn run_helper_if_requested() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) != Some("--capsule-settings-helper") {
        return None;
    }
    let result = (|| -> Result<(), String> {
        if args.len() != 3
            || !args[1].starts_with(PREFIX)
            || !args[1][PREFIX.len()..]
                .chars()
                .all(|c| c.is_ascii_digit() || c == '-')
        {
            return Err("Invalid approval channel.".into());
        }

        let parent = args[2]
            .parse::<u32>()
            .map_err(|_| "Invalid parent process.")?;
        let mut pipe = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&args[1])
            .map_err(|e| format!("Cannot open the approval channel: {e}"))?;
        let mut peer = 0;
        if unsafe { GetNamedPipeServerProcessId(pipe.as_raw_handle(), &mut peer) } == 0
            || peer != parent
        {
            return Err("The approval channel server is not the expected application.".into());
        }
        let response = (|| -> Result<serde_json::Value, String> {
            if !is_elevated()? {
                return Err("The settings helper did not receive administrator rights.".into());
            }
            let mut input = Vec::new();
            std::io::BufReader::new((&pipe).take((LIMIT + 1) as u64))
                .read_until(b'\n', &mut input)
                .map_err(|e| e.to_string())?;
            if input.len() > LIMIT || !input.ends_with(b"\n") {
                return Err("Invalid approved settings message.".into());
            }
            let request: serde_json::Value =
                serde_json::from_slice(&input).map_err(|e| e.to_string())?;
            if request["userSid"].as_str() != Some(user_sid()?.as_str()) {
                return Err("Elevation used a different Windows account. No settings were changed. Sign into an administrator account to preserve the correct user's settings.".into());
            }
            let operation = request["operation"].clone();
            if matches!(operation["mode"].as_str(), Some("repair" | "security-fix")) {
                let result = crate::repair::run_approved_helper(operation)?;
                serde_json::to_value(result).map_err(|e| e.to_string())
            } else {
                let result = crate::catalog_tweaks::run_approved_helper(operation)?;
                serde_json::to_value(result).map_err(|e| e.to_string())
            }
        })();
        let mut bytes = serde_json::to_vec(&response).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        pipe.write_all(&bytes).map_err(|e| e.to_string())?;
        pipe.flush().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = &result {
        log::error!("Approved settings helper: {error}");
    }
    Some(if result.is_ok() { 0 } else { 1 })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn security_identity_and_elevation_checks_are_read_only() {
        assert!(user_sid().unwrap().starts_with("S-1-"));
        assert!(is_elevated().is_ok());
        assert!(run_helper_if_requested().is_none());
    }
}
