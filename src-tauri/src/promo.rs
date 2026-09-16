

use serde::{Deserialize, Serialize};

fn de_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(Option::<String>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Promo {
    #[serde(default)]
    pub id: i64,
    #[serde(default, deserialize_with = "de_string")]
    pub title: String,
    #[serde(default, deserialize_with = "de_string")]
    pub subtitle: String,
    #[serde(default, deserialize_with = "de_string")]
    pub image_url: String,
    #[serde(default, deserialize_with = "de_string")]
    pub mrpack_url: String,
    #[serde(default, deserialize_with = "de_string")]
    pub server_addr: String,
    #[serde(default, deserialize_with = "de_string")]
    pub mc_version: String,
    #[serde(default, deserialize_with = "de_string")]
    pub loader: String,
}

#[derive(Deserialize)]
struct Resp {

    #[serde(default)]
    promo: Option<Promo>,
}

fn https(url: &str) -> bool {
    url.starts_with("https://") && url.len() <= 512
}

fn sane_addr(addr: &str) -> bool {
    !addr.is_empty()
        && addr.len() <= 128
        && addr
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
}

#[tauri::command]
pub async fn promo_current() -> Result<Option<Promo>, String> {
    let resp = crate::aciron::get("/api/promo")?
        .send()
        .await
        .map_err(|_| crate::aciron::OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Couldn't load the promo: {}", resp.status().as_u16()));
    }
    let data: Resp = resp.json().await.map_err(|e| e.to_string())?;

    Ok(data
        .promo
        .filter(|p| !p.title.trim().is_empty() && https(&p.mrpack_url)))
}

#[tauri::command]
pub async fn promo_install(app: tauri::AppHandle) -> Result<crate::builds::Build, String> {
    let promo = promo_current().await?.ok_or("The promo is no longer active")?;
    if !https(&promo.mrpack_url) {
        return Err("Invalid instance link".into());
    }

    let cl = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = crate::net::send(cl.get(&promo.mrpack_url)).await?;
    if !resp.status().is_success() {
        return Err(format!(
            "Couldn't download the instance: {}",
            resp.status().as_u16()
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| crate::net::net_error(&e))?
        .to_vec();

    if bytes.len() < 1024 || &bytes[..2] != b"PK" {
        return Err("The link does not point to an instance, tell the server owner".into());
    }

    let mut build = crate::modrinth::build_from_mrpack(&app, &cl, bytes, "").await?;

    if sane_addr(&promo.server_addr) {
        build.server = promo.server_addr.clone();
        crate::builds::upsert_build(build.clone())?;
    }
    Ok(build)
}
