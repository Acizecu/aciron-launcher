use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const CLIENT_ID: &str = "1529603969939280003";

const DOWNLOAD_URL: &str = "https://aciron.pro";

#[derive(Clone)]
enum State {
    Idle,
    Version(String),
    Build { name: String },
}

fn slot() -> &'static Mutex<Option<DiscordIpcClient>> {
    static S: OnceLock<Mutex<Option<DiscordIpcClient>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn last_state() -> &'static Mutex<State> {
    static S: OnceLock<Mutex<State>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(State::Idle))
}

static ENABLED: AtomicBool = AtomicBool::new(true);

fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

fn configured() -> bool {
    !CLIENT_ID.starts_with("REPLACE") && !CLIENT_ID.is_empty()
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Стабильная метка старта сессии лаунчера: задаётся один раз и используется для
/// ВСЕХ состояний (idle/версия/сборка). Благодаря этому таймер в Discord не
/// сбрасывается при смене статуса (вход/выход из игры, скрытие окна) — меняется
/// только текст, а отсчёт продолжается в фоне.
fn session_start() -> i64 {
    static S: OnceLock<i64> = OnceLock::new();
    *S.get_or_init(now)
}

pub fn init() {

    ENABLED.store(crate::settings::load_settings().discord_rpc, Ordering::Relaxed);
    if !configured() || !enabled() {
        return;
    }
    connect();
    set_idle();
}

fn connect() {
    if let Ok(g) = slot().lock() {
        if g.is_some() {
            return;
        }
    }
    if let Ok(mut client) = DiscordIpcClient::new(CLIENT_ID) {
        if client.connect().is_ok() {
            if let Ok(mut g) = slot().lock() {
                *g = Some(client);
            }
        }
    }
}

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
    if !configured() {
        return;
    }
    if on {
        connect();

        let st = last_state().lock().map(|s| s.clone()).unwrap_or(State::Idle);
        match st {
            State::Idle => set_idle(),
            State::Version(v) => set_version(&v),
            State::Build { name } => set_build(&name),
        }
    } else if let Ok(mut g) = slot().lock() {
        if let Some(c) = g.as_mut() {
            let _ = c.clear_activity();
            let _ = c.close();
        }
        *g = None;
    }
}

fn download_button() -> Vec<Button<'static>> {
    vec![Button::new("Скачать лаунчер", DOWNLOAD_URL)]
}

fn apply(act: Activity) {
    if !enabled() {
        return;
    }
    if let Ok(mut g) = slot().lock() {
        if let Some(c) = g.as_mut() {
            let _ = c.set_activity(act);
        }
    }
}

/// «Просто в лаунчере».
pub fn set_idle() {
    if let Ok(mut s) = last_state().lock() {
        *s = State::Idle;
    }
    if !configured() || !enabled() {
        return;
    }
    apply(
        Activity::new()
            .details("В лаунчере")
            .state("Отдыхает")
            .assets(Assets::new().large_image("logo").large_text("Aciron Launcher"))
            .timestamps(Timestamps::new().start(session_start()))
            .buttons(download_button()),
    );
}

/// «Играет на <версия>» — маленькая картинка всегда grass (обычная версия).
pub fn set_version(version: &str) {
    if let Ok(mut s) = last_state().lock() {
        *s = State::Version(version.to_string());
    }
    if !configured() || !enabled() {
        return;
    }
    apply(
        Activity::new()
            .details(&format!("Играет на {version}"))
            .state("Minecraft")
            .assets(
                Assets::new()
                    .large_image("logo")
                    .large_text("Aciron Launcher")
                    .small_image("grass")
                    .small_text(version),
            )
            .timestamps(Timestamps::new().start(session_start()))
            .buttons(download_button()),
    );
}

/// «Играет в <сборка>» — логотип + трава (обложку по названию не ищем).
pub fn set_build(name: &str) {
    if let Ok(mut s) = last_state().lock() {
        *s = State::Build { name: name.to_string() };
    }
    if !configured() || !enabled() {
        return;
    }
    apply(
        Activity::new()
            .details(&format!("Играет в {name}"))
            .state("Сборка Minecraft")
            .assets(
                Assets::new()
                    .large_image("logo")
                    .large_text("Aciron Launcher")
                    .small_image("grass")
                    .small_text(name),
            )
            .timestamps(Timestamps::new().start(session_start()))
            .buttons(download_button()),
    );
}
