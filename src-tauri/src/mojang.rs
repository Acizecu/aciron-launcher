

use crate::accounts::{self, Account};
use crate::aciron::{base, http, OFFLINE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const PROFILE: &str = "https://api.minecraftservices.com/minecraft/profile";

const MOJANG_OFFLINE: &str = "Minecraft сейчас не отвечает — попробуйте позже";

const NOTHING_TO_RESTORE: &str = "-";

static SYNC_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

static SESSION_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    #[serde(default)]
    pub synced: bool,
    #[serde(default)]
    pub error: Option<String>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

async fn mc_token(a: &Account) -> Result<String, String> {
    if !(a.kind == "microsoft" || (a.kind == "aciron" && a.licensed)) {
        return Err("Лицензия не привязана".into());
    }
    fresh_session(&a.id)
        .await
        .map(|x| x.access_token)
        .map_err(|_| "истёк вход Microsoft — перепривяжите лицензию".to_string())
}

pub(crate) async fn fresh_session(id: &str) -> Result<Account, String> {
    let _guard = SESSION_LOCK.lock().await;
    let a = accounts::get_account(id).ok_or("Аккаунт не найден")?;

    if !a.access_token.is_empty() && a.access_token != "0" && now() + 300 < a.token_expires {
        return Ok(a);
    }
    let fresh = crate::microsoft::refresh_account(&a.refresh_token).await?;

    accounts::update_tokens(
        &a.id,
        &fresh.access_token,
        &fresh.refresh_token,
        &fresh.uuid,
        &fresh.username,
        fresh.token_expires,
    );
    accounts::get_account(id).ok_or_else(|| "Аккаунт не найден".to_string())
}

async fn ok(r: reqwest::Response) -> Result<(), String> {
    if r.status().is_success() {
        return Ok(());
    }
    let code = r.status().as_u16();
    let body = r.text().await.unwrap_or_default();
    Err(match code {
        401 | 403 => "истёк вход Microsoft — перепривяжите лицензию".into(),
        429 => "Mojang просит подождать — слишком часто меняли облик".into(),
        _ => {
            let snippet: String = body.chars().take(160).collect();
            format!("Minecraft ответил {code}: {snippet}")
        }
    })
}

fn require_64(png: &[u8]) -> Result<(), String> {

    if png.len() < 24 {
        return Err("Файл скина повреждён".into());
    }
    let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    if w == 64 && h == 64 {
        return Ok(());
    }
    Err(format!(
        "Minecraft принимает только скины 64×64, а этот {w}×{h}"
    ))
}

async fn aciron_me(token: &str) -> Result<Value, String> {
    if token.is_empty() {
        return Err("NO_ACIRON".into());
    }
    let resp = crate::aciron::get("/api/me")?
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(OFFLINE.into());
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["user"].clone())
}

pub(crate) async fn profile(token: &str) -> Result<Value, String> {
    let r = http()?
        .get(PROFILE)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| MOJANG_OFFLINE.to_string())?;
    if !r.status().is_success() {
        return Err(ok(r).await.unwrap_err());
    }
    r.json().await.map_err(|e| e.to_string())
}

fn active_cape_id(profile: &Value) -> Option<String> {
    profile["capes"]
        .as_array()?
        .iter()
        .find(|c| c["state"].as_str() == Some("ACTIVE"))
        .and_then(|c| c["id"].as_str())
        .map(|s| s.to_string())
}

fn active_skin_url(profile: &Value) -> String {
    profile["skins"]
        .as_array()
        .and_then(|arr| arr.iter().find(|s| s["state"].as_str() == Some("ACTIVE")))
        .and_then(|s| s["url"].as_str())
        .unwrap_or_default()
        .to_string()
}

pub async fn sync_look() -> ApplyResult {
    let _guard = SYNC_LOCK.lock().await;
    match try_sync().await {
        Ok(synced) => ApplyResult {
            synced,
            error: None,
        },
        Err(e) => ApplyResult {
            synced: false,
            error: Some(e),
        },
    }
}

async fn try_sync() -> Result<bool, String> {
    let Some(snapshot) = accounts::active_account() else {
        return Ok(false);
    };

    if snapshot.kind != "aciron" || snapshot.aciron_token.is_empty() {
        return Ok(false);
    }

    let user = aciron_me(&snapshot.aciron_token).await?;

    let licensed = user["license"]["name"]
        .as_str()
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    if !licensed {
        return Ok(false);
    }

    let has_skin = user["hasSkin"].as_bool().unwrap_or(false);
    let has_cape = user["hasCape"].as_bool().unwrap_or(false);
    let skin_hash = user["skinHash"].as_str().unwrap_or("").to_string();
    let slim = user["skinModel"].as_str() == Some("slim");

    let skin_key = format!(
        "{has_skin}|{skin_hash}|{}",
        if slim { "slim" } else { "classic" }
    );

    let a = accounts::get_account(&snapshot.id).ok_or("Аккаунт не найден")?;

    let need_skin = a.mojang_look != skin_key;

    let need_cape = if has_cape {
        a.mojang_cape.is_empty()
    } else {
        !a.mojang_cape.is_empty()
    };
    if !need_skin && !need_cape {
        return Ok(true);
    }

    let token = mc_token(&a).await?;
    let mut failure: Option<String> = None;

    if need_skin {
        match sync_skin(&token, &a, has_skin, &skin_hash, slim).await {
            Ok(url) => {
                accounts::with_account(&a.id, |x| {
                    x.mojang_look = skin_key.clone();
                    x.mojang_skin = url.clone();
                });
            }

            Err(e) => failure = Some(e),
        }
    }

    if need_cape {
        match sync_cape(&token, &a, has_cape).await {
            Ok(memo) => {
                accounts::with_account(&a.id, |x| x.mojang_cape = memo.clone());
            }
            Err(e) => failure = failure.or(Some(e)),
        }
    }

    match failure {
        Some(e) => Err(e),
        None => Ok(true),
    }
}

async fn sync_skin(
    token: &str,
    a: &Account,
    has_skin: bool,
    skin_hash: &str,
    slim: bool,
) -> Result<String, String> {
    if has_skin {
        let url = format!(
            "{}/skins/{}.png?v={}",
            base(),
            a.aciron_name.to_lowercase(),
            skin_hash
        );
        let png = http()?
            .get(url)
            .send()
            .await
            .map_err(|_| OFFLINE.to_string())?
            .error_for_status()
            .map_err(|_| "не удалось забрать свой скин из Aciron".to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        require_64(&png)?;

        let part = reqwest::multipart::Part::bytes(png.to_vec())
            .file_name("skin.png")
            .mime_str("image/png")
            .map_err(|e| e.to_string())?;
        let form = reqwest::multipart::Form::new()
            .text("variant", if slim { "slim" } else { "classic" })
            .part("file", part);
        let r = http()?
            .post(format!("{PROFILE}/skins"))
            .bearer_auth(token)
            .multipart(form)
            .send()
            .await
            .map_err(|_| MOJANG_OFFLINE.to_string())?;
        ok(r).await?;

        return Ok(profile(token).await.map(|p| active_skin_url(&p)).unwrap_or_default());
    }

    if !a.mojang_look.starts_with("true|") {
        return Ok(String::new());
    }
    let there = active_skin_url(&profile(token).await?);
    if a.mojang_skin.is_empty() || there != a.mojang_skin {

        return Ok(String::new());
    }
    let r = http()?
        .delete(format!("{PROFILE}/skins/active"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| MOJANG_OFFLINE.to_string())?;

    if r.status().as_u16() != 404 {
        ok(r).await?;
    }
    Ok(String::new())
}

async fn sync_cape(token: &str, a: &Account, has_cape: bool) -> Result<String, String> {
    if has_cape {

        let memo = active_cape_id(&profile(token).await?)
            .unwrap_or_else(|| NOTHING_TO_RESTORE.to_string());
        let r = http()?
            .delete(format!("{PROFILE}/capes/active"))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| MOJANG_OFFLINE.to_string())?;
        if r.status().as_u16() != 404 {
            ok(r).await?;
        }
        return Ok(memo);
    }

    if a.mojang_cape == NOTHING_TO_RESTORE {

        return Ok(String::new());
    }
    if active_cape_id(&profile(token).await?).is_some() {

        return Ok(String::new());
    }
    let r = http()?
        .put(format!("{PROFILE}/capes/active"))
        .bearer_auth(token)
        .json(&json!({ "capeId": a.mojang_cape }))
        .send()
        .await
        .map_err(|_| MOJANG_OFFLINE.to_string())?;
    let code = r.status().as_u16();
    if r.status().is_success() || code == 400 || code == 404 {

        return Ok(String::new());
    }

    Err(ok(r).await.unwrap_err())
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

pub async fn capes() -> Result<Vec<LicenseCape>, String> {
    let Some(a) = accounts::active_account() else {
        return Ok(vec![]);
    };
    if !a.licensed {
        return Ok(vec![]);
    }
    let token = mc_token(&a).await?;
    let p = profile(&token).await?;
    Ok(p["capes"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|c| LicenseCape {
                    id: c["id"].as_str().unwrap_or_default().to_string(),
                    name: c["alias"].as_str().unwrap_or("Плащ").to_string(),
                    url: c["url"].as_str().unwrap_or_default().to_string(),
                    active: c["state"].as_str() == Some("ACTIVE"),
                })
                .filter(|c| !c.id.is_empty())
                .collect()
        })
        .unwrap_or_default())
}

pub async fn set_cape(cape_id: Option<String>) -> Result<(), String> {
    let _guard = SYNC_LOCK.lock().await;
    let a = accounts::active_account().ok_or("Нет активного аккаунта")?;
    let token = mc_token(&a).await?;

    let r = match &cape_id {
        Some(id) => http()?
            .put(format!("{PROFILE}/capes/active"))
            .bearer_auth(&token)
            .json(&json!({ "capeId": id }))
            .send()
            .await,
        None => http()?
            .delete(format!("{PROFILE}/capes/active"))
            .bearer_auth(&token)
            .send()
            .await,
    }
    .map_err(|_| MOJANG_OFFLINE.to_string())?;
    ok(r).await?;

    if cape_id.is_some() && !a.aciron_token.is_empty() {
        let _ = crate::aciron::post("/api/wardrobe/cape/license")?
            .header("Authorization", format!("Bearer {}", a.aciron_token))
            .send()
            .await;
    }

    accounts::with_account(&a.id, |x| x.mojang_cape.clear());
    Ok(())
}

pub async fn prove_license(aciron_token: &str, ms: &Account) -> Result<(), String> {
    let resp = crate::aciron::post("/api/license/challenge")?
        .header("Authorization", format!("Bearer {aciron_token}"))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err("Сервис Aciron ID не выдал метку для проверки лицензии".into());
    }
    let ch: Value = resp.json().await.map_err(|e| e.to_string())?;
    let server_id = ch["serverId"]
        .as_str()
        .ok_or("Сервис Aciron ID не выдал метку для проверки лицензии")?
        .to_string();

    let join = http()?
        .post("https://sessionserver.mojang.com/session/minecraft/join")
        .json(&json!({
            "accessToken": ms.access_token,
            "selectedProfile": ms.uuid.replace('-', ""),
            "serverId": server_id,
        }))
        .send()
        .await
        .map_err(|_| MOJANG_OFFLINE.to_string())?;
    if !join.status().is_success() {
        return Err(ok(join).await.unwrap_err());
    }

    let verify = crate::aciron::post("/api/license/verify")?
        .header("Authorization", format!("Bearer {aciron_token}"))
        .json(&json!({ "username": ms.username }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !verify.status().is_success() {
        let body = verify.text().await.unwrap_or_default();
        return Err(serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "Сервис Aciron ID не подтвердил лицензию".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{active_cape_id, active_skin_url, require_64};
    use serde_json::json;

    fn head(w: u32, h: u32) -> Vec<u8> {
        let mut v = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        v.extend_from_slice(&[0, 0, 0, 13]);
        v.extend_from_slice(b"IHDR");
        v.extend_from_slice(&w.to_be_bytes());
        v.extend_from_slice(&h.to_be_bytes());
        v
    }

    #[test]
    fn берём_только_64x64() {
        assert!(require_64(&head(64, 64)).is_ok());

        assert!(require_64(&head(64, 32)).is_err());
        assert!(require_64(&head(128, 128)).is_err());
        assert!(require_64(&[0x89, b'P']).is_err());
    }

    #[test]
    fn читаем_активные_текстуры_профиля() {
        let p = json!({
            "skins": [
                { "state": "INACTIVE", "url": "https://textures/old" },
                { "state": "ACTIVE", "url": "https://textures/now" }
            ],
            "capes": [
                { "id": "cape-a", "state": "INACTIVE" },
                { "id": "cape-b", "state": "ACTIVE" }
            ]
        });
        assert_eq!(active_skin_url(&p), "https://textures/now");
        assert_eq!(active_cape_id(&p).as_deref(), Some("cape-b"));

        let empty = json!({ "skins": [], "capes": [] });
        assert_eq!(active_skin_url(&empty), "");
        assert_eq!(active_cape_id(&empty), None);
    }
}
