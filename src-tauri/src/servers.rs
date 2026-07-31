use serde_json::{json, Value};
use std::time::Duration;

const MCSTATUS: &str = "https://api.mcstatus.io/v2/status/java";

#[tauri::command]
pub async fn server_status(address: String) -> Result<Value, String> {
    let cl = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        // Таймауты, чтобы висящий mcstatus не блокировал запрос навсегда (HNS-02).
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = cl
        .get(format!("{MCSTATUS}/{address}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("mcstatus: {}", resp.status()));
    }
    let d: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json!({
        "online": d["online"].as_bool().unwrap_or(false),
        "players_online": d["players"]["online"].as_u64().unwrap_or(0),
        "players_max": d["players"]["max"].as_u64().unwrap_or(0),
        "motd": d["motd"]["clean"].as_str().unwrap_or("").trim().to_string(),
        "version": d["version"]["name_clean"].as_str().unwrap_or("").to_string(),
        "icon": d["icon"].as_str().unwrap_or("").to_string(),
    }))
}
