

use crate::social::{get, post};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: String,
    pub body: String,

    pub at: i64,
    #[serde(default)]
    pub read: bool,
}

#[derive(Debug, Deserialize)]
struct HistoryResponse {
    #[serde(default)]
    messages: Vec<Message>,
}

#[derive(Debug, Deserialize)]
struct SendResponse {
    message: Message,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Overview {
    #[serde(default)]
    pub unread: HashMap<String, u32>,

    #[serde(default)]
    pub last: HashMap<String, i64>,
}

#[tauri::command]
pub async fn chat_history(user_id: String, before: Option<String>) -> Result<Vec<Message>, String> {
    let mut path = format!("/api/chat/{}", urlencode(&user_id));
    if let Some(b) = before.filter(|b| !b.is_empty()) {
        path.push_str(&format!("?before={}", urlencode(&b)));
    }
    let data: HistoryResponse = get(&path).await?.json().await.map_err(|e| e.to_string())?;
    Ok(data.messages)
}

#[tauri::command]
pub async fn chat_send(user_id: String, body: String) -> Result<Message, String> {
    let data: SendResponse = post(&format!("/api/chat/{}", urlencode(&user_id)), json!({ "body": body }))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(data.message)
}

#[tauri::command]
pub async fn chat_overview() -> Result<Overview, String> {
    get("/api/chat").await?.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat_mark_read(user_id: String) -> Result<(), String> {
    post(&format!("/api/chat/{}/read", urlencode(&user_id)), json!({})).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct DeleteResponse {
    #[serde(default)]
    ids: Vec<String>,
}

#[tauri::command]
pub async fn chat_delete(ids: Vec<String>) -> Result<Vec<String>, String> {
    let data: DeleteResponse = post("/api/chat/delete", json!({ "ids": ids }))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(data.ids)
}

#[tauri::command]
pub async fn friend_profile(user_id: String) -> Result<serde_json::Value, String> {
    get(&format!("/api/profile/{}", urlencode(&user_id)))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
