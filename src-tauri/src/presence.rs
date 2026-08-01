

use crate::accounts;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

#[derive(Default, Clone)]
struct Activity {
    in_game: bool,
    mc_version: String,
    build_name: String,
    log_path: Option<PathBuf>,
}

fn activity() -> &'static Mutex<Activity> {
    static A: OnceLock<Mutex<Activity>> = OnceLock::new();
    A.get_or_init(|| Mutex::new(Activity::default()))
}

/// Игра запущена: запоминаем версию/сборку и лог (для определения сервера).
pub fn set_playing(mc_version: &str, build_name: &str, log_path: PathBuf) {
    if let Ok(mut a) = activity().lock() {
        *a = Activity {
            in_game: true,
            mc_version: mc_version.to_string(),
            build_name: build_name.to_string(),
            log_path: Some(log_path),
        };
    }
}

/// Игра закрыта: остаёмся «в лаунчере», активность игры сбрасываем.
pub fn set_stopped() {
    if let Ok(mut a) = activity().lock() {
        *a = Activity::default();
    }
}

fn snapshot() -> Activity {
    activity().lock().map(|a| a.clone()).unwrap_or_default()
}

/// Приватность из настроек профиля: что именно уходит друзьям.
/// Скрытое поле не отправляется вовсе — сервис о нём просто не узнаёт.
#[derive(Clone)]
struct Privacy {
    show_game: bool,
    show_server: bool,
}

impl Default for Privacy {
    fn default() -> Self {
        Self { show_game: true, show_server: true }
    }
}

fn privacy() -> &'static Mutex<Privacy> {
    static P: OnceLock<Mutex<Privacy>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(Privacy::default()))
}

#[tauri::command]
pub fn set_presence_privacy(show_game: bool, show_server: bool) {
    if let Ok(mut p) = privacy().lock() {
        *p = Privacy { show_game, show_server };
    }
}

fn read_tail(path: &PathBuf, max: usize) -> String {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let start = data.len().saturating_sub(max);
    String::from_utf8_lossy(&data[start..]).to_string()
}

fn server_from_log(log_path: &Option<PathBuf>) -> Option<String> {
    let path = log_path.as_ref()?;
    let tail = read_tail(path, 128 * 1024);
    let mut found = None;
    for line in tail.lines() {
        if let Some(idx) = line.find("Connecting to ") {
            let rest = &line[idx + "Connecting to ".len()..];
            let host = rest.split(',').next().unwrap_or("").trim();
            if !host.is_empty() {
                found = Some(host.to_string());
            }
        }
    }
    found
}

#[cfg(windows)]
fn idle_seconds() -> u64 {
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    extern "system" {
        fn GetLastInputInfo(pli: *mut LastInputInfo) -> i32;
        fn GetTickCount() -> u32;
    }
    unsafe {
        let mut lii = LastInputInfo {
            cb_size: std::mem::size_of::<LastInputInfo>() as u32,
            dw_time: 0,
        };
        if GetLastInputInfo(&mut lii) == 0 {
            return 0;
        }
        (GetTickCount().wrapping_sub(lii.dw_time)) as u64 / 1000
    }
}

#[cfg(not(windows))]
fn idle_seconds() -> u64 {
    0
}

const IDLE_THRESHOLD_SECS: u64 = 5 * 60;
const HEARTBEAT_EVERY: Duration = Duration::from_secs(20);

async fn beat() {
    let acc = match accounts::active_account() {
        Some(a) if a.kind == "aciron" && !a.aciron_token.is_empty() => a,
        _ => return,
    };
    let act = snapshot();
    let priv_ = privacy().lock().map(|p| p.clone()).unwrap_or_default();

    let server = if act.in_game && priv_.show_server {
        server_from_log(&act.log_path)
    } else {
        None
    };
    let opt = |s: String| -> Value {
        if s.is_empty() {
            Value::Null
        } else {
            json!(s)
        }
    };

    let (mc_version, build_name) = if priv_.show_game {
        (opt(act.mc_version), opt(act.build_name))
    } else {
        (Value::Null, Value::Null)
    };
    let body = json!({
        "source": "launcher",
        "idle": idle_seconds() >= IDLE_THRESHOLD_SECS,
        "inGame": act.in_game,
        "mcVersion": mc_version,
        "buildName": build_name,
        "server": server.map(Value::from).unwrap_or(Value::Null),
    });

    if let Ok(rb) = crate::aciron::post("/api/presence/heartbeat") {
        let _ = rb
            .header("Authorization", format!("Bearer {}", acc.aciron_token))
            .json(&body)
            .send()
            .await;
    }
}

pub async fn heartbeat_loop() {
    loop {
        beat().await;
        tokio::time::sleep(HEARTBEAT_EVERY).await;
    }
}
