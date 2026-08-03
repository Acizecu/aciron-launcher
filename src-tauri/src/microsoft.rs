use crate::accounts::{self, Account};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CLIENT_ID: &str = match option_env!("ACIRON_MS_CLIENT_ID") {
    Some(v) => v,
    None => "",
};

const AUTH_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

// B8: ленивый общий Client вместо нового на каждый вход/refresh (образец —
// modrinth.rs/aciron.rs). reqwest::Client — Arc внутри, дёшево клонируется и
// переиспользует пул/TLS-сессии. UA и таймауты — те же константы, сигнатура
// http() сохранена, поведение 1-в-1. Выигрыш небольшой (http() зовётся только на
// interactive_login/refresh_account), но правка тривиальна и безопасна.
fn http() -> Result<reqwest::Client, String> {
    static CLIENT: std::sync::OnceLock<Result<reqwest::Client, String>> =
        std::sync::OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("AcironLauncher/0.1")
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(20))
                .build()
                .map_err(|e| e.to_string())
        })
        .clone()
}

const AUTH_WINDOW: &str = "ms-auth";

fn open_auth_window(app: &AppHandle, url: &str) -> Option<tauri::WebviewWindow> {
    let parsed = url.parse().ok()?;

    if let Some(old) = app.get_webview_window(AUTH_WINDOW) {
        let _ = old.close();
    }
    match tauri::WebviewWindowBuilder::new(app, AUTH_WINDOW, tauri::WebviewUrl::External(parsed))
        .title("Вход через Microsoft")
        .inner_size(520.0, 720.0)
        .min_inner_size(400.0, 560.0)
        .center()
        .focused(true)
        .build()
    {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("[microsoft] окно входа не открылось ({e}) — уходим в браузер");
            None
        }
    }
}

fn urlencode(s: &str) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            // write! пишет hex прямо в буфер без промежуточного format!-String на
            // каждый байт. Вывод байт-в-байт тот же; write! в String инфаллибелен.
            _ => {
                let _ = write!(out, "%{b:02X}");
            }
        }
    }
    out
}

fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub async fn add_microsoft_account(app: AppHandle) -> Result<Account, String> {
    let acc = interactive_login(app).await?;
    Ok(accounts::save_account(acc))
}

pub async fn interactive_login(app: AppHandle) -> Result<Account, String> {
    if CLIENT_ID.is_empty() {
        return Err("Вход Microsoft не настроен в этой сборке (нет client_id)".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Не удалось открыть локальный порт: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://localhost:{port}");

    let mut raw = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut raw);
    let verifier = URL_SAFE_NO_PAD.encode(raw);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let state: String = rand::Rng::gen::<[u8; 16]>(&mut rand::thread_rng())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let auth_url = format!(
        "{AUTH_URL}?client_id={cid}&response_type=code&redirect_uri={ru}&response_mode=query\
         &scope={sc}&code_challenge={ch}&code_challenge_method=S256&state={st}&prompt=select_account",
        cid = CLIENT_ID,
        ru = urlencode(&redirect),
        sc = urlencode(SCOPE),
        ch = challenge,
        st = state,
    );

    let auth_window = open_auth_window(&app, &auth_url);

    let _ = app.emit(
        "ms-auth-open",
        json!({ "url": auth_url, "embedded": auth_window.is_some() }),
    );

    let (closed_tx, closed_rx) = tokio::sync::oneshot::channel::<()>();
    if let Some(w) = &auth_window {
        let tx = std::sync::Mutex::new(Some(closed_tx));
        w.on_window_event(move |e| {
            if matches!(e, tauri::WindowEvent::Destroyed) {
                if let Ok(mut g) = tx.lock() {
                    if let Some(t) = g.take() {
                        let _ = t.send(());
                    }
                }
            }
        });
    }

    let code = tokio::select! {
        r = wait_for_code(&listener, Duration::from_secs(300), &state) => r,
        _ = closed_rx => Err("Окно входа Microsoft закрыто — вход отменён".to_string()),
    };
    if let Some(w) = &auth_window {
        let _ = w.close();
    }
    let code = code?;

    let cl = http()?;
    let tok: Value = cl
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("code_verifier", verifier.as_str()),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(err) = tok.get("error").and_then(|v| v.as_str()) {
        let desc = tok["error_description"].as_str().unwrap_or(err);
        return Err(format!("Microsoft: {desc}"));
    }
    let ms_access = tok["access_token"]
        .as_str()
        .ok_or("Microsoft: не получен токен доступа")?
        .to_string();
    let refresh = tok["refresh_token"].as_str().unwrap_or("").to_string();

    finish_login(&cl, &ms_access, &refresh).await
}

async fn wait_for_code(
    listener: &TcpListener,
    timeout: Duration,
    expected_state: &str,
) -> Result<String, String> {
    let accept = async {
        loop {
            let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
            let req = String::from_utf8_lossy(&buf[..n]);
            let path = req
                .lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(1))
                .unwrap_or("");
            let query = path.split('?').nth(1).unwrap_or("");
            let params: HashMap<String, String> = query
                .split('&')
                .filter_map(|kv| {
                    let mut it = kv.splitn(2, '=');
                    Some((it.next()?.to_string(), it.next().unwrap_or("").to_string()))
                })
                .collect();

            if let Some(err) = params.get("error") {
                reply(&mut stream, "Вход не удался. Можно закрыть вкладку и вернуться в лаунчер.").await;
                return Err(format!("Microsoft: {}", urldecode(err)));
            }
            if let Some(code) = params.get("code") {

                let got_state = params.get("state").map(|s| urldecode(s)).unwrap_or_default();
                if got_state != expected_state {
                    eprintln!("[microsoft] OAuth: несовпадение state — запрос отклонён");
                    let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n").await;
                    let _ = stream.flush().await;
                    continue;
                }
                reply(&mut stream, "Готово! Вернитесь в Aciron Launcher — вкладку можно закрыть.").await;
                return Ok(urldecode(code));
            }

            let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\n\r\n").await;
        }
    };
    match tokio::time::timeout(timeout, accept).await {
        Ok(r) => r,
        Err(_) => Err("Время ожидания входа истекло, попробуйте снова".into()),
    }
}

async fn reply(stream: &mut tokio::net::TcpStream, msg: &str) {
    let body = format!(
        "<!doctype html><html lang=ru><meta charset=utf-8>\
         <title>Aciron Launcher</title>\
         <body style=\"margin:0;height:100vh;display:grid;place-items:center;\
         font-family:system-ui,Segoe UI,sans-serif;background:#12131a;color:#e7e3dd\">\
         <div style=\"text-align:center\"><div style=\"font-size:44px\">✅</div>\
         <p style=\"font-size:16px;max-width:360px;line-height:1.5\">{msg}</p></div></body></html>"
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.flush().await;
}

pub async fn refresh_account(refresh_token: &str) -> Result<Account, String> {
    if refresh_token.is_empty() {
        return Err("Нет refresh-токена — войдите в Microsoft заново".into());
    }
    let cl = http()?;
    let tok: Value = cl
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let ms_access = tok["access_token"]
        .as_str()
        .ok_or("Сессия Microsoft истекла — войдите заново")?
        .to_string();
    let new_refresh = tok["refresh_token"]
        .as_str()
        .unwrap_or(refresh_token)
        .to_string();

    finish_login(&cl, &ms_access, &new_refresh).await
}

async fn finish_login(
    cl: &reqwest::Client,
    ms_access: &str,
    refresh: &str,
) -> Result<Account, String> {

    let xbl: Value = cl
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={ms_access}"),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let xbl_token = xbl["Token"]
        .as_str()
        .ok_or("Xbox Live: не удалось получить токен")?
        .to_string();

    let xsts: Value = cl
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(xerr) = xsts.get("XErr").and_then(|v| v.as_u64()) {
        let msg = match xerr {
            2148916233 => "У аккаунта Microsoft нет профиля Xbox — создайте его на xbox.com",
            2148916235 => "Xbox Live недоступен в вашем регионе",
            2148916236 | 2148916237 => "Требуется подтверждение возраста для Xbox",
            2148916238 => "Детский аккаунт: добавьте его в семейную группу Microsoft",
            _ => "Не удалось авторизоваться в Xbox (XSTS)",
        };
        return Err(msg.into());
    }
    let xsts_token = xsts["Token"]
        .as_str()
        .ok_or("XSTS: не удалось получить токен")?
        .to_string();
    let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .or_else(|| xbl["DisplayClaims"]["xui"][0]["uhs"].as_str())
        .ok_or("XSTS: отсутствует uhs")?
        .to_string();

    let mc_resp = cl
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mc_status = mc_resp.status();
    let mc_text = mc_resp.text().await.unwrap_or_default();
    let mc: Value = serde_json::from_str(&mc_text).unwrap_or(Value::Null);
    let mc_token = mc["access_token"]
        .as_str()
        .ok_or_else(|| {
            let snippet: String = mc_text.chars().take(300).collect();
            format!("Minecraft login [{mc_status}]: {snippet}")
        })?
        .to_string();

    let resp = cl
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&mc_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("На этом аккаунте Microsoft не куплен Minecraft".into());
    }
    let profile: Value = resp.json().await.map_err(|e| e.to_string())?;
    let uuid = profile["id"].as_str().unwrap_or("").to_string();
    let name = profile["name"].as_str().unwrap_or("Player").to_string();
    let skin_url = profile["skins"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|s| s["state"].as_str() == Some("ACTIVE"))
                .or_else(|| arr.first())
        })
        .and_then(|s| s["url"].as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("https://crafatar.com/skins/{uuid}"));

    let token_expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        + 20 * 3600;

    let acc = Account {
        id: accounts::gen_id(),
        username: name,
        uuid,
        kind: "microsoft".into(),
        access_token: mc_token,
        skin_url,
        refresh_token: refresh.to_string(),
        aciron_token: String::new(),
        aciron_name: String::new(),
        licensed: false,
        token_expires,
    };
    Ok(acc)
}
