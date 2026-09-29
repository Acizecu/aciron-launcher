

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

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<serde_json::Value>,
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
pub async fn chat_send_image(user_id: String, path: String, caption: Option<String>) -> Result<Message, String> {
    let path = std::path::PathBuf::from(path);
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("This is not a file".into());
    }

    if meta.len() > 16 * 1024 * 1024 {
        return Err("The image is too large".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("image").to_string();
    send_image_bytes(&user_id, bytes, name, caption).await
}

#[tauri::command]
pub async fn chat_send_image_data(user_id: String, data: String, caption: Option<String>) -> Result<Message, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD.decode(data.trim()).map_err(|_| "Bad image data".to_string())?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("The image is too large".into());
    }
    send_image_bytes(&user_id, bytes, "pasted.png".into(), caption).await
}

async fn send_image_bytes(user_id: &str, bytes: Vec<u8>, name: String, caption: Option<String>) -> Result<Message, String> {
    let token = crate::aciron::active_token()?;
    let mut form = reqwest::multipart::Form::new()
        .part("file", reqwest::multipart::Part::bytes(bytes).file_name(name));
    if let Some(c) = caption.filter(|c| !c.trim().is_empty()) {
        form = form.text("caption", c);
    }
    let resp = crate::aciron::post(&format!("/api/chat/{}/image", urlencode(user_id)))?
        .header("Authorization", format!("Bearer {token}"))

        .timeout(std::time::Duration::from_secs(90))
        .multipart(form)
        .send()
        .await
        .map_err(|_| crate::aciron::OFFLINE.to_string())?;
    let data: SendResponse = crate::social::check(resp).await?.json().await.map_err(|e| e.to_string())?;
    Ok(data.message)
}

#[tauri::command]
pub async fn chat_limits() -> Result<serde_json::Value, String> {
    get("/api/chat/limits").await?.json().await.map_err(|e| e.to_string())
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
    use std::fmt::Write;
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }

            _ => {
                let _ = write!(out, "%{b:02X}");
            }
        }
    }
    out
}
