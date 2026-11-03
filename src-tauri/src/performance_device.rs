use serde::Serialize;
use tauri::{command, State};
use std::sync::Mutex;
use windows_sys::Win32::System::{
    Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS},
    SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
    Threading::GetSystemTimes,
};
use windows_sys::Win32::Foundation::FILETIME;

#[derive(Clone, Copy)]
struct CpuTimes { idle: u64, kernel: u64, user: u64 }

#[derive(Default)]
pub struct PerformanceTelemetryState(Mutex<Option<CpuTimes>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSample {
    timestamp: u64,
    cpu_percent: Option<f64>,
    memory_percent: u32,
    available_memory_gib: f64,
    total_memory_gib: f64,
}

fn cpu_usage(before: CpuTimes, after: CpuTimes) -> Result<Option<f64>, String> {
    let delta = |a: u64, b: u64| a.checked_sub(b).ok_or("Windows CPU counters moved backwards.".to_string());
    let idle = delta(after.idle, before.idle)?;
    let total = delta(after.kernel, before.kernel)?.checked_add(delta(after.user, before.user)?)
        .ok_or("Windows CPU counters overflowed.")?;
    if idle > total { return Err("Windows returned inconsistent CPU counters.".into()); }
    Ok(if total == 0 { None } else { Some(100.0 * (total - idle) as f64 / total as f64) })
}

#[command]
pub fn inspect_performance_telemetry(state: State<'_, PerformanceTelemetryState>, reset: bool) -> Result<ResourceSample, String> {
    let mut previous = state.0.lock().map_err(|_| "Windows resource sampling state is unavailable.")?;
    read_resource_sample(&mut previous, reset)
}

fn read_resource_sample(previous: &mut Option<CpuTimes>, reset: bool) -> Result<ResourceSample, String> {
    let mut idle: FILETIME = unsafe { std::mem::zeroed() };
    let mut kernel: FILETIME = unsafe { std::mem::zeroed() };
    let mut user: FILETIME = unsafe { std::mem::zeroed() };
    let mut memory: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    memory.dwLength = std::mem::size_of_val(&memory) as u32;
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0
        || unsafe { GlobalMemoryStatusEx(&mut memory) } == 0 {
        return Err(format!("Windows resource counters are unavailable: {}", std::io::Error::last_os_error()));
    }
    let ticks = |value: FILETIME| ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64;
    let now = CpuTimes { idle: ticks(idle), kernel: ticks(kernel), user: ticks(user) };
    let cpu_percent = if reset { None } else { previous.map(|before| cpu_usage(before, now)).transpose()?.flatten() };
    *previous = Some(now);
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?.as_millis() as u64;
    Ok(ResourceSample {
        timestamp, cpu_percent, memory_percent: memory.dwMemoryLoad,
        available_memory_gib: memory.ullAvailPhys as f64 / 1073741824.0,
        total_memory_gib: memory.ullTotalPhys as f64 / 1073741824.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cpu_samples_measure_busy_ticks_without_an_invented_health_score() {
        let before = CpuTimes { idle: 20, kernel: 50, user: 50 };
        let after = CpuTimes { idle: 70, kernel: 100, user: 100 };
        assert_eq!(cpu_usage(before, after).unwrap(), Some(50.0));
        assert_eq!(cpu_usage(before, before).unwrap(), None);
        assert!(cpu_usage(after, before).is_err());
        assert!(cpu_usage(before, CpuTimes { idle: 200, ..after }).is_err());
    }
    #[test]
    fn windows_counters_return_real_bounded_resource_readings() {
        let mut previous = None;
        let first = read_resource_sample(&mut previous, true).unwrap();
        assert!(first.cpu_percent.is_none());
        std::thread::sleep(std::time::Duration::from_millis(25));
        let second = read_resource_sample(&mut previous, false).unwrap();
        assert!(second.timestamp >= first.timestamp);
        assert!(second.memory_percent <= 100);
        assert!(second.total_memory_gib > 0.0);
        assert!((0.0..=100.0).contains(&second.cpu_percent.unwrap()));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceState {
    on_ac: Option<bool>,
    has_battery: Option<bool>,
    energy_saver: Option<bool>,
    battery_percent: Option<u8>,
    memory_load_percent: u32,
    total_memory_gib: f64,
    available_memory_gib: f64,
}

pub fn require_ac_for_throttling_override() -> Result<(), String> {
    let mut power: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    if unsafe { GetSystemPowerStatus(&mut power) } == 0 || power.ACLineStatus != 1 {
        return Err("Disabling power throttling is restricted to confirmed AC power. Plug in the laptop and review again; no settings were changed.".into());
    }
    Ok(())
}

#[command]
pub fn inspect_performance_device() -> Result<DeviceState, String> {
    let mut power: SYSTEM_POWER_STATUS = unsafe { std::mem::zeroed() };
    let mut memory: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    memory.dwLength = std::mem::size_of_val(&memory) as u32;
    if unsafe { GetSystemPowerStatus(&mut power) } == 0
        || unsafe { GlobalMemoryStatusEx(&mut memory) } == 0
    {
        return Err(format!(
            "Windows could not inspect power and memory status: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(DeviceState {
        on_ac: match power.ACLineStatus {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        },
        has_battery: if power.BatteryFlag == 255 {
            None
        } else {
            Some(power.BatteryFlag & 128 == 0)
        },
        energy_saver: match power.SystemStatusFlag {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        },
        battery_percent: if power.BatteryLifePercent <= 100 {
            Some(power.BatteryLifePercent)
        } else {
            None
        },
        memory_load_percent: memory.dwMemoryLoad,
        total_memory_gib: memory.ullTotalPhys as f64 / 1073741824.0,
        available_memory_gib: memory.ullAvailPhys as f64 / 1073741824.0,
    })
}

#[command]
pub fn open_power_settings() -> Result<(), String> {
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let target: Vec<u16> = "ms-settings:powersleep"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    if result as isize <= 32 {
        return Err("Windows could not open Power & battery settings.".into());
    }
    Ok(())
}
