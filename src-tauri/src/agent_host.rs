fn guide_url(choice: &str) -> Result<&'static str, String> {
    match choice {
        "ubuntu" => Ok("https://github.com/ubuntu/WSL"),
        "pengwin" => Ok("https://apps.microsoft.com/detail/9NV1GV1PXZ6P"),
        "pistachio" => Ok("https://apps.microsoft.com/detail/9P41G2MV9CQ3"),
        "project" => Ok("https://www.n8toriousai.com/"),
        _ => Err("Choose a listed Linux host information page.".into()),
    }
}

#[tauri::command]
pub fn open_agent_host_page(choice: String) -> Result<(), String> {
    let url = guide_url(&choice)?;
    let windows = std::env::var_os("SystemRoot").ok_or("Windows directory is unavailable.")?;
    std::process::Command::new(std::path::PathBuf::from(windows).join("explorer.exe"))
        .arg(url)
        .spawn()
        .map_err(|error| format!("Could not open the Linux host information page: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_links_are_fixed_https_information_pages() {
        for choice in ["ubuntu", "pengwin", "pistachio"] {
            assert!(guide_url(choice).unwrap().starts_with("https://"));
        }
        for invalid in ["", "https://example.com", "install", "../ubuntu", "ubuntu;whoami"] {
            assert!(guide_url(invalid).is_err());
        }
    }
}
