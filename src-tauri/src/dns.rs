use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct Provider {
    id: &'static str,
    ipv4: [&'static str; 2],
    ipv6: [&'static str; 2],
    doh: &'static str,
}

// Fixed allowlist. The frontend sends only an id; no text from it ever reaches the shell.
const PROVIDERS: [Provider; 6] = [
    Provider { id: "cloudflare", ipv4: ["1.1.1.1", "1.0.0.1"], ipv6: ["2606:4700:4700::1111", "2606:4700:4700::1001"], doh: "https://cloudflare-dns.com/dns-query" },
    Provider { id: "cloudflare-family", ipv4: ["1.1.1.3", "1.0.0.3"], ipv6: ["2606:4700:4700::1113", "2606:4700:4700::1003"], doh: "https://family.cloudflare-dns.com/dns-query" },
    Provider { id: "quad9", ipv4: ["9.9.9.9", "149.112.112.112"], ipv6: ["2620:fe::fe", "2620:fe::9"], doh: "https://dns.quad9.net/dns-query" },
    Provider { id: "adguard", ipv4: ["94.140.14.14", "94.140.15.15"], ipv6: ["2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff"], doh: "https://dns.adguard-dns.com/dns-query" },
    Provider { id: "mullvad", ipv4: ["194.242.2.2", "194.242.2.3"], ipv6: ["2a07:e340::2", "2a07:e340::3"], doh: "https://dns.mullvad.net/dns-query" },
    Provider { id: "google", ipv4: ["8.8.8.8", "8.8.4.4"], ipv6: ["2001:4860:4860::8888", "2001:4860:4860::8844"], doh: "https://dns.google/dns-query" },
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsState {
    adapters: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsResult {
    provider: String,
    message: String,
}

fn powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "Could not start Windows PowerShell.".to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let text = String::from_utf8_lossy(&output.stderr);
        if text.contains("denied") || text.contains("Access") || text.contains("administrator") {
            Err("Windows needs administrator rights to change DNS. Start Capsule Toolbox as administrator and try again.".to_string())
        } else {
            Err("Windows did not accept the DNS change.".to_string())
        }
    }
}

const ACTIVE: &str = "Get-NetAdapter -Physical | Where-Object Status -eq 'Up'";

#[command]
pub async fn inspect_dns() -> Result<DnsState, String> {
    let script = format!(
        "$names = ({ACTIVE}).Name; Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object {{ $names -contains $_.InterfaceAlias }} | Select-Object InterfaceAlias,ServerAddresses | ConvertTo-Json -Compress"
    );
    let text = tauri::async_runtime::spawn_blocking(move || powershell(&script))
        .await
        .map_err(|_| "DNS inspection stopped unexpectedly.".to_string())??;
    let adapters = if text.is_empty() {
        serde_json::json!([])
    } else {
        let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!([]));
        if value.is_array() { value } else { serde_json::json!([value]) }
    };
    Ok(DnsState { adapters })
}

#[command]
pub async fn set_dns_provider(provider_id: String, confirmed: bool) -> Result<DnsResult, String> {
    if !confirmed {
        return Err("DNS was not changed because the change was not confirmed.".to_string());
    }
    let script = if provider_id == "system" {
        format!("{ACTIVE} | Set-DnsClientServerAddress -ResetServerAddresses")
    } else {
        let p = PROVIDERS
            .iter()
            .find(|entry| entry.id == provider_id)
            .ok_or_else(|| "Choose a supported DNS provider.".to_string())?;
        let v4 = format!("'{}','{}'", p.ipv4[0], p.ipv4[1]);
        let v6 = format!("'{}','{}'", p.ipv6[0], p.ipv6[1]);
        let doh: String = p
            .ipv4
            .iter()
            .chain(p.ipv6.iter())
            .map(|ip| {
                format!(
                    "try {{ Add-DnsClientDohServerAddress -ServerAddress '{ip}' -DohTemplate '{}' -AllowFallbackToUdp $false -AutoUpgrade $true -ErrorAction Stop }} catch {{}};",
                    p.doh
                )
            })
            .collect();
        format!(
            "$a = {ACTIVE}; if (-not $a) {{ throw 'No active adapter' }}; {doh} $a | Set-DnsClientServerAddress -ServerAddresses ({v4},{v6})"
        )
    };
    tauri::async_runtime::spawn_blocking(move || powershell(&script))
        .await
        .map_err(|_| "The DNS change stopped unexpectedly.".to_string())??;
    Ok(DnsResult {
        message: if provider_id == "system" {
            "DNS reset to automatic on active adapters.".to_string()
        } else {
            "DNS switched on active adapters. Encrypted DNS was registered where Windows supports it.".to_string()
        },
        provider: provider_id,
    })
}
