

use crate::aciron::{active_token, delete, get, patch, post, OFFLINE};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Значение по умолчанию для поля модели, если сервер его не прислал.
/// Так пропущенное поле не роняет разбор всего WardrobeData.
fn default_model() -> String {
    "classic".to_string()
}

/// Единая проверка загружаемой текстуры: ограничение размера и магическая
/// сигнатура PNG. Используется и при чтении превью, и при загрузке в гардероб.
fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 512 * 1024 {
        return Err("Файл слишком большой для текстуры".into());
    }
    const SIG: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    if bytes.len() < 8 || bytes[..8] != SIG {
        return Err("Файл не является PNG".into());
    }
    Ok(())
}

/// Автоопределение модели скина по пикселям. Возвращает Some(true) для slim,
/// Some(false) для classic и None, если решение неоднозначно (оставляем выбор
/// вызывающего). Логика: 4-й столбец руки — у classic он непрозрачный, у slim
/// прозрачный. Легаси-скины 64x32 всегда classic.
fn detect_slim(bytes: &[u8]) -> Option<bool> {
    let img = image::load_from_memory(bytes).ok()?.to_rgba8();
    if img.height() < 64 {
        return Some(false);
    } // легаси 64x32 => classic
    if img.width() < 64 {
        return None;
    }
    let mut opaque = 0u32; // 4-й столбец руки: classic непрозрачный, slim прозрачный
    for x in 54..56 {
        for y in 20..32 {
            if img.get_pixel(x, y)[3] != 0 {
                opaque += 1;
            }
        }
    }
    Some(opaque == 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WardrobeItem {
    pub id: String,

    pub kind: String,
    pub name: String,

    #[serde(default = "default_model")]
    pub model: String,

    pub url: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outfit {
    pub id: String,
    pub name: String,
    pub skin_id: Option<String>,
    pub cape_id: Option<String>,
    #[serde(default = "default_model")]
    pub model: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveLook {
    pub skin_id: Option<String>,

    #[serde(default)]
    pub skin_catalog_id: Option<String>,
    pub cape_id: Option<String>,

    #[serde(default)]
    pub cape_catalog_id: Option<String>,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub has_skin: bool,
    #[serde(default)]
    pub has_cape: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WardrobeData {
    #[serde(default)]
    pub skins: Vec<WardrobeItem>,
    #[serde(default)]
    pub capes: Vec<WardrobeItem>,
    #[serde(default)]
    pub outfits: Vec<Outfit>,
    pub active: ActiveLook,

    #[serde(default)]
    pub licensed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    #[serde(default)]
    pub synced: bool,
    #[serde(default)]
    pub error: Option<String>,
}

async fn check(resp: reqwest::Response) -> Result<reqwest::Response, String> {
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

async fn send(req: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    let resp = req
        .header("Authorization", format!("Bearer {}", active_token()?))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    check(resp).await
}

#[tauri::command]
pub async fn wardrobe_list() -> Result<WardrobeData, String> {
    send(get("/api/wardrobe")?)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wardrobe_add(
    path: String,
    kind: String,
    name: String,
    model: String,
) -> Result<WardrobeItem, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Не удалось прочитать файл: {e}"))?;

    // Валидация текстуры до отправки на сервер.
    validate_png(&bytes)?;

    // Автоопределение модели по пикселям только для скинов (у плащей нет модели руки).
    let model = if kind == "skin" {
        match detect_slim(&bytes) {
            Some(true) => "slim".to_string(),
            Some(false) => "classic".to_string(),
            None => model,
        }
    } else {
        model
    };

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("texture.png")
        .mime_str("image/png")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("kind", kind)
        .text("name", name)
        .text("model", model)
        .part("file", part);

    let body: serde_json::Value = send(post("/api/wardrobe/item")?.multipart(form))
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_value(body["item"].clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_texture(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    validate_png(&bytes)?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub async fn wardrobe_apply(id: String) -> Result<ApplyResult, String> {
    let body: serde_json::Value = send(post(&format!("/api/wardrobe/item/{id}/apply"))?)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::from_value(body["licenseSync"].clone()).unwrap_or(ApplyResult {
        synced: false,
        error: None,
    }))
}

#[tauri::command]
pub async fn wardrobe_delete(id: String) -> Result<(), String> {
    send(delete(&format!("/api/wardrobe/item/{id}"))?).await?;
    Ok(())
}

#[tauri::command]
pub async fn wardrobe_rename(id: String, name: String, model: String) -> Result<(), String> {
    send(
        patch(&format!("/api/wardrobe/item/{id}"))?
            .json(&json!({ "name": name, "model": model })),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn wardrobe_cape_off() -> Result<(), String> {
    send(post("/api/wardrobe/cape/off")?).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCape {
    pub id: String,
    pub name: String,
    pub url: String,

    #[serde(default)]
    pub by: String,
}

#[tauri::command]
pub async fn cape_catalog() -> Result<Vec<CatalogCape>, String> {
    let body: serde_json::Value = send(get("/api/wardrobe/catalog")?)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_value(body["capes"].clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cape_catalog_apply(id: String) -> Result<(), String> {
    send(post(&format!("/api/wardrobe/catalog/{id}/apply"))?).await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSkin {
    pub id: String,
    pub name: String,
    pub url: String,

    #[serde(default = "default_model")]
    pub model: String,
}

#[tauri::command]
pub async fn skin_catalog() -> Result<Vec<CatalogSkin>, String> {
    let body: serde_json::Value = send(get("/api/wardrobe/skin-catalog")?)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::from_value(body["skins"].clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn skin_catalog_apply(id: String) -> Result<ApplyResult, String> {
    let body: serde_json::Value = send(
        post(&format!("/api/wardrobe/skin-catalog/{id}/apply"))?,
    )
    .await?
    .json()
    .await
    .map_err(|e| e.to_string())?;
    Ok(serde_json::from_value(body["licenseSync"].clone()).unwrap_or(ApplyResult {
        synced: false,
        error: None,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseCape {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseCapes {
    #[serde(default)]
    pub linked: bool,
    #[serde(default)]
    pub capes: Vec<LicenseCape>,
}

#[tauri::command]
pub async fn license_capes() -> Result<LicenseCapes, String> {
    send(get("/api/wardrobe/license-capes")?)
        .await?
        .json()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn license_cape_apply(cape_id: Option<String>) -> Result<(), String> {
    send(
        post("/api/wardrobe/license-cape")?
            .json(&json!({ "capeId": cape_id })),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn outfit_add(
    name: String,
    skin_id: Option<String>,
    cape_id: Option<String>,
    model: String,
) -> Result<Outfit, String> {
    let body: serde_json::Value = send(
        post("/api/wardrobe/outfit")?
            .json(&json!({ "name": name, "skinId": skin_id, "capeId": cape_id, "model": model })),
    )
    .await?
    .json()
    .await
    .map_err(|e| e.to_string())?;
    serde_json::from_value(body["outfit"].clone()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn outfit_apply(id: String) -> Result<(), String> {
    send(post(&format!("/api/wardrobe/outfit/{id}/apply"))?).await?;
    Ok(())
}

#[tauri::command]
pub async fn outfit_delete(id: String) -> Result<(), String> {
    send(delete(&format!("/api/wardrobe/outfit/{id}"))?).await?;
    Ok(())
}
