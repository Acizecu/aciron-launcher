

use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
use futures::{SinkExt, StreamExt};

#[derive(Default)]
struct State {
    connected: bool,
}

fn state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::default()))
}

/// Исходящая очередь в активный сокет. Раньше write-половина сокета отбрасывалась
/// (клиент был read-only). Теперь при подключении отдельная задача-писатель владеет
/// write-половиной и читает JSON-кадры из этого канала; команды (typing и т.п.) шлют
/// строки сюда, не деля сложный SplitSink и не конкурируя с обработкой ping. При
/// обрыве соединения sender обнуляется, и отправка становится no-op.
fn outbox() -> &'static Mutex<Option<UnboundedSender<String>>> {
    static O: OnceLock<Mutex<Option<UnboundedSender<String>>>> = OnceLock::new();
    O.get_or_init(|| Mutex::new(None))
}

fn ws_send(frame: String) {
    if let Ok(o) = outbox().lock() {
        if let Some(tx) = o.as_ref() {
            let _ = tx.send(frame);
        }
    }
}

#[tauri::command]
pub fn realtime_send_typing(user_id: String) {
    ws_send(serde_json::json!({ "t": "typing", "to": user_id }).to_string());
}

#[tauri::command]
pub fn realtime_connected() -> bool {
    state().lock().map(|s| s.connected).unwrap_or(false)
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

fn apply_message(app: &AppHandle, text: &str) {
    let v: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };
    match v["t"].as_str().unwrap_or("") {
        "friends" => {
            let _ = app.emit("friends-changed", ());
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
}

async fn run_once(app: &AppHandle, token: &str) -> Result<(), String> {
    let mut req = ws_url().into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert(
        "Authorization",
        format!("Bearer {token}")
            .parse()
            .map_err(|_| "плохой токен".to_string())?,
    );

    let (stream, _) = tokio_tungstenite::connect_async(req)
        .await
        .map_err(|e| e.to_string())?;
    let (mut write, mut read) = stream.split();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    if let Ok(mut o) = outbox().lock() {
        *o = Some(tx);
    }
    let writer = tokio::spawn(async move {
        while let Some(frame) = rx.recv().await {
            if write.send(Message::Text(frame)).await.is_err() {
                break;
            }
        }
    });

    if let Ok(mut s) = state().lock() {
        s.connected = true;
    }
    let _ = app.emit("realtime-state", true);

    eprintln!("[realtime] соединение установлено");

    let result = loop {
        match read.next().await {
            Some(Ok(Message::Text(t))) => apply_message(app, &t),

            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | None => break Ok(()),
            Some(Err(e)) => break Err(e.to_string()),
            _ => {}
        }
    };

    if let Ok(mut o) = outbox().lock() {
        *o = None;
    }
    writer.abort();

    if let Ok(mut s) = state().lock() {
        s.connected = false;
    }
    let _ = app.emit("realtime-state", false);
    result
}

pub async fn connect_loop(app: AppHandle) {

    const MIN_BACKOFF: Duration = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);
    let mut backoff = MIN_BACKOFF;

    loop {
        let token = match crate::accounts::active_account() {
            Some(a) if a.kind == "aciron" && !a.aciron_token.is_empty() => a.aciron_token,

            _ => {
                tokio::time::sleep(Duration::from_secs(15)).await;
                continue;
            }
        };

        match run_once(&app, &token).await {

            Ok(()) => backoff = MIN_BACKOFF,
            Err(e) => {
                eprintln!("[realtime] соединение потеряно: {e}");
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
        tokio::time::sleep(backoff).await;
    }
}
