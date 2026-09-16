use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use tauri::AppHandle;

#[inline]
fn channel_dir() -> &'static str {
    #[cfg(feature = "dev-channel")]
    {
        ".acirondev"
    }
    #[cfg(not(feature = "dev-channel"))]
    {
        ".acironlauncher"
    }
}

pub fn launcher_root() -> PathBuf {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join(channel_dir())
}

pub fn data_root() -> PathBuf {
    let base = base_data_root();
    match crate::instance::data_suffix() {
        Some(sub) => {
            let dir = base.join(sub);
            let _ = std::fs::create_dir_all(&dir);
            dir
        }
        None => base,
    }
}

fn base_data_root() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if is_writable(dir) {

                #[cfg(feature = "dev-channel")]
                {
                    return dir.join(channel_dir());
                }

                #[cfg(not(feature = "dev-channel"))]
                {
                    return dir.to_path_buf();
                }
            }
        }
    }
    launcher_root()
}

pub fn dir_is_writable(dir: &Path) -> bool {
    is_writable(dir)
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".aciron_write_test");
    match std::fs::write(&probe, b"") {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

const DATA_FILES: [&str; 5] = [
    "settings.json",
    "accounts.json",
    "builds.json",
    "installed.json",
    "recents.json",
];

fn legacy_roots(product: &str) -> Vec<PathBuf> {
    let mut roots = vec![launcher_root()];
    for var in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(base) = std::env::var_os(var) {
            let dir = PathBuf::from(base).join(product);
            roots.push(dir.join(channel_dir()));
            roots.push(dir);
        }
    }
    roots
}

fn pending_migration_source(product: &str) -> Option<PathBuf> {
    if crate::instance::slot() > 1 {
        return None;
    }
    let new = data_root();
    legacy_roots(product).into_iter().find(|old| {
        *old != new
            && DATA_FILES
                .iter()
                .any(|f| old.join(f).exists() && !new.join(f).exists())
    })
}

fn product_name(app: &AppHandle) -> String {
    app.config()
        .product_name
        .clone()
        .unwrap_or_else(|| "Aciron Launcher".into())
}

#[tauri::command]
pub fn data_migration_pending(app: AppHandle) -> bool {
    pending_migration_source(&product_name(&app)).is_some()
}

#[tauri::command]
pub async fn migrate_data(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || migrate_data_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn migrate_data_blocking(app: &AppHandle) -> Result<(), String> {
    let Some(old) = pending_migration_source(&product_name(app)) else {
        return Ok(());
    };
    let new = data_root();
    let pending: Vec<&str> = DATA_FILES
        .iter()
        .copied()
        .filter(|f| old.join(f).exists() && !new.join(f).exists())
        .collect();
    let total = (pending.len() as u64).max(1);
    crate::launcher::emit_op(app, "migrate","modpack", "Moving data", 0, total);

    std::fs::create_dir_all(&new).map_err(|e| e.to_string())?;
    let mut done = 0u64;
    for f in &pending {
        let src = old.join(f);
        let dst = new.join(f);

        if std::fs::rename(&src, &dst).is_err() {
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(&src);
        }
        done += 1;
        crate::launcher::emit_op(app, "migrate","modpack", "Moving data", done, total);
    }

    crate::launcher::emit_op(app, "migrate","done", "Data moved", 1, 1);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {

    pub java_path: String,

    pub ram_mb: u32,

    pub window_width: u32,
    pub window_height: u32,

    pub game_dir: String,
    pub versions_dir: String,
    pub builds_dir: String,

    pub username: String,

    #[serde(default)]
    pub hide_on_launch: bool,

    #[serde(default)]
    pub background_anim: Option<bool>,

    #[serde(default = "default_true")]
    pub discord_rpc: bool,

    #[serde(default = "default_true")]
    pub autoadd_server: bool,

    #[serde(default)]
    pub jvm_args: String,

    #[serde(default = "default_true")]
    pub auto_update_check: bool,

    #[serde(default)]
    pub dev_mode_disable_updates: bool,

    #[serde(default)]
    pub skipped_update_version: String,

    #[serde(default)]
    pub defer_update_until: Option<i64>,

    #[serde(default)]
    pub fullscreen: bool,

    #[serde(default = "default_ui_scale")]
    pub ui_scale: u32,

    #[serde(default = "default_true")]
    pub notify_sound: bool,

    #[serde(default)]
    pub language: String,

    #[serde(default)]
    pub onboarded: bool,

    #[serde(default = "default_true")]
    pub crash_reports: bool,

    #[serde(default)]
    pub seen_version: String,

    #[serde(default)]
    pub dismissed_announce_id: i64,
}

fn default_ui_scale() -> u32 {
    100
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        let root = launcher_root();
        Settings {
            java_path: String::new(),
            ram_mb: 4096,
            window_width: 854,
            window_height: 480,
            game_dir: root.to_string_lossy().into_owned(),
            versions_dir: root.join("versions").to_string_lossy().into_owned(),
            builds_dir: root.join("builds").to_string_lossy().into_owned(),
            username: "Player".into(),
            hide_on_launch: false,
            background_anim: None,
            discord_rpc: true,
            autoadd_server: true,
            jvm_args: String::new(),
            auto_update_check: true,
            dev_mode_disable_updates: false,
            skipped_update_version: String::new(),
            defer_update_until: None,
            fullscreen: false,
            ui_scale: 100,
            notify_sound: true,
            language: String::new(),
            onboarded: false,
            crash_reports: true,
            seen_version: String::new(),
            dismissed_announce_id: 0,
        }
    }
}

fn settings_file() -> PathBuf {
    data_root().join("settings.json")
}

pub fn ensure_dirs(s: &Settings) {
    for dir in [&s.game_dir, &s.versions_dir, &s.builds_dir] {
        let _ = std::fs::create_dir_all(dir);
    }
}

fn is_java(path: &Path) -> bool {
    path.is_file()
}

#[tauri::command]
pub fn detect_java() -> String {
    let exe = if cfg!(windows) { "java.exe" } else { "java" };

    if let Ok(home) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(home).join("bin").join(exe);
        if is_java(&p) {
            return p.to_string_lossy().into_owned();
        }
    }

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let p = dir.join(exe);
            if is_java(&p) {
                return p.to_string_lossy().into_owned();
            }
        }
    }

    if cfg!(windows) {
        let roots = [
            r"C:\Program Files\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Microsoft\jdk",
            r"C:\Program Files\Zulu",
            r"C:\Program Files (x86)\Java",
        ];
        for root in roots {
            if let Ok(entries) = std::fs::read_dir(root) {
                for e in entries.flatten() {
                    let p = e.path().join("bin").join(exe);
                    if is_java(&p) {
                        return p.to_string_lossy().into_owned();
                    }
                }
            }
        }
    }

    String::new()
}

fn settings_cache() -> &'static RwLock<Option<Settings>> {
    static C: OnceLock<RwLock<Option<Settings>>> = OnceLock::new();
    C.get_or_init(|| RwLock::new(None))
}

fn invalidate_settings_cache() {
    if let Ok(mut guard) = settings_cache().write() {
        *guard = None;
    }
}

fn load_settings_uncached() -> Settings {
    let file = settings_file();
    let mut s = match std::fs::read_to_string(&file) {
        Ok(txt) => serde_json::from_str::<Settings>(&txt).unwrap_or_default(),
        Err(_) => Settings::default(),
    };

    if s.java_path.is_empty() {
        s.java_path = detect_java();
    }
    ensure_dirs(&s);
    s
}

pub fn load_settings() -> Settings {

    if let Ok(guard) = settings_cache().read() {
        if let Some(s) = guard.as_ref() {
            return s.clone();
        }
    }

    let s = load_settings_uncached();
    if let Ok(mut guard) = settings_cache().write() {
        *guard = Some(s.clone());
    }
    s
}

#[tauri::command]
pub fn get_settings() -> Settings {
    load_settings()
}

pub fn cached_language() -> String {
    settings_cache()
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|s| s.language.clone()))
        .unwrap_or_default()
}

pub fn java_present() -> bool {
    settings_cache()
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|s| !s.java_path.is_empty()))
        .unwrap_or(false)
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    ensure_dirs(&settings);
    let txt = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::atomic::write(&settings_file(), &txt)?;

    invalidate_settings_cache();

    crate::discord::set_enabled(settings.discord_rpc);

    crate::crash::set_enabled(settings.crash_reports);

    if !settings.crash_reports {
        crate::crash::purge(&crate::crash::queue_path());
    }
    Ok(())
}

#[tauri::command]
pub fn default_settings() -> Settings {
    let mut s = Settings::default();
    s.java_path = detect_java();
    s
}

#[cfg(windows)]
fn total_ram_gb() -> f64 {
    #[repr(C)]
    struct MemoryStatusEx {
        dw_length: u32,
        dw_memory_load: u32,
        ull_total_phys: u64,
        ull_avail_phys: u64,
        ull_total_page_file: u64,
        ull_avail_page_file: u64,
        ull_total_virtual: u64,
        ull_avail_virtual: u64,
        ull_avail_extended_virtual: u64,
    }
    extern "system" {
        fn GlobalMemoryStatusEx(buffer: *mut MemoryStatusEx) -> i32;
    }
    unsafe {
        let mut ms: MemoryStatusEx = std::mem::zeroed();
        ms.dw_length = std::mem::size_of::<MemoryStatusEx>() as u32;
        if GlobalMemoryStatusEx(&mut ms) != 0 {
            ms.ull_total_phys as f64 / 1024.0 / 1024.0 / 1024.0
        } else {
            8.0
        }
    }
}

#[cfg(not(windows))]
fn total_ram_gb() -> f64 {
    8.0
}

#[tauri::command]
pub fn total_ram_mb() -> u32 {
    (total_ram_gb() * 1024.0).round() as u32
}

#[tauri::command]
pub fn hardware_capable() -> bool {
    let ram = total_ram_gb();
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    ram >= 8.0 && cores >= 4
}

#[derive(serde::Deserialize)]
pub struct MovePair {
    pub from: String,
    pub to: String,
}

#[tauri::command]
pub async fn move_directories(app: AppHandle, moves: Vec<MovePair>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || move_directories_blocking(&app, moves))
        .await
        .map_err(|e| e.to_string())?
}

fn move_directories_blocking(app: &AppHandle, moves: Vec<MovePair>) -> Result<(), String> {

    let mut total = 0u64;
    for m in &moves {
        let from = PathBuf::from(&m.from);
        if from == PathBuf::from(&m.to) || !from.exists() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&from) {
            total += rd.flatten().count() as u64;
        }
    }
    let total = total.max(1);
    let mut done = 0u64;
    crate::launcher::emit_op(app, "migrate","modpack", "Moving files", 0, total);

    for m in &moves {
        let from = PathBuf::from(&m.from);
        let to = PathBuf::from(&m.to);
        if from == to || !from.exists() {
            continue;
        }
        std::fs::create_dir_all(&to).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(&from).map_err(|e| e.to_string())?.flatten() {
            let src = entry.path();
            let dst = to.join(entry.file_name());

            if std::fs::rename(&src, &dst).is_err() {
                if src.is_dir() {
                    copy_dir_all(&src, &dst)?;
                    let _ = std::fs::remove_dir_all(&src);
                } else {
                    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
                    let _ = std::fs::remove_file(&src);
                }
            }
            done += 1;
            crate::launcher::emit_op(app, "migrate","modpack", "Moving files", done, total);
        }
    }

    crate::launcher::emit_op(app, "migrate","done", "Files moved", 1, 1);
    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let s = entry.path();
        let d = dst.join(entry.file_name());
        if s.is_dir() {
            copy_dir_all(&s, &d)?;
        } else {
            std::fs::copy(&s, &d).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let _ = std::fs::create_dir_all(&p);
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
