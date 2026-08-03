

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

/// Шлёт JSON-кадр в сокет, если соединение живо (best-effort).
fn ws_send(frame: String) {
    if let Ok(o) = outbox().lock() {
        if let Some(tx) = o.as_ref() {
            let _ = tx.send(frame);
        }
    }
}

/// Сообщить собеседнику, что мы печатаем. Best-effort: если сокет не подключён —
/// молча ничего не делаем (typing не критичен). Сервер должен ретранслировать
/// кадр {t:"typing", to} адресату как {t:"typing", from:<наш id>} (см. спеку).
#[tauri::command]
pub fn realtime_send_typing(user_id: String) {
    ws_send(serde_json::json!({ "t": "typing", "to": user_id }).to_string());
}

/// Живо ли соединение. Панель друзей по этому решает, нужен ли запасной опрос.
#[tauri::command]
pub fn realtime_connected() -> bool {
    state().lock().map(|s| s.connected).unwrap_or(false)
}

/// http(s):// → ws(s)://, путь /ws.
fn ws_url() -> String {
    let base = crate::aciron::base();
    let scheme = if base.starts_with("https://") { "wss://" } else { "ws://" };
    let rest = base
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_end_matches('/');
    format!("{scheme}{rest}/ws")
}

/// Разбирает сообщение сервиса и превращает его в событие для фронта.
///
/// Сам снимок данных сюда не приходит и приходить не должен: присутствие
/// считается из нескольких полей с учётом приватности каждого, и повторять эту
/// логику на клиенте значило бы завести вторую версию правды. Сервис говорит
/// только «изменилось», а фронт перечитывает готовый ответ обычным запросом.
fn apply_message(app: &AppHandle, text: &str) {
    let v: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };
    match v["t"].as_str().unwrap_or("") {
        "friends" => {
            let _ = app.emit("friends-changed", ());
        }
        // Сообщение приходит целиком: в отличие от присутствия, считать здесь
        // нечего — что записано в базе, то и показываем. Поле `with` сервис
        // считает под каждого получателя отдельно, поэтому фронту не нужно
        // знать собственный идентификатор, чтобы разложить сообщения по
        // перепискам.
        "chat" => {
            let _ = app.emit(
                "chat-message",
                serde_json::json!({ "with": v["with"].clone(), "message": v["message"].clone() }),
            );
        }
        // Собеседник прочитал наши сообщения.
        "chat-read" => {
            let _ = app.emit("chat-read", v["by"].clone());
        }
        // Собеседник печатает. Сервер шлёт {t:"typing", from:<id отправителя>};
        // фронт ключует индикатор по `with` (id собеседника), как и chat-message.
        "typing" => {
            let _ = app.emit("chat-typing", serde_json::json!({ "with": v["from"].clone() }));
        }
        // Сообщения удалены — идентификаторы без указания переписки: клиент
        // убирает их везде, где найдёт, и одним событием закрываются удаления
        // сразу из нескольких разговоров.
        "chat-deleted" => {
            let _ = app.emit("chat-deleted", v["ids"].clone());
        }
        _ => {}
    }
}

/// Одна попытка: подключиться и качать сообщения, пока соединение живо.
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

    // Задача-писатель владеет write-половиной и шлёт кадры из канала outbox.
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
    // Успех тоже пишем: без него в логе видны только падения, и «тишина»
    // одинаково означает и «всё хорошо», и «даже не пытались» (нет аккаунта).
    eprintln!("[realtime] соединение установлено");

    let result = loop {
        match read.next().await {
            Some(Ok(Message::Text(t))) => apply_message(app, &t),
            // На ping отвечает сама библиотека; нам важно лишь не выйти.
            Some(Ok(Message::Ping(_))) | Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | None => break Ok(()),
            Some(Err(e)) => break Err(e.to_string()),
            _ => {}
        }
    };

    // Соединение закрылось: обнуляем outbox (дальнейшие send станут no-op) и
    // гасим задачу-писателя, чтобы она не висела на мёртвом сокете.
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

/// Фоновый цикл: держит соединение, переподключается с нарастающей паузой.
pub async fn connect_loop(app: AppHandle) {
    // Пауза растёт до минуты: сервис может лежать, и долбить его раз в секунду
    // всеми клиентами сразу — верный способ не дать ему подняться.
    const MIN_BACKOFF: Duration = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);
    let mut backoff = MIN_BACKOFF;

    loop {
        let token = match crate::accounts::active_account() {
            Some(a) if a.kind == "aciron" && !a.aciron_token.is_empty() => a.aciron_token,
            // Аккаунта Aciron ID нет — держать соединение не для кого.
            _ => {
                tokio::time::sleep(Duration::from_secs(15)).await;
                continue;
            }
        };

        match run_once(&app, &token).await {
            // Соединение прожило и закрылось штатно — пробуем сразу.
            Ok(()) => backoff = MIN_BACKOFF,
            Err(e) => {
                eprintln!("[realtime] соединение потеряно: {e}");
                backoff = (backoff * 2).min(MAX_BACKOFF);
            }
        }
        tokio::time::sleep(backoff).await;
    }
}
