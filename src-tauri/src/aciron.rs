use crate::accounts::{self, Account};
use crate::launcher::offline_uuid;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;

const DEFAULT_BASE: &str = match option_env!("ACIRON_ID_URL") {
    Some(u) => u,
    None => "https://example.invalid",
};

pub(crate) fn base() -> &'static str {
    static B: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    B.get_or_init(|| std::env::var("ACIRON_ID_BASE").unwrap_or_else(|_| DEFAULT_BASE.to_string()))
}

fn client_id() -> String {
    format!("launcher/{}", env!("CARGO_PKG_VERSION"))
}

const CLIENT_KEY: &str = match option_env!("ACIRON_CLIENT_KEY") {
    Some(k) => k,
    None => "",
};

pub(crate) fn http() -> Result<reqwest::Client, String> {
    static CLIENT: std::sync::OnceLock<Result<reqwest::Client, String>> =
        std::sync::OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("AcironLauncher")

                .connect_timeout(std::time::Duration::from_secs(8))
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .map_err(|e| e.to_string())
        })
        .clone()
}

fn sign_headers(method: &str, path: &str) -> Vec<(&'static str, String)> {
    let mut out = vec![("X-Aciron-Client", client_id())];
    if CLIENT_KEY.is_empty() {
        return out;
    }
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    use rand::Rng;
    let nonce: String = rand::thread_rng()
        .gen::<[u8; 16]>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let mut mac = <Hmac<Sha256>>::new_from_slice(CLIENT_KEY.as_bytes()).expect("HMAC accepts a key of any size");
    mac.update(format!("{method}\n{path}\n{ts}\n{nonce}").as_bytes());
    let sign = mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();

    out.push(("X-Aciron-Ts", ts.to_string()));
    out.push(("X-Aciron-Nonce", nonce));
    out.push(("X-Aciron-Sign", sign));
    out
}

pub(crate) fn request(
    method: reqwest::Method,
    path: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let mut rb = http()?.request(method.clone(), format!("{}{}", base(), path));
    for (k, v) in sign_headers(method.as_str(), path) {
        rb = rb.header(k, v);
    }
    Ok(rb)
}

pub(crate) fn get(path: &str) -> Result<reqwest::RequestBuilder, String> {
    request(reqwest::Method::GET, path)
}
pub(crate) fn post(path: &str) -> Result<reqwest::RequestBuilder, String> {
    request(reqwest::Method::POST, path)
}
pub(crate) fn patch(path: &str) -> Result<reqwest::RequestBuilder, String> {
    request(reqwest::Method::PATCH, path)
}
pub(crate) fn delete(path: &str) -> Result<reqwest::RequestBuilder, String> {
    request(reqwest::Method::DELETE, path)
}

pub(crate) const OFFLINE: &str = "Aciron ID service is unavailable";

pub(crate) fn active_token() -> Result<String, String> {
    match accounts::active_account() {
        Some(a) if a.kind == "aciron" && !a.aciron_token.is_empty() => Ok(a.aciron_token),
        _ => Err("NO_ACIRON".into()),
    }
}

#[derive(Deserialize)]
struct AuthResp {
    token: String,
    user: IdUser,
}

#[derive(Deserialize)]
struct IdUser {
    username: String,
    #[serde(default, rename = "hasSkin")]
    has_skin: bool,
    #[serde(default)]
    license: Option<License>,
}

#[derive(Deserialize)]
struct License {
    name: String,
    #[serde(default)]
    uuid: String,
}

async fn read_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("Couldn't reach your Aciron ID account: {status}"))
}

fn id_skin_url(name: &str) -> String {
    format!("{}/skins/{}.png", base(), name.to_lowercase())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStart {

    pub account: Option<Account>,
    pub twofa_required: bool,

    pub ticket: String,

    pub methods: Vec<String>,
}

#[tauri::command]
pub async fn aciron_login_start(login: String, password: String) -> Result<LoginStart, String> {
    let resp = post("/api/login")?
        .json(&json!({ "login": login.trim(), "password": password }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if status.as_u16() == 403 && body["needsVerification"].as_bool() == Some(true) {
        let mail = body["email"].as_str().unwrap_or("");
        return Err(format!("EMAIL_NOT_VERIFIED:{mail}"));
    }
    if !status.is_success() {
        return Err(body["error"].as_str().unwrap_or("Couldn't sign in to Aciron ID").to_string());
    }

    if body["twofaRequired"].as_bool() == Some(true) {
        let ticket = body["ticket"].as_str().unwrap_or_default().to_string();
        if ticket.is_empty() {
            return Err("Couldn't sign in to Aciron ID".into());
        }
        let methods = body["methods"]
            .as_array()
            .map(|a| a.iter().filter_map(|m| m.as_str().map(String::from)).collect())
            .unwrap_or_default();
        return Ok(LoginStart {
            account: None,
            twofa_required: true,
            ticket,
            methods,
        });
    }

    let data: AuthResp = serde_json::from_value(body).map_err(|e| e.to_string())?;
    Ok(LoginStart {
        account: Some(account_from(data)),
        twofa_required: false,
        ticket: String::new(),
        methods: Vec::new(),
    })
}

#[tauri::command]
pub async fn aciron_login_finish(ticket: String, code: String) -> Result<Account, String> {
    let resp = post("/api/login/2fa")?
        .json(&json!({ "ticket": ticket, "code": code.trim() }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error(resp).await);
    }
    let data: AuthResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(account_from(data))
}

#[tauri::command]
pub async fn aciron_login_telegram_send(ticket: String) -> Result<(), String> {
    let resp = post("/api/login/telegram/send")?
        .json(&json!({ "ticket": ticket }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error(resp).await);
    }
    Ok(())
}

fn account_from(data: AuthResp) -> Account {
    let name = data.user.username;

    let licensed = data.user.license.is_some();
    let (username, uuid) = match &data.user.license {
        Some(l) => (l.name.clone(), l.uuid.clone()),
        None => (name.clone(), offline_uuid(&name)),
    };

    let acc = Account {
        id: accounts::gen_id(),
        username,
        uuid,
        kind: "aciron".into(),
        access_token: "0".into(),
        skin_url: if data.user.has_skin {
            id_skin_url(&name)
        } else {
            String::new()
        },
        refresh_token: String::new(),
        aciron_token: data.token,
        aciron_name: name,
        licensed,
        token_expires: 0,
        mojang_look: String::new(),
        mojang_skin: String::new(),
        mojang_cape: String::new(),
    };
    accounts::save_account(acc)
}

#[tauri::command]
pub async fn aciron_register(
    username: String,
    email: String,
    password: String,
) -> Result<String, String> {
    let resp = post("/api/register")?
        .json(&json!({
            "username": username.trim(),
            "email": email.trim(),
            "password": password,
        }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error(resp).await);
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(body["email"].as_str().unwrap_or(email.trim()).to_string())
}

#[tauri::command]
pub async fn aciron_verify_email(email: String, code: String) -> Result<Account, String> {
    let resp = post("/api/verify-email")?
        .json(&json!({ "email": email.trim(), "code": code.trim() }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    if !resp.status().is_success() {
        return Err(read_error(resp).await);
    }
    let data: AuthResp = resp.json().await.map_err(|e| e.to_string())?;
    Ok(account_from(data))
}

#[tauri::command]
pub async fn aciron_resend_code(email: String) -> Result<(), String> {
    post("/api/verify-email/resend")?
        .json(&json!({ "email": email.trim() }))
        .send()
        .await
        .map_err(|_| OFFLINE.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn aciron_link_license(app: AppHandle, account_id: String) -> Result<Account, String> {
    let acc = accounts::get_account(&account_id).ok_or("Account not found")?;
    if acc.kind != "aciron" || acc.aciron_token.is_empty() {
        return Err("A licence can only be linked to an Aciron ID account".into());
    }

    let ms = crate::microsoft::interactive_login(app).await?;

    crate::mojang::prove_license(&acc.aciron_token, &ms).await?;

    let updated = accounts::with_account(&account_id, |a| {
        a.username = ms.username.clone();
        a.uuid = ms.uuid.clone();
        a.access_token = ms.access_token.clone();
        a.refresh_token = ms.refresh_token.clone();
        a.token_expires = ms.token_expires;
        a.skin_url = ms.skin_url.clone();
        a.licensed = true;

        a.mojang_look.clear();
        a.mojang_cape.clear();
    })
    .ok_or_else(|| "Account not found".to_string())?;

    let r = crate::mojang::sync_look().await;
    if let Some(e) = r.error {
        eprintln!("[mojang] look was not transferred after linking the licence: {e}");
    }
    Ok(updated)
}

pub async fn add_playtime(token: String, secs: u64) {
    if token.is_empty() || secs == 0 {
        return;
    }
    if let Ok(cl) = http() {
        let _ = cl
            .post(format!("{}/api/playtime", base()))
            .header("Authorization", format!("Bearer {token}"))
            .json(&json!({ "secs": secs }))
            .send()
            .await;
    }
}
