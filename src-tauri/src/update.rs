use serde::Serialize;
use std::time::Duration;

pub const APP_VERSION: &str = "0.7.7";

const GITHUB_REPO: &str = "Acizecu/aciron-launcher";

#[derive(Serialize, Default)]
pub struct UpdateInfo {

    pub available: bool,

    pub current: String,

    pub latest: String,

    pub url: String,

    pub notes: String,
}

fn is_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches(['v', 'V'])
            .split(|c: char| c == '.' || c == '-' || c == '+')
            .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let (va, vb) = (parse(a), parse(b));
    for i in 0..va.len().max(vb.len()) {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_update() -> UpdateInfo {
    let mut info = UpdateInfo {
        current: APP_VERSION.to_string(),
        latest: APP_VERSION.to_string(),
        ..Default::default()
    };

    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let client = match reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        // Таймауты: проверка обновлений не должна зависать при недоступном GitHub (HNS-02).
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(_) => return info,
    };

    let resp = match client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return info,
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return info,
    };

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches(['v', 'V']);
    if tag.is_empty() {
        return info;
    }

    info.latest = tag.to_string();
    info.notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    info.url = json
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|asset| {
                let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name.ends_with(".exe") || name.ends_with(".msi") {
                    asset
                        .get("browser_download_url")
                        .and_then(|u| u.as_str())
                        .map(String::from)
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            json.get("html_url")
                .and_then(|u| u.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| format!("https://github.com/{GITHUB_REPO}/releases/latest"));

    info.available = is_newer(tag, APP_VERSION);
    info
}
