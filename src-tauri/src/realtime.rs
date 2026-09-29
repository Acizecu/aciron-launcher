

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    protocol::{frame::coding::CloseCode, CloseFrame},
    Message,
};
use futures::{SinkExt, StreamExt};

const PING_EVERY: Duration = Duration::from_secs(20);
const READ_TIMEOUT: Duration = Duration::from_secs(60);
const HELLO_TIMEOUT: Duration = Duration::from_secs(10);
const UNAUTHORIZED: u16 = 4401;

#[derive(Default)]
struct State {
    connected: bool,

    token: String,

    rejected: String,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
}

enum Out {
    Frame(String),
    Close,
}

fn outbox() -> &'static Mutex<Option<UnboundedSender<Out>>> {
    static O: OnceLock<Mutex<Option<UnboundedSender<Out>>>> = OnceLock::new();
    O.get_or_init(|| Mutex::new(None))
}

fn ws_send(frame: String) -> bool {
    if let Ok(o) = outbox().lock() {
        if let Some(tx) = o.as_ref() {
            return tx.send(Out::Frame(frame)).is_ok();
        }
    }
    false
}

#[tauri::command]
pub fn realtime_send_typing(user_id: String) {
    ws_send(serde_json::json!({ "t": "typing", "to": user_id }).to_string());
}

pub fn send_game_state(in_game: bool) {
    let status = if in_game { "in_game" } else { "online" };
    ws_send(serde_json::json!({ "status": status }).to_string());
}

#[tauri::command]
pub fn realtime_connected() -> bool {
    state().lock().map(|s| s.connected).unwrap_or(false)
}

pub async fn shutdown() {
    let tx = outbox().lock().ok().and_then(|o| o.clone());
    if let Some(tx) = tx {
        let _ = tx.send(Out::Frame(serde_json::json!({ "t": "bye" }).to_string()));
        let _ = tx.send(Out::Close);
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
}

fn ws_url() -> String {
    let base = crate::aciron::base();
    let scheme = if base.starts_with("https://") { "wss://" } else { "ws://" };
    let rest = base
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    format!("{scheme}{rest}/ws")
}

fn apply_message(app: &AppHandle, text: &str) -> Option<&'static str> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;

    if v["type"].as_str() == Some("snapshot") {
        return Some("hello");
    }
    match v["t"].as_str().unwrap_or("") {
        "hello" => return Some("hello"),
        "auth-failed" => return Some("auth-failed"),
        "friends" => {
            let _ = app.emit("friends-changed", ());
        }
        "announce" => {
            let _ = app.emit("announce-changed", ());
        }

        "servers" => {
            let _ = app.emit("servers-changed", ());
        }
        "promo" => {
            let _ = app.emit("promo-changed", ());
        }
        "content" => {
            let _ = app.emit("content-changed", ());
        }
        "support" => {
            let _ = app.emit("support-changed", v["ticketId"].clone());
        }
        "chat" => {
            let _ = app.emit(
                "chat-message",
                serde_json::json!({ "with": v["with"].clone(), "message": v["message"].clone() }),
            );
        }
        "chat-read" => {
            let _ = app.emit("chat-read", v["by"].clone());
        }
        "typing" => {
            let _ = app.emit("chat-typing", serde_json::json!({ "with": v["from"].clone() }));
        }
        "chat-deleted" => {
            let _ = app.emit("chat-deleted", v["ids"].clone());
        }
        _ => {}
    }

    if v["type"].as_str() == Some("status") {
        let _ = app.emit("friends-changed", ());
    }
    None
}

fn active_token() -> Option<String> {
    match crate::accounts::active_account() {
        Some(a) if a.kind == "aciron" && !a.aciron_token.is_empty() => Some(a.aciron_token),
        _ => None,
    }
}

enum Ended {

    Normal,

    Unauthorized,
}

async fn run_once(app: &AppHandle, token: &str) -> Result<Ended, String> {
    let mut req = ws_url().into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}").parse().map_err(|_| "bad token".to_string())?,
    );
    req.headers_mut().insert(
        "X-Aciron-Client",
        format!("launcher/{}", env!("CARGO_PKG_VERSION"))
            .parse()
            .map_err(|_| "bad header".to_string())?,
    );

    let (stream, _) = tokio::time::timeout(Duration::from_secs(15), tokio_tungstenite::connect_async(req))
        .await
        .map_err(|_| "connect timeout".to_string())?
        .map_err(|e| e.to_string())?;
    let (mut write, mut read) = stream.split();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Out>();
    if let Ok(mut o) = outbox().lock() {
        *o = Some(tx.clone());
    }
    let writer = tokio::spawn(async move {
        while let Some(out) = rx.recv().await {
            let res = match out {
                Out::Frame(f) => write.send(Message::Text(f)).await,
                Out::Close => {
                    let _ = write
                        .send(Message::Close(Some(CloseFrame {
                            code: CloseCode::Normal,
                            reason: "launcher closed".into(),
                        })))
                        .await;
                    break;
                }
            };
            if res.is_err() {
                break;
            }
        }

        let _ = write.close().await;
    });

    if let Ok(mut s) = state().lock() {
        s.token = token.to_string();
    }

    let opened = Instant::now();
    let mut hello = false;
    let mut last_rx = Instant::now();
    let mut ping = tokio::time::interval(PING_EVERY);
    ping.tick().await;
    let mut token_check = tokio::time::interval(Duration::from_secs(3));

    let result = loop {
        tokio::select! {
            msg = read.next() => {
                last_rx = Instant::now();
                match msg {
                    Some(Ok(Message::Text(t))) => match apply_message(app, &t) {
                        Some("hello") if !hello => {
                            hello = true;
                            if let Ok(mut s) = state().lock() {
                                s.connected = true;
                                s.rejected.clear();
                            }
                            let _ = app.emit("realtime-state", true);
                            eprintln!("[realtime] connected");

                            if crate::presence::in_game() {
                                send_game_state(true);
                            }
                        }
                        Some("auth-failed") => break Ok(Ended::Unauthorized),
                        _ => {}
                    },
                    Some(Ok(Message::Close(frame))) => {
                        let code = frame.map(|f| u16::from(f.code)).unwrap_or(1000);
                        break if code == UNAUTHORIZED { Ok(Ended::Unauthorized) } else { Ok(Ended::Normal) };
                    }
                    None => break Ok(Ended::Normal),
                    Some(Err(e)) => break Err(e.to_string()),

                    Some(Ok(_)) => {}
                }
            }
            _ = ping.tick() => {

                let _ = tx.send(Out::Frame(r#"{"t":"ping"}"#.to_string()));
                if last_rx.elapsed() > READ_TIMEOUT {
                    break Err("no frames from the server, reconnecting".into());
                }
            }
            _ = token_check.tick() => {
                if !hello && opened.elapsed() > HELLO_TIMEOUT {
                    break Err("server did not confirm the session".into());
                }

                if active_token().as_deref() != Some(token) {
                    let _ = tx.send(Out::Close);
                    break Ok(Ended::Normal);
                }
            }
        }
    };

    if let Ok(mut o) = outbox().lock() {
        *o = None;
    }
    drop(tx);
    let _ = tokio::time::timeout(Duration::from_millis(500), writer).await;

    if let Ok(mut s) = state().lock() {
        s.connected = false;
        s.token.clear();
    }
    let _ = app.emit("realtime-state", false);
    result
}

pub async fn connect_loop(app: AppHandle) {
    const MIN_BACKOFF: Duration = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);
    let mut backoff = MIN_BACKOFF;

    loop {
        let token = match active_token() {
            Some(t) => t,
            None => {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        let rejected = state().lock().map(|s| s.rejected == token).unwrap_or(false);
        if rejected {
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }

        match run_once(&app, &token).await {
            Ok(Ended::Normal) => backoff = MIN_BACKOFF,
            Ok(Ended::Unauthorized) => {
                eprintln!("[realtime] token rejected, waiting for a new sign-in");
                if let Ok(mut s) = state().lock() {
                    s.rejected = token.clone();
                }
                let _ = app.emit("realtime-auth-failed", ());
            }
            Err(e) => {
                eprintln!("[realtime] connection lost: {e}");
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
        tokio::time::sleep(backoff).await;
    }
}
