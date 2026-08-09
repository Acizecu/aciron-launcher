use crate::settings::{self, Settings};
use futures::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

struct RunningGame {
    id: String,
    pid: u32,
}

fn running_games() -> &'static Mutex<Vec<RunningGame>> {
    static R: OnceLock<Mutex<Vec<RunningGame>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(Vec::new()))
}

fn register_game(id: &str, pid: u32) {
    if let Ok(mut v) = running_games().lock() {
        v.push(RunningGame { id: id.to_string(), pid });
    }
}

/// Убирает игру по pid из реестра, возвращает число оставшихся запущенных.
fn unregister_game(pid: u32) -> usize {
    match running_games().lock() {
        Ok(mut v) => {
            v.retain(|g| g.pid != pid);
            v.len()
        }
        Err(_) => 0,
    }
}

/// Убивает процесс вместе со всем деревом дочерних процессов.
fn kill_pid_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .status();
    }
}

/// Останавливает запущенную игру. `id` = "build:<id>"/версия; None — закрыть все.
/// Событие `game-exited` эмитит монитор-поток при обнаружении завершения.
#[tauri::command]
pub fn stop_game(id: Option<String>) -> Result<(), String> {
    let pids: Vec<u32> = match running_games().lock() {
        Ok(v) => v
            .iter()
            .filter(|g| id.as_deref().map_or(true, |i| g.id == i))
            .map(|g| g.pid)
            .collect(),
        Err(_) => Vec::new(),
    };
    for pid in pids {
        kill_pid_tree(pid);
    }
    Ok(())
}

const MANIFEST: &str = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES: &str = "https://resources.download.minecraft.net";
const JAVA_RUNTIME_MANIFEST: &str =
    "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

/// Платформа для манифеста java-runtime Mojang.
fn java_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") {
            "windows-arm64"
        } else {
            "windows-x64"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "mac-os-arm64"
        } else {
            "mac-os"
        }
    } else {
        "linux"
    }
}

async fn ensure_java_runtime(
    app: &AppHandle,
    client: &reqwest::Client,
    component: &str,
    game_dir: &Path,
) -> Option<PathBuf> {
    let runtime_root = game_dir.join("runtime").join(component);
    let exe = if cfg!(windows) { "javaw.exe" } else { "java" };
    let java_bin = runtime_root.join("bin").join(exe);
    if java_bin.exists() {
        return Some(java_bin);
    }

    emit(app, "java", "Проверка среды Java", 0, 1);
    let all = get_json(client, JAVA_RUNTIME_MANIFEST).await.ok()?;
    let manifest_url = all[java_platform()][component]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|e| e["manifest"]["url"].as_str())?
        .to_string();
    let manifest = get_json(client, &manifest_url).await.ok()?;
    let files = manifest["files"].as_object()?.clone();

    let mut to_dl: Vec<(String, String)> = Vec::new();
    for (rel, info) in files.iter() {
        match info["type"].as_str() {
            Some("directory") => {
                let _ = tokio::fs::create_dir_all(runtime_root.join(rel)).await;
            }
            Some("file") => {
                if let Some(url) = info["downloads"]["raw"]["url"].as_str() {
                    to_dl.push((rel.clone(), url.to_string()));
                }
            }
            _ => {}
        }
    }

    let total = to_dl.len() as u64;
    let done = Arc::new(AtomicU64::new(0));
    stream::iter(to_dl.into_iter().map(|(rel, url)| {
        let client = client.clone();
        let root = runtime_root.clone();
        let done = done.clone();
        let app = app.clone();
        async move {
            let dest = root.join(&rel);
            let _ = download_file(&client, &url, &dest).await;
            #[cfg(unix)]
            if rel.starts_with("bin/") {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
            }
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            if n % 20 == 0 || n == total {
                emit(&app, "java", "Загрузка среды Java", n, total);
            }
        }
    }))
    .buffer_unordered(16)
    .collect::<Vec<_>>()
    .await;

    java_bin.exists().then_some(java_bin)
}

#[derive(Clone, Serialize)]
struct Progress {

    op: String,
    stage: String,
    message: String,
    current: u64,
    total: u64,
}

pub fn emit_op(app: &AppHandle, op: &str, stage: &str, message: &str, current: u64, total: u64) {
    let _ = app.emit(
        "launch-progress",
        Progress {
            op: op.into(),
            stage: stage.into(),
            message: message.into(),
            current,
            total,
        },
    );
}

pub fn emit(app: &AppHandle, stage: &str, message: &str, current: u64, total: u64) {
    emit_op(app, "launch", stage, message, current, total);
}

fn os_name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Проверка правил allow/disallow по ОС.
fn rules_allow(rules: &Value) -> bool {
    let arr = match rules.as_array() {
        Some(a) => a,
        None => return true,
    };
    if arr.is_empty() {
        return true;
    }
    let mut allowed = false;
    for rule in arr {
        // Правила с features (demo, custom_resolution) для аргументов — пропускаем.
        if rule.get("features").is_some() {
            continue;
        }
        let mut applies = true;
        if let Some(os) = rule.get("os") {
            if let Some(name) = os.get("name").and_then(|v| v.as_str()) {
                if name != os_name() {
                    applies = false;
                }
            }
        }
        if applies {
            allowed = rule.get("action").and_then(|v| v.as_str()) == Some("allow");
        }
    }
    allowed
}

/// Возвращает последние `max` байт лог-файла как строку (для показа причины краха).
fn log_tail(path: &Path, max: usize) -> String {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let start = data.len().saturating_sub(max);
    String::from_utf8_lossy(&data[start..]).trim().to_string()
}

pub(crate) async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<Value>()
        .await
        .map_err(|e| e.to_string())
}

/// Скачивает файл во временный <path>.part и атомарно переименовывает в итоговый
/// путь, чтобы прерванная загрузка не оставляла битый финальный файл.
/// Возвращает скачанные байты (для проверки хэша в download_file_checked).
///
/// Возвращаем `bytes::Bytes` (Arc-обёртка над буфером ответа), а не `Vec<u8>`:
/// раньше здесь был лишний `bytes.to_vec()` — вторая полная копия каждого файла в
/// куче поверх буфера ответа, помноженная на buffer_unordered(16). Для проверки
/// размера/SHA1 в download_file_checked достаточно `&[u8]` (Bytes дерефается в
/// срез), поэтому копия не нужна и поведение не меняется.
///
/// Тип именно `bytes::Bytes`: это то, что реально возвращает `reqwest::Response::bytes()`
/// (reqwest 0.12 НЕ ре-экспортит его как `reqwest::Bytes`). `bytes` уже присутствует в
/// графе как транзитивная зависимость reqwest/tokio, поэтому объявлен прямой зависимостью
/// без новой загрузки — только чтобы имя типа было доступно.
async fn download_to(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
) -> Result<bytes::Bytes, String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    // Временный файл рядом с целевым, затем атомарный rename.
    let tmp = path.with_extension(match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{ext}.part"),
        None => "part".to_string(),
    });
    tokio::fs::write(&tmp, &bytes)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

/// Скачивает файл, если его ещё нет. Пишет через <path>.part + rename (атомарно).
pub(crate) async fn download_file(client: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    download_to(client, url, path).await.map(|_| ())
}

/// Скачивает файл с проверкой целостности: сверяет размер и SHA1 (если заданы).
/// Существующий файл переиспользуется, только если его размер/хэш совпадают,
/// иначе — перекачивается. При несовпадении после загрузки файл удаляется.
///
/// `content_addressed` = true, если имя файла является его SHA1 (ассеты/объекты
/// CAS). Тогда для УЖЕ существующего файла проверяем только размер (метаданные,
/// без чтения и хеширования) — так старт уже установленной версии не пере-хеширует
/// сотни МБ ассетов каждый раз. Полный SHA1 всё равно считается по свежескачанным
/// байтам ниже, т.е. первичная загрузка по-прежнему верифицируется.
pub(crate) async fn download_file_checked(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
    sha1: Option<&str>,
    size: Option<u64>,
    content_addressed: bool,
) -> Result<(), String> {
    // Если файл уже есть — проверяем его целостность, чтобы не качать зря.
    // Проверка синхронная (std::fs::read + SHA1 для не-CAS файлов) — уводим её в
    // spawn_blocking, чтобы не блокировать tokio-worker под buffer_unordered(16).
    if path.exists() {
        let already_valid = {
            let p = path.to_path_buf();
            let sha1_owned = sha1.map(|s| s.to_string());
            tokio::task::spawn_blocking(move || {
                if content_addressed {
                    // Имя = SHA1: достаточно наличия и размера.
                    return file_meta_matches(&p, size);
                }
                // Имя — maven-путь, а не хэш, поэтому честная проверка означает
                // прочитать файл целиком. Если его уже проверяли и с тех пор не
                // трогали — верим отпечатку и не читаем заново: иначе каждый
                // запуск пере-хеширует весь classpath (см. verify.rs).
                if let Some(expected) = sha1_owned.as_deref() {
                    if crate::verify::is_verified(&p, expected, size) {
                        return true;
                    }
                }
                let ok = file_matches(&p, sha1_owned.as_deref(), size);
                if ok {
                    if let Some(expected) = sha1_owned.as_deref() {
                        crate::verify::remember(&p, expected);
                    }
                }
                ok
            })
            .await
            .unwrap_or(false)
        };
        if already_valid {
            return Ok(());
        }
        // Битый/устаревший файл — удаляем и качаем заново.
        let _ = tokio::fs::remove_file(path).await;
    }
    let bytes = download_to(client, url, path).await?;
    // Проверка размера.
    if let Some(expected) = size {
        if bytes.len() as u64 != expected {
            let _ = tokio::fs::remove_file(path).await;
            return Err(format!(
                "Размер файла не совпал: ожидалось {expected}, получено {}",
                bytes.len()
            ));
        }
    }
    // Проверка SHA1.
    if let Some(expected) = sha1 {
        let actual = sha1_hex(&bytes);
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(path).await;
            return Err(format!(
                "Хэш SHA1 не совпал: ожидалось {expected}, получено {actual}"
            ));
        }
        // Только что посчитали хэш по свежим байтам — запоминаем, чтобы
        // следующий запуск не считал его снова.
        if !content_addressed {
            let p = path.to_path_buf();
            let e = expected.to_string();
            let _ = tokio::task::spawn_blocking(move || crate::verify::remember(&p, &e)).await;
        }
    }
    Ok(())
}

/// SHA1 байтов в hex-строке нижнего регистра.
fn sha1_hex(data: &[u8]) -> String {
    use sha1::{Digest, Sha1};
    use std::fmt::Write as _;
    let mut hasher = Sha1::new();
    hasher.update(data);
    let digest = hasher.finalize();
    let mut s = String::with_capacity(digest.len() * 2);
    for b in digest.iter() {
        // write! пишет прямо в уже зарезервированный буфер — без временной String
        // на каждый байт, как делал прежний s.push_str(&format!(...)).
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Проверяет, что файл на диске соответствует ожидаемым размеру/SHA1.
/// Если ожидаемые значения не заданы — считаем существующий файл валидным.
///
/// Полный вариант: читает файл целиком и пересчитывает SHA1. Дорогой — вызывать
/// только там, где имя файла НЕ является его хэшем (client.jar, библиотеки).
fn file_matches(path: &Path, sha1: Option<&str>, size: Option<u64>) -> bool {
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return false,
    };
    if let Some(expected) = size {
        if data.len() as u64 != expected {
            return false;
        }
    }
    if let Some(expected) = sha1 {
        if !sha1_hex(&data).eq_ignore_ascii_case(expected) {
            return false;
        }
    }
    true
}

/// Дешёвая проверка по метаданным: только размер (без чтения содержимого/SHA1).
/// Для content-addressed файлов (имя файла = SHA1, как у ассетов и объектов CAS)
/// совпадения имени+размера достаточно: расхождение содержимого при совпадающем
/// имени означало бы коллизию SHA1. Так мы не перечитываем и не пере-хешируем
/// сотни МБ уже валидных ассетов на каждом запуске.
fn file_meta_matches(path: &Path, size: Option<u64>) -> bool {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    if !meta.is_file() {
        return false;
    }
    if let Some(expected) = size {
        if meta.len() != expected {
            return false;
        }
    }
    true
}

/// Отпечаток состояния нативов: какие jar распаковывали и сколько файлов вышло.
///
/// Имена и размеры jar ловят смену версии или загрузчика, число файлов в папке —
/// удалённые вручную DLL. Оба признака дешёвые: метаданные, без чтения архивов.
fn natives_stamp(jars: &[PathBuf], natives_dir: &Path) -> String {
    let mut parts: Vec<String> = jars
        .iter()
        .map(|j| {
            let size = std::fs::metadata(j).map(|m| m.len()).unwrap_or(0);
            format!("{}:{size}", j.file_name().unwrap_or_default().to_string_lossy())
        })
        .collect();
    parts.sort();
    let files = std::fs::read_dir(natives_dir)
        .map(|d| d.filter_map(|e| e.ok()).count())
        .unwrap_or(0);
    format!("{}|{files}", parts.join(","))
}

/// Распаковывает натив-jar в папку natives (только библиотеки, без META-INF).
fn extract_natives(jar: &Path, natives_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(jar).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(natives_dir).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("META-INF") || name.ends_with('/') {
            continue;
        }
        let ext_ok = name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib");
        if !ext_ok {
            continue;
        }
        let base = Path::new(&name).file_name().unwrap();
        let out = natives_dir.join(base);
        if out.exists() {
            continue;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn offline_uuid(name: &str) -> String {
    let digest = md5::compute(format!("OfflinePlayer:{name}"));
    let mut b = digest.0;
    b[6] = (b[6] & 0x0f) | 0x30; // версия 3
    b[8] = (b[8] & 0x3f) | 0x80; // вариант
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

/// Ключ библиотеки group:artifact (без версии/классификатора) — для дедупликации.
/// Пустой classifier для нативов оставляет тот же ключ, поэтому натив-классификаторы
/// исключаем на стороне вызова.
pub(crate) fn artifact_key(name: &str) -> String {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 2 {
        format!("{}:{}", parts[0], parts[1])
    } else {
        name.to_string()
    }
}

/// maven-координата (group:artifact:version[:classifier]) → относительный путь к jar.
pub(crate) fn maven_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let file = match parts.get(3) {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Some(format!("{group}/{artifact}/{version}/{file}"))
}

/// Адрес меты загрузчика: список версий и база для профиля.
pub(crate) fn loader_meta(loader: &str, mc: &str) -> Option<(String, &'static str)> {
    match loader {
        "fabric" => Some((
            format!("https://meta.fabricmc.net/v2/versions/loader/{mc}"),
            "https://meta.fabricmc.net/v2/versions/loader",
        )),
        "quilt" => Some((
            format!("https://meta.quiltmc.org/v3/versions/loader/{mc}"),
            "https://meta.quiltmc.org/v3/versions/loader",
        )),
        _ => None,
    }
}

#[derive(Serialize)]
pub struct LoaderVersion {
    pub version: String,

    pub stable: bool,

    pub latest: bool,
}

#[tauri::command]
pub async fn loader_versions(
    loader: String,
    mc_version: String,
) -> Result<Vec<LoaderVersion>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut out: Vec<LoaderVersion> = match loader.as_str() {
        "fabric" | "quilt" => {
            let (list_url, _) = loader_meta(&loader, &mc_version)
                .ok_or_else(|| format!("Этот загрузчик не поддерживается: {loader}"))?;
            let list = get_json(&client, &list_url).await?;
            list.as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|e| {
                            Some(LoaderVersion {
                                version: e["loader"]["version"].as_str()?.to_string(),
                                stable: e["loader"]["stable"].as_bool().unwrap_or(false),
                                latest: false,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default()
        }
        "forge" => {

            let meta = get_json(
                &client,
                "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json",
            )
            .await?;
            let recommended = get_json(
                &client,
                "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
            )
            .await
            .ok()
            .and_then(|p| {
                p["promos"][format!("{mc_version}-recommended")]
                    .as_str()
                    .map(|s| s.to_string())
            });
            let prefix = format!("{mc_version}-");
            let mut v: Vec<LoaderVersion> = meta[&mc_version]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())

                        .map(|s| s.strip_prefix(&prefix).unwrap_or(s).to_string())
                        .map(|version| LoaderVersion {
                            stable: recommended.as_deref() == Some(version.as_str()),
                            version,
                            latest: false,
                        })
                        .collect()
                })
                .unwrap_or_default();
            v.reverse();
            v
        }
        "neoforge" => {
            let xml = client
                .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
                .send()
                .await
                .map_err(|e| e.to_string())?
                .text()
                .await
                .map_err(|e| e.to_string())?;
            let p: Vec<&str> = mc_version.split('.').collect();
            let major = p.get(1).ok_or("Неверная версия Minecraft")?;
            let minor = p.get(2).copied().unwrap_or("0");
            let prefix = format!("{major}.{minor}.");
            let mut v: Vec<LoaderVersion> = xml
                .split("<version>")
                .skip(1)
                .filter_map(|s| s.split("</version>").next())
                .filter(|x| x.starts_with(&prefix))
                .map(|x| LoaderVersion {
                    version: x.to_string(),

                    stable: !x.contains("beta"),
                    latest: false,
                })
                .collect();
            v.reverse();
            v
        }
        other => return Err(format!("Этот загрузчик не поддерживается: {other}")),
    };

    if let Some(first) = out.first_mut() {
        first.latest = true;
    }
    Ok(out)
}

async fn fetch_loader_profile(
    client: &reqwest::Client,
    loader: &str,
    mc: &str,
    pinned: Option<&str>,
) -> Result<Value, String> {
    let (list_url, base) = loader_meta(loader, mc)
        .ok_or_else(|| format!("Этот загрузчик не поддерживается: {loader}"))?;
    let lv = match pinned.filter(|s| !s.is_empty()) {
        Some(v) => v.to_string(),
        None => {
            let list = get_json(client, &list_url).await?;
            list.as_array()
                .and_then(|a| a.first())
                .and_then(|e| e["loader"]["version"].as_str())
                .ok_or_else(|| format!("Нет версии загрузчика под эту Minecraft: {loader} · {mc}"))?
                .to_string()
        }
    };
    let profile_url = format!("{base}/{mc}/{lv}/profile/json");
    get_json(client, &profile_url).await
}

async fn prepare_and_launch(
    app: &AppHandle,
    settings: &Settings,
    version: &str,
    game_dir_override: Option<PathBuf>,
    loader: Option<&str>,

    loader_version: Option<&str>,
    server: Option<&str>,
    build_id: Option<String>,
    build_name: Option<&str>,
) -> Result<(), String> {

    let client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let dl_client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1")
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let root = PathBuf::from(&settings.game_dir);
    let versions_dir = PathBuf::from(&settings.versions_dir);
    let libraries_dir = root.join("libraries");
    let assets_dir = root.join("assets");
    let version_dir = versions_dir.join(version);
    let natives_dir = version_dir.join("natives");

    let game_dir = game_dir_override.unwrap_or_else(|| root.clone());

    if settings.autoadd_server {
        ensure_test_server(&game_dir);
    }

    if settings.fullscreen {
        ensure_fullscreen(&game_dir);
    }

    let json_path = version_dir.join(format!("{version}.json"));
    let cached = tokio::fs::read(&json_path)
        .await
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())

        .filter(|v| v["downloads"]["client"]["url"].as_str().is_some());

    let version_json = match cached {
        Some(v) => {
            emit(app, "version", "Описание версии на месте", 1, 1);
            v
        }
        None => {
            emit(app, "manifest", "Получение списка версий", 0, 1);
            let manifest = get_json(&client, MANIFEST).await?;
            let ver_url = manifest["versions"]
                .as_array()
                .and_then(|arr| {
                    arr.iter()
                        .find(|v| v["id"].as_str() == Some(version))
                        .and_then(|v| v["url"].as_str())
                })
                .ok_or_else(|| format!("Версия не найдена в манифесте: {version}"))?
                .to_string();
            emit(app, "manifest", "Список версий получен", 1, 1);

            emit(app, "version", "Загрузка описания версии", 0, 1);
            let v = get_json(&client, &ver_url).await?;
            if let Some(p) = json_path.parent() {
                tokio::fs::create_dir_all(p).await.ok();
            }
            tokio::fs::write(&json_path, serde_json::to_vec_pretty(&v).unwrap_or_default())
                .await
                .ok();
            emit(app, "version", "Описание версии загружено", 1, 1);
            v
        }
    };

    let client_download = &version_json["downloads"]["client"];
    let client_url = client_download["url"]
        .as_str()
        .ok_or("Нет ссылки на client.jar")?;
    let client_jar = version_dir.join(format!("{version}.jar"));

    let client_sha1 = client_download["sha1"].as_str();
    let client_size = client_download["size"].as_u64();
    emit(app, "client", "Загрузка клиента", 0, 1);

    download_file_checked(&dl_client, client_url, &client_jar, client_sha1, client_size, false).await?;
    emit(app, "client", "Клиент загружен", 1, 1);

    let empty = vec![];
    let libs = version_json["libraries"].as_array().unwrap_or(&empty);

    let mut classpath: Vec<(String, PathBuf)> = Vec::new();
    let mut native_jars: Vec<PathBuf> = Vec::new();

    let mut lib_tasks: Vec<(String, PathBuf, Option<String>, Option<u64>)> = Vec::new();
    for lib in libs.iter() {
        if let Some(rules) = lib.get("rules") {
            if !rules_allow(rules) {
                continue;
            }
        }
        let lib_name = lib["name"].as_str().unwrap_or("");
        let downloads = &lib["downloads"];

        if let Some(artifact) = downloads.get("artifact") {
            if let (Some(path), Some(url)) = (
                artifact["path"].as_str(),
                artifact["url"].as_str().filter(|u| !u.is_empty()),
            ) {
                let dest = libraries_dir.join(path);

                let sha1 = artifact["sha1"].as_str();
                let size = artifact["size"].as_u64();
                lib_tasks.push((url.to_string(), dest.clone(), sha1.map(String::from), size));

                let is_native = path.contains("natives-");
                let key = if is_native {
                    String::new()
                } else {
                    artifact_key(lib_name)
                };
                classpath.push((key, dest.clone()));
                if is_native {
                    native_jars.push(dest);
                }
            }
        }

        if let Some(natives) = lib.get("natives") {
            if let Some(key) = natives.get(os_name()).and_then(|v| v.as_str()) {
                let key = key.replace("${arch}", "64");
                if let Some(classifier) = downloads.get("classifiers").and_then(|c| c.get(&key)) {
                    if let (Some(path), Some(url)) =
                        (classifier["path"].as_str(), classifier["url"].as_str())
                    {
                        let dest = libraries_dir.join(path);

                        let sha1 = classifier["sha1"].as_str();
                        let size = classifier["size"].as_u64();
                        lib_tasks.push((url.to_string(), dest.clone(), sha1.map(String::from), size));
                        native_jars.push(dest);
                    }
                }
            }
        }
    }

    let total_libs = lib_tasks.len() as u64;
    let lib_done = Arc::new(AtomicU64::new(0));
    emit(app, "libraries", "Загрузка библиотек", 0, total_libs);
    let lib_results: Vec<Result<(), String>> = stream::iter(lib_tasks.into_iter().map(
        |(url, dest, sha1, size)| {
            let client = dl_client.clone();
            let done = lib_done.clone();
            let app = app.clone();
            async move {
                let r =
                    download_file_checked(&client, &url, &dest, sha1.as_deref(), size, false).await;
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                emit(&app, "libraries", "Загрузка библиотек", n, total_libs);
                r
            }
        },
    ))
    .buffer_unordered(16)
    .collect()
    .await;

    for r in lib_results {
        r?;
    }

    if !native_jars.is_empty() {
        let natives = native_jars.clone();
        let natives_dir2 = natives_dir.clone();
        tokio::task::spawn_blocking(move || -> Result<(), String> {

            let stamp = natives_stamp(&natives, &natives_dir2);
            let marker = natives_dir2.join(".aciron-natives");
            if std::fs::read_to_string(&marker).ok().as_deref() == Some(stamp.as_str()) {
                return Ok(());
            }
            for jar in &natives {
                extract_natives(jar, &natives_dir2)?;
            }
            let _ = std::fs::write(&marker, natives_stamp(&natives, &natives_dir2));
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    let component = version_json["javaVersion"]["component"]
        .as_str()
        .unwrap_or("jre-legacy")
        .to_string();

    let java = match ensure_java_runtime(app, &dl_client, &component, &root).await {
        Some(j) => j,
        None => {
            let p = PathBuf::from(&settings.java_path);
            let jw = p.with_file_name(if cfg!(windows) { "javaw.exe" } else { "java" });
            let chosen = if jw.exists() { jw } else { p };
            if !chosen.exists() {
                return Err(format!(
                    "Не удалось получить Java, и системной тоже нет: {component} · {}",
                    chosen.to_string_lossy()
                ));
            }
            chosen
        }
    };

    let mut loader_main_class: Option<String> = None;
    let mut loader_jvm_args: Vec<String> = Vec::new();
    let mut loader_game_args: Vec<String> = Vec::new();
    if let Some(loader) = loader {
        emit(app, "loader", "Загрузка загрузчика модов", 0, 1);
        match loader {
            "fabric" | "quilt" => {
                let profile = fetch_loader_profile(&client, loader, version, loader_version).await?;
                if let Some(libs) = profile["libraries"].as_array() {

                    let mut loader_tasks: Vec<(String, PathBuf)> = Vec::new();
                    for lib in libs {
                        if let (Some(name), Some(url)) = (lib["name"].as_str(), lib["url"].as_str()) {
                            if let Some(path) = maven_path(name) {
                                let full_url = format!("{}/{}", url.trim_end_matches('/'), path);
                                let dest = libraries_dir.join(&path);
                                loader_tasks.push((full_url, dest.clone()));
                                let key = artifact_key(name);
                                classpath.retain(|(k, _)| k.is_empty() || k != &key);
                                classpath.push((key, dest));
                            }
                        }
                    }

                    let results: Vec<Result<(), String>> = stream::iter(loader_tasks.into_iter().map(
                        |(full_url, dest)| {
                            let client = dl_client.clone();
                            async move { download_file(&client, &full_url, &dest).await }
                        },
                    ))
                    .buffer_unordered(16)
                    .collect()
                    .await;
                    for r in results {
                        r?;
                    }
                }
                loader_main_class = profile["mainClass"].as_str().map(|s| s.to_string());

                if let Some(jvm) = profile["arguments"]["jvm"].as_array() {
                    for a in jvm {
                        if let Some(s) = a.as_str() {
                            loader_jvm_args.push(s.to_string());
                        }
                    }
                }
            }
            "forge" | "neoforge" => {

                let profile = crate::forge::install(
                    &dl_client,
                    loader,
                    version,
                    &root,
                    &libraries_dir,
                    &version_dir,
                    &java,
                    app,
                    loader_version,
                )
                .await?;
                for (key, dest) in profile.libraries {
                    classpath.retain(|(k, _)| k.is_empty() || k != &key);
                    classpath.push((key, dest));
                }
                if !profile.main_class.is_empty() {
                    loader_main_class = Some(profile.main_class);
                }
                loader_jvm_args = profile.jvm_args;
                loader_game_args = profile.game_args;
            }
            other => return Err(format!("Этот загрузчик не поддерживается: {other}")),
        }
        emit(app, "loader", "Загрузчик модов готов", 1, 1);
    }

    let asset_index = &version_json["assetIndex"];
    let asset_id = asset_index["id"].as_str().unwrap_or("legacy").to_string();
    let asset_index_url = asset_index["url"].as_str().unwrap_or("");
    let index_path = assets_dir.join("indexes").join(format!("{asset_id}.json"));
    emit(app, "assets", "Загрузка списка ресурсов", 0, 1);
    download_file(&client, asset_index_url, &index_path).await?;
    let index_json: Value =
        serde_json::from_slice(&tokio::fs::read(&index_path).await.map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    let objects = index_json["objects"].as_object().cloned().unwrap_or_default();

    let entries: Vec<(String, Option<u64>)> = objects
        .values()
        .filter_map(|o| {
            o["hash"]
                .as_str()
                .map(|s| (s.to_string(), o["size"].as_u64()))
        })
        .collect();
    let objects_dir = assets_dir.join("objects");

    let missing: Vec<(String, Option<u64>)> = {
        let objects_dir = objects_dir.clone();
        tokio::task::spawn_blocking(move || {
            entries
                .into_iter()
                .filter(|(hash, size)| {
                    let path = objects_dir.join(&hash[0..2]).join(hash);
                    !file_meta_matches(&path, *size)
                })
                .collect()
        })
        .await
        .map_err(|e| e.to_string())?
    };

    let total = missing.len() as u64;
    if total > 0 {
        let done = Arc::new(AtomicU64::new(0));
        emit(app, "assets", "Загрузка ресурсов", 0, total);
        stream::iter(missing.into_iter().map(|(hash, size)| {
            let client = dl_client.clone();
            let done = done.clone();
            let app = app.clone();
            let objects_dir = objects_dir.clone();
            async move {
                let sub = &hash[0..2];
                let path = objects_dir.join(sub).join(&hash);
                let url = format!("{RESOURCES}/{sub}/{hash}");

                let _ = download_file_checked(&client, &url, &path, Some(&hash), size, true).await;
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                if n % 25 == 0 || n == total {
                    emit(&app, "assets", "Загрузка ресурсов", n, total);
                }
            }
        }))
        .buffer_unordered(16)
        .collect::<Vec<_>>()
        .await;
    }
    emit(app, "assets", "Ресурсы на месте", 1, 1);

    let _ = tokio::task::spawn_blocking(crate::verify::flush).await;

    let sep = if cfg!(windows) { ";" } else { ":" };
    classpath.push((String::new(), client_jar.clone()));
    let cp = classpath
        .iter()
        .map(|(_, p)| p.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(sep);

    let main_class = loader_main_class.unwrap_or_else(|| {
        version_json["mainClass"]
            .as_str()
            .unwrap_or("net.minecraft.client.main.Main")
            .to_string()
    });
    let ram = settings.ram_mb.max(512);

    emit(app, "identity", "Проверка входа", 0, 1);
    let id = resolve_identity(app, settings).await?;

    let mut args: Vec<String> = vec![
        format!("-Xmx{ram}M"),
        format!("-Xms{ram}M"),
        format!("-Djava.library.path={}", natives_dir.to_string_lossy()),
    ];

    for a in settings.jvm_args.split_whitespace() {
        args.push(a.to_string());
    }

    let user_jvm = &settings.jvm_args;
    let user_sets_gc = (user_jvm.contains("-XX:+Use") && user_jvm.contains("GC"))
        || user_jvm.contains("-Xmn");
    if !user_sets_gc {
        for flag in [
            "-XX:+UseG1GC",
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:G1NewSizePercent=20",
            "-XX:G1ReservePercent=20",
            "-XX:MaxGCPauseMillis=50",
            "-XX:G1HeapRegionSize=16M",
        ] {
            if !args.iter().any(|a| a == flag) {
                args.push(flag.to_string());
            }
        }
    }

    if let Some(jar) = ensure_aciron_skins(&root) {
        args.push(format!(
            "-javaagent:{}={}",
            jar.to_string_lossy(),
            crate::aciron::base()
        ));
    }

    args.extend(loader_jvm_args);
    args.extend([
        "-cp".into(),
        cp,
        main_class,

        "--username".into(),
        id.name,
        "--version".into(),
        version.to_string(),
        "--gameDir".into(),
        game_dir.to_string_lossy().into_owned(),
        "--assetsDir".into(),
        assets_dir.to_string_lossy().into_owned(),
        "--assetIndex".into(),
        asset_id,
        "--uuid".into(),
        id.uuid,
        "--accessToken".into(),
        id.token,
        "--userType".into(),
        id.user_type,
        "--versionType".into(),
        "release".into(),
        "--width".into(),
        settings.window_width.to_string(),
        "--height".into(),
        settings.window_height.to_string(),
    ]);

    args.extend(loader_game_args);

    if let Some(addr) = server.filter(|s| !s.is_empty()) {
        let (host, port) = split_host_port(addr);
        if version_ge_1_20(version) {
            args.push("--quickPlayMultiplayer".into());
            args.push(format!("{host}:{port}"));
        } else {
            args.push("--server".into());
            args.push(host);
            args.push("--port".into());
            args.push(port.to_string());
        }
    }

    emit(app, "launch", "Запуск игры", 1, 1);

    let log_path = game_dir.join("logs").join("aciron-latest.log");
    let _ = std::fs::create_dir_all(game_dir.join("logs"));
    let log_file = std::fs::File::create(&log_path).ok();

    let mut cmd = std::process::Command::new(&java);
    cmd.args(&args).current_dir(&game_dir);

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить Java: {e}"))?;
    let pid = child.id();

    let game_id = match &build_id {
        Some(b) => format!("build:{b}"),
        None => version.to_string(),
    };

    let shared_log = std::sync::Arc::new(std::sync::Mutex::new(log_file));
    if let Some(out) = child.stdout.take() {
        crate::gamelog::pump(app.clone(), game_id.clone(), out, shared_log.clone());
    }
    if let Some(err) = child.stderr.take() {
        crate::gamelog::pump(app.clone(), game_id.clone(), err, shared_log.clone());
    }
    register_game(&game_id, pid);

    if let Some(bid) = &build_id {
        crate::builds::touch_launch(bid);
    }

    crate::recents::touch(
        &game_id,
        if build_id.is_some() { "build" } else { "version" },
        build_name.filter(|n| !n.is_empty()).unwrap_or(version),
        version,
    );
    let _ = app.emit("game-started", serde_json::json!({ "id": game_id }));
    emit(app, "done", "Игра запущена", 1, 1);

    crate::presence::set_playing(version, build_name.unwrap_or(""), log_path.clone());

    let app2 = app.clone();
    let started = std::time::Instant::now();
    let track_build = build_id.clone();
    let game_id2 = game_id.clone();
    let log_path2 = log_path.clone();

    let aciron_token = crate::accounts::active_account()
        .map(|a| a.aciron_token)
        .filter(|t| !t.is_empty());

    std::thread::spawn(move || {
        let mut child = child;
        let success = match child.wait() {
            Ok(status) => status.success(),
            Err(_) => false,
        };

        if !success && started.elapsed().as_secs() < 40 {
            let tail = log_tail(&log_path2, 1600);
            let msg = if tail.is_empty() {
                "Игра неожиданно закрылась. Смотрите logs/aciron-latest.log.".to_string()
            } else {
                format!("Игра закрылась с ошибкой:\n{tail}")
            };
            emit(&app2, "error", &msg, 0, 1);
        }
        if let Some(bid) = &track_build {
            crate::builds::add_playtime(bid, started.elapsed().as_secs());
        }
        crate::recents::add_playtime(&game_id2, started.elapsed().as_secs());
        if let Some(tok) = aciron_token.clone() {
            tauri::async_runtime::spawn(crate::aciron::add_playtime(
                tok,
                started.elapsed().as_secs(),
            ));
        }

        if unregister_game(pid) == 0 {
            crate::discord::set_idle();
            crate::presence::set_stopped();
        }
        let _ = app2.emit("game-exited", serde_json::json!({ "id": game_id2 }));

        crate::gamelog::clear(&game_id2);
    });

    Ok(())
}

struct Identity {
    name: String,
    uuid: String,
    token: String,
    user_type: String,
}

async fn resolve_identity(app: &AppHandle, settings: &Settings) -> Result<Identity, String> {
    match crate::accounts::active_account() {

        Some(a) if a.kind == "microsoft" || (a.kind == "aciron" && a.licensed) => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            if !a.access_token.is_empty() && a.access_token != "0" && now + 300 < a.token_expires {
                return Ok(Identity {
                    name: a.username.clone(),
                    uuid: a.uuid.clone(),
                    token: a.access_token.clone(),
                    user_type: "msa".into(),
                });
            }
            let fresh = match crate::microsoft::refresh_account(&a.refresh_token).await {
                Ok(f) => f,
                Err(e) => {

                    eprintln!("[account] обновление сессии Microsoft не удалось: {e}");
                    emit(
                        app,
                        "identity",
                        "Нужен вход Microsoft — открыли браузер",
                        0,
                        1,
                    );
                    let f = crate::microsoft::interactive_login(app.clone()).await?;

                    if a.kind == "aciron" && !a.aciron_token.is_empty() {
                        crate::aciron::push_license(&a.aciron_token, &f).await;
                    }
                    f
                }
            };
            crate::accounts::update_tokens(
                &a.id,
                &fresh.access_token,
                &fresh.refresh_token,
                &fresh.uuid,
                &fresh.username,
                fresh.token_expires,
            );
            Ok(Identity {
                name: fresh.username,
                uuid: fresh.uuid,
                token: fresh.access_token,
                user_type: "msa".into(),
            })
        }
        Some(a) => Ok(Identity {
            name: a.username.clone(),
            uuid: offline_uuid(&a.username),
            token: "0".into(),
            user_type: "msa".into(),
        }),
        None => Ok(Identity {
            name: settings.username.clone(),
            uuid: offline_uuid(&settings.username),
            token: "0".into(),
            user_type: "msa".into(),
        }),
    }
}

fn split_host_port(addr: &str) -> (String, u16) {
    match addr.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() => (h.to_string(), p.parse().unwrap_or(25565)),
        _ => (addr.to_string(), 25565),
    }
}

fn version_ge_1_20(version: &str) -> bool {
    let mut it = version.split(|c| c == '.' || c == '-');
    let major = it.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let minor = it.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    major > 1 || (major == 1 && minor >= 20)
}

const TEST_SERVER_NAME: &str = "Aciron — тестовый сервер";
const TEST_SERVER_IP: &str = "mc.aciron.pro";

fn ensure_test_server(game_dir: &Path) {
    let path = game_dir.join("servers.dat");
    if path.exists() {
        return;
    }
    if let Some(p) = path.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    let data = build_servers_nbt(&[(TEST_SERVER_NAME, TEST_SERVER_IP)]);
    let _ = std::fs::write(&path, data);
}

fn ensure_fullscreen(game_dir: &Path) {
    let path = game_dir.join("options.txt");
    let _ = std::fs::create_dir_all(game_dir);
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = Vec::new();
    let mut found = false;
    for line in existing.lines() {
        if line.starts_with("fullscreen:") {
            lines.push("fullscreen:true".to_string());
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !found {
        lines.push("fullscreen:true".to_string());
    }
    let _ = std::fs::write(&path, lines.join("\n") + "\n");
}

fn build_servers_nbt(servers: &[(&str, &str)]) -> Vec<u8> {
    fn write_str(out: &mut Vec<u8>, s: &str) {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u16).to_be_bytes());
        out.extend_from_slice(b);
    }
    let mut out = Vec::new();

    out.push(0x0A);
    write_str(&mut out, "");

    out.push(0x09);
    write_str(&mut out, "servers");
    out.push(0x0A);
    out.extend_from_slice(&(servers.len() as i32).to_be_bytes());
    for (name, ip) in servers {
        out.push(0x08);
        write_str(&mut out, "name");
        write_str(&mut out, name);
        out.push(0x08);
        write_str(&mut out, "ip");
        write_str(&mut out, ip);
        out.push(0x01);
        write_str(&mut out, "acceptTextures");
        out.push(1);
        out.push(0x00);
    }
    out.push(0x00);
    out
}

const ACIRON_SKINS_JAR: &[u8] = include_bytes!("../resources/aciron-skins.jar");

fn ensure_aciron_skins(root: &Path) -> Option<PathBuf> {
    let jar = root.join("aciron-skins.jar");

    let want = sha256_hex(ACIRON_SKINS_JAR);
    let fresh = std::fs::read(&jar)
        .map(|data| sha256_hex(&data) == want)
        .unwrap_or(false);
    if !fresh {
        if let Err(e) = std::fs::write(&jar, ACIRON_SKINS_JAR) {
            eprintln!("[aciron-skins] не удалось записать jar: {e}");
            return None;
        }
    }
    Some(jar)
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let mut hasher = Sha256::new();
    hasher.update(data);
    let digest = hasher.finalize();
    let mut s = String::with_capacity(digest.len() * 2);
    for b in digest.iter() {

        let _ = write!(s, "{b:02x}");
    }
    s
}

#[derive(Serialize, Deserialize, Clone)]
pub struct InstalledVersion {
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: String,
}

fn installed_file() -> PathBuf {
    settings::data_root().join("installed.json")
}

fn read_installed() -> Vec<InstalledVersion> {
    match std::fs::read_to_string(installed_file()) {
        Ok(txt) => serde_json::from_str(&txt).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn write_installed(list: &[InstalledVersion]) -> Result<(), String> {
    let txt = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    crate::atomic::write(&installed_file(), &txt)
}

#[tauri::command]
pub fn get_installed_versions() -> Vec<InstalledVersion> {
    let mut list = read_installed();
    let s = settings::load_settings();
    if let Ok(rd) = std::fs::read_dir(&s.versions_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let id = entry.file_name().to_string_lossy().to_string();

            let idl = id.to_lowercase();
            if idl.contains("forge") || idl.contains("fabric") || idl.contains("quilt") {
                continue;
            }
            let json = path.join(format!("{id}.json"));
            if !json.exists() || list.iter().any(|v| v.id == id) {
                continue;
            }

            #[derive(Deserialize)]
            struct VersionType {
                #[serde(default)]
                r#type: String,
            }
            let kind = std::fs::read_to_string(&json)
                .ok()
                .and_then(|t| serde_json::from_str::<VersionType>(&t).ok())
                .map(|v| v.r#type)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "release".into());
            list.push(InstalledVersion { id, kind });
        }
    }
    list
}

#[tauri::command]
pub fn add_installed_version(id: String, kind: String) -> Result<(), String> {
    let mut list = read_installed();
    if !list.iter().any(|v| v.id == id) {
        list.push(InstalledVersion {
            id,
            kind: if kind.is_empty() { "release".into() } else { kind },
        });
        write_installed(&list)?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_installed_version(id: String) -> Result<(), String> {
    let mut list = read_installed();
    list.retain(|v| v.id != id);
    write_installed(&list)?;

    let s = settings::load_settings();
    let dir = PathBuf::from(&s.versions_dir).join(&id);
    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct VersionInfo {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    release_time: String,
}

#[tauri::command]
pub async fn list_versions() -> Result<Vec<VersionInfo>, String> {

    let client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1")
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let manifest = get_json(&client, MANIFEST).await?;
    let arr = manifest["versions"].as_array().cloned().unwrap_or_default();
    Ok(arr
        .iter()
        .map(|v| VersionInfo {
            id: v["id"].as_str().unwrap_or("").to_string(),
            kind: v["type"].as_str().unwrap_or("").to_string(),
            release_time: v["releaseTime"].as_str().unwrap_or("").to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    version: String,
    server: Option<String>,
) -> Result<(), String> {
    let settings = settings::load_settings();
    let res =
        prepare_and_launch(&app, &settings, &version, None, None, None, server.as_deref(), None, None).await;
    match &res {
        Ok(_) => {

            let _ = add_installed_version(version.clone(), String::new());
            crate::discord::set_version(&version);
        }
        Err(e) => emit(&app, "error", e, 0, 1),
    }
    res
}

#[tauri::command]
pub async fn launch_build(app: AppHandle, build_id: String) -> Result<(), String> {
    let build = crate::builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = match build.loader.as_str() {
        "fabric" | "quilt" | "forge" | "neoforge" => build.loader.clone(),
        other => {
            let msg = format!("Этот загрузчик не поддерживается: {other}");
            emit(&app, "error", &msg, 0, 1);
            return Err(msg);
        }
    };
    let settings = settings::load_settings();
    let game_dir = crate::builds::build_dir(&build_id);
    let _ = std::fs::create_dir_all(game_dir.join("mods"));
    let res = prepare_and_launch(
        &app,
        &settings,
        &build.mc_version,
        Some(game_dir),
        Some(&loader),

        Some(build.loader_version.as_str()).filter(|s| !s.is_empty()),
        None,
        Some(build_id.clone()),
        Some(&build.name),
    )
    .await;
    match &res {
        Ok(_) => {

            crate::discord::set_build(&build.name);
        }
        Err(e) => emit(&app, "error", e, 0, 1),
    }
    res
}
