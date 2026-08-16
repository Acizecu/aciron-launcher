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

fn large_text() -> &'static str {
    static T: OnceLock<String> = OnceLock::new();
    T.get_or_init(|| format!("Aciron Launcher (v{})", env!("CARGO_PKG_VERSION")))
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
    vec![Button::new(
        crate::i18n::pick("Скачать лаунчер", "Get the launcher", "Başlatıcıyı indir"),
        DOWNLOAD_URL,
    )]
}

fn playing(tpl: &'static str, what: &str) -> String {
    tpl.replace("{v}", what)
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
            .details(crate::i18n::pick("В лаунчере", "In the launcher", "Başlatıcıda"))
            .state(crate::i18n::pick("Отдыхает", "Idle", "Boşta"))
            .assets(Assets::new().large_image("logo").large_text(large_text()))
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
    let details = playing(
        crate::i18n::pick("Играет на {v}", "Playing {v}", "{v} oynuyor"),
        version,
    );
    apply(
        Activity::new()
            .details(&details)
            .state("Minecraft")
            .assets(
                Assets::new()
                    .large_image("logo")
                    .large_text(large_text())
                    .small_image("grass")
                    .small_text(version),
            )
            .timestamps(Timestamps::new().start(now()))
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
    let details = playing(
        crate::i18n::pick("Играет в {v}", "Playing {v}", "{v} oynuyor"),
        name,
    );
    apply(
        Activity::new()
            .details(&details)
            .state(crate::i18n::pick(
                "Сборка Minecraft",
                "Minecraft instance",
                "Minecraft derlemesi",
            ))
            .assets(
                Assets::new()
                    .large_image("logo")
                    .large_text(large_text())
                    .small_image("grass")
                    .small_text(name),
            )
            .timestamps(Timestamps::new().start(now()))
            .buttons(download_button()),
    );
}
