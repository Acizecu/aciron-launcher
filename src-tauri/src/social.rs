

use crate::aciron::{active_token, OFFLINE};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendPresence {

    pub state: String,
    #[serde(default)]
    pub in_launcher: bool,
    #[serde(default)]
    pub in_game: bool,
    #[serde(default)]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub build_name: Option<String>,
    #[serde(default)]
    pub server: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub has_skin: bool,
    pub presence: FriendPresence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingUser {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub has_skin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyState {

    pub status: String,

    #[serde(default = "yes")]
    pub accept_requests: bool,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendsData {
    pub me: MyState,
    #[serde(default)]
    pub friends: Vec<Friend>,
    #[serde(default)]
    pub incoming: Vec<PendingUser>,
    #[serde(default)]
    pub outgoing: Vec<PendingUser>,
}

pub(crate) async fn check(resp: reqwest::Response) -> Result<reqwest::Response, String> {
    if resp.status().is_success() {
        return Ok(resp);
    }
    if resp.status().as_u16() == 401 {
        return Err("SESSION_EXPIRED".into());
    }
    let body = resp.text().await.unwrap_or_default();
    Err(serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "Aciron ID: не удалось выполнить запрос".into()))
}

pub(crate) async fn get(path: &str) -> Result<reqwest::Response, String> {
    let resp = crate::aciron::get(path)?
        .header("Authorization", format!("Bearer {}", active_token()?))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    check(resp).await
}

pub(crate) async fn post(path: &str, body: serde_json::Value) -> Result<reqwest::Response, String> {
    let resp = crate::aciron::post(path)?
        .header("Authorization", format!("Bearer {}", active_token()?))
        .json(&body)
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    check(resp).await
}

#[tauri::command]
pub async fn friends_list() -> Result<FriendsData, String> {
    get("/api/friends")
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn friend_request(username: String) -> Result<String, String> {
    let body: serde_json::Value = post("/api/friends/request", json!({ "username": username.trim() }))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body["status"].as_str().unwrap_or("requested").to_string())
}

#[tauri::command]
pub async fn friend_respond(user_id: String, accept: bool) -> Result<(), String> {
    post("/api/friends/respond", json!({ "userId": user_id, "accept": accept })).await?;
    Ok(())
}

#[tauri::command]
pub async fn friend_cancel(user_id: String) -> Result<(), String> {
    post("/api/friends/cancel", json!({ "userId": user_id })).await?;
    Ok(())
}

#[tauri::command]
pub async fn friend_remove(user_id: String) -> Result<(), String> {
    post("/api/friends/remove", json!({ "userId": user_id })).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_presence_status(status: String) -> Result<(), String> {
    post("/api/presence/status", json!({ "status": status })).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_accept_requests(enabled: bool) -> Result<(), String> {
    post("/api/friends/privacy", json!({ "acceptRequests": enabled })).await?;
    Ok(())
}
