use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use tauri::AppHandle;

pub fn launcher_root() -> PathBuf {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join(".acironlauncher")
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
                return dir.to_path_buf();
            }
        }
    }
    launcher_root()
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

#[tauri::command]
pub fn data_migration_pending() -> bool {

    if crate::instance::slot() > 1 {
        return false;
    }
    let old = launcher_root();
    let new = data_root();
    if old == new {
        return false;
    }
    DATA_FILES
        .iter()
        .any(|f| old.join(f).exists() && !new.join(f).exists())
}

#[tauri::command]
pub async fn migrate_data(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || migrate_data_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn migrate_data_blocking(app: &AppHandle) -> Result<(), String> {
    let old = launcher_root();
    let new = data_root();
    if old == new {
        return Ok(());
    }
    let pending: Vec<&str> = DATA_FILES
        .iter()
        .copied()
        .filter(|f| old.join(f).exists() && !new.join(f).exists())
        .collect();
    let total = (pending.len() as u64).max(1);
    crate::launcher::emit_op(app, "migrate","modpack", "Перенос данных", 0, total);

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
        crate::launcher::emit_op(app, "migrate","modpack", "Перенос данных", done, total);
    }

    crate::launcher::emit_op(app, "migrate","done", "Данные перенесены", 1, 1);
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
    pub fullscreen: bool,

    #[serde(default = "default_ui_scale")]
    pub ui_scale: u32,

    #[serde(default = "default_true")]
    pub notify_sound: bool,
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
            fullscreen: false,
            ui_scale: 100,
            notify_sound: true,
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

/// Кэш полностью разрешённых настроек (после подстановки java_path и ensure_dirs).
///
/// `load_settings()` дёргается очень часто (get_settings на каждом переключении
/// вкладки во фронте, а также build_dir/get_installed_versions/launch_* внутри),
/// и каждый вызов раньше = чтение+парсинг settings.json + возможный дисковый скан
/// detect_java (перебор PATH и read_dir по Program Files) + 3× create_dir_all.
/// Кэшируем результат в памяти; инвалидируем в save_settings. Слот инстанса
/// (instance::slot) фиксируется единожды на запуск процесса через OnceLock, так
/// что data_root() стабилен и кэш не может указать на чужой слот.
fn settings_cache() -> &'static RwLock<Option<Settings>> {
    static C: OnceLock<RwLock<Option<Settings>>> = OnceLock::new();
    C.get_or_init(|| RwLock::new(None))
}

/// Сбрасывает кэш настроек (после записи файла), чтобы следующий load_settings
/// перечитал диск и заново применил detect_java/ensure_dirs — семантика 1-в-1
/// с прежним поведением (в т.ч. повторный detect_java, если java_path пуст).
fn invalidate_settings_cache() {
    if let Ok(mut guard) = settings_cache().write() {
        *guard = None;
    }
}

/// Читает и полностью разрешает настройки с диска (java_path + ensure_dirs).
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
    // Быстрый путь: возвращаем кэш, если он прогрет.
    if let Ok(guard) = settings_cache().read() {
        if let Some(s) = guard.as_ref() {
            return s.clone();
        }
    }
    // Медленный путь: читаем диск и прогреваем кэш. Возможна гонка двух
    // «первых» вызовов — оба сделают одинаковую работу и запишут один и тот же
    // результат; это безопасно (последняя запись выигрывает, значение то же).
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

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    ensure_dirs(&settings);
    let txt = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    crate::atomic::write(&settings_file(), &txt)?;
    // Инвалидируем кэш: следующий load_settings перечитает файл и заново
    // применит detect_java/ensure_dirs — те же данные, что видит пользователь.
    invalidate_settings_cache();

    crate::discord::set_enabled(settings.discord_rpc);
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
    crate::launcher::emit_op(app, "migrate","modpack", "Перенос файлов", 0, total);

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
            crate::launcher::emit_op(app, "migrate","modpack", "Перенос файлов", done, total);
        }
    }

    crate::launcher::emit_op(app, "migrate","done", "Файлы перенесены", 1, 1);
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
