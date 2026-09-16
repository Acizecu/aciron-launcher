

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnounceLink {
    #[serde(default, deserialize_with = "de_string")]
    pub url: String,

    #[serde(default, deserialize_with = "de_string")]
    pub label: String,
}

fn de_string<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(Option::<String>::deserialize(d)?.unwrap_or_default())
}

fn de_tone<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let s = Option::<String>::deserialize(d)?.unwrap_or_default();
    Ok(if s.trim().is_empty() { tone_info() } else { s })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Announce {
    #[serde(default)]
    pub id: i64,

    #[serde(default = "tone_info", deserialize_with = "de_tone")]
    pub tone: String,
    #[serde(default, deserialize_with = "de_string")]
    pub body: String,
    #[serde(default)]
    pub link: Option<AnnounceLink>,
}

fn tone_info() -> String {
    "info".into()
}

#[derive(Deserialize)]
struct Resp {

    #[serde(default)]
    announcement: Option<Announce>,
}

fn lang_code(lang: &str) -> &'static str {
    match lang {
        "en" => "en",
        "tr" => "tr",
        _ => "ru",
    }
}

#[tauri::command]
pub async fn announce_current(lang: Option<String>) -> Result<Option<Announce>, String> {
    let code = lang_code(lang.as_deref().unwrap_or("ru"));
    let resp = crate::aciron::get(&format!("/api/announce?lang={code}"))?
        .send()
        .await
        .map_err(|_| crate::aciron::OFFLINE.to_string())?;

    if !resp.status().is_success() {
        return Err(format!(
            "Couldn't load the announcement: {}",
            resp.status().as_u16()
        ));
    }

    let data: Resp = resp.json().await.map_err(|e| e.to_string())?;

    Ok(data.announcement.filter(|a| !a.body.trim().is_empty()))
}
