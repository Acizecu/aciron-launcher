

use crate::builds::{self, Build};
use serde::Serialize;

#[derive(Serialize)]
pub struct Cover {

    pub src: String,

    pub kind: &'static str,
}

#[tauri::command]
pub fn build_cover(build_id: String) -> Option<Cover> {
    let id = build_id.strip_prefix("build:").unwrap_or(&build_id).to_string();
    if let Some(src) = builds::get_build_image(id.clone()) {
        return Some(Cover { src, kind: "custom" });
    }
    let build = builds::get_build(&id)?;
    if build.icon_url.starts_with("https://") {
        return Some(Cover { src: build.icon_url, kind: "official" });
    }
    None
}

pub fn rpc_image(build: &Build) -> Option<String> {
    for url in [&build.image_url, &build.icon_url] {

        if url.starts_with("https://") && url.len() <= 256 {
            return Some(url.clone());
        }
    }
    None
}

pub fn sync_in_background(build_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = sync(&build_id).await {
            eprintln!("[covers] cover not uploaded: {e}");
        }
    });
}

async fn sync(build_id: &str) -> Result<(), String> {
    let token = crate::aciron::active_token()?;
    let build = builds::get_build(build_id).ok_or("Instance not found")?;
    if build.image.is_empty() {

        if let Ok(rb) = crate::aciron::delete(&format!("/api/builds/{build_id}/image")) {
            let _ = rb.header("Authorization", format!("Bearer {token}")).send().await;
        }
        set_remote(build_id, String::new());
        return Ok(());
    }
    let path = builds::build_dir(build_id).join(&build.image);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(build.image.clone())
        .mime_str(mime)
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let resp = crate::aciron::post(&format!("/api/builds/{build_id}/image"))?
        .header("Authorization", format!("Bearer {token}"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("upload failed: {}", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let url = body["absoluteUrl"].as_str().unwrap_or_default().to_string();
    set_remote(build_id, url);
    Ok(())
}

pub fn backfill_in_background() {
    tauri::async_runtime::spawn(async move {

        tokio::time::sleep(std::time::Duration::from_secs(8)).await;
        if crate::aciron::active_token().is_err() {
            return;
        }
        for b in builds::load_builds() {
            if !b.image.is_empty() && b.image_url.is_empty() {
                if let Err(e) = sync(&b.id).await {
                    eprintln!("[covers] backfill {}: {e}", b.id);
                }
            }
        }
    });
}

pub fn ensure_rpc_image(build_id: String, name: String, detail: String) {
    tauri::async_runtime::spawn(async move {
        if sync(&build_id).await.is_err() {
            return;
        }
        if let Some(b) = builds::get_build(&build_id) {
            if crate::discord::showing_build(&name) {
                crate::discord::set_build(&name, rpc_image(&b).as_deref(), &detail);
            }
        }
    });
}

pub fn forget_remote(build_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Ok(token) = crate::aciron::active_token() {
            if let Ok(rb) = crate::aciron::delete(&format!("/api/builds/{build_id}/image")) {
                let _ = rb.header("Authorization", format!("Bearer {token}")).send().await;
            }
        }
    });
}

fn set_remote(build_id: &str, url: String) {
    if let Some(mut b) = builds::get_build(build_id) {
        if b.image_url != url {
            b.image_url = url;
            let _ = builds::upsert_build(b);
        }
    }
}
