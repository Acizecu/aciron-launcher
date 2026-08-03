use crate::settings::{self, open_folder};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn default_true() -> bool {
    true
}

fn default_kind() -> String {
    "mod".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMod {
    pub project_id: String,
    pub version_id: String,
    pub name: String,
    pub filename: String,
    #[serde(default)]
    pub icon_url: String,

    #[serde(default = "default_true")]
    pub enabled: bool,

    #[serde(default = "default_kind")]
    pub kind: String,
}

fn kind_subdir(kind: &str) -> &'static str {
    match kind {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        _ => "mods",
    }
}

/// Допустимые расширения файлов для типа контента.
fn kind_exts(kind: &str) -> &'static [&'static str] {
    match kind {
        "resourcepack" | "shader" => &["zip"],
        _ => &["jar"],
    }
}

/// Имя файла без суффикса .disabled.
fn base_name(f: &str) -> String {
    f.strip_suffix(".disabled").unwrap_or(f).to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Build {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    /// fabric | forge | neoforge | quilt
    pub loader: String,
    #[serde(default)]
    pub loader_version: String,
    #[serde(default)]
    pub mods: Vec<InstalledMod>,
    #[serde(default)]
    pub created: u64,
    /// Папка сборки на диске (латиница, транслит имени). Пусто у старых сборок → берётся id.
    #[serde(default)]
    pub dir: String,
    /// Имя файла широкого баннера в папке сборки ("" = нет).
    #[serde(default)]
    pub banner: String,
    /// Имя файла обложки в папке сборки ("" = нет).
    #[serde(default)]
    pub image: String,
    /// Публичный URL обложки (иконка модпака Modrinth) — для Discord RPC. "" = нет.
    #[serde(default)]
    pub icon_url: String,
    /// ID проекта-модпака Modrinth, из которого собрана сборка ("" = не из модпака).
    /// Нужен для дозагрузки обложки и будущих обновлений.
    #[serde(default)]
    pub source_id: String,
    /// Суммарное время игры на сборке в секундах.
    #[serde(default)]
    pub playtime_secs: u64,
}

/// Добавляет секунды к наигранному времени сборки.
pub fn add_playtime(build_id: &str, secs: u64) {
    // Один read+write вместо прежних двух чтений builds.json
    // (get_build -> load_builds, затем upsert_build -> load_builds + save).
    // Поведение то же: если сборка есть — инкремент playtime и сохранение;
    // если нет — ничего не пишем.
    let mut list = load_builds();
    if let Some(b) = list.iter_mut().find(|b| b.id == build_id) {
        b.playtime_secs += secs;
        let _ = save_builds(&list);
    }
}

/// Переименовывает сборку (папка на диске не меняется).
#[tauri::command]
pub fn rename_build(build_id: String, name: String) -> Result<Build, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Введите название сборки".into());
    }
    let mut b = get_build(&build_id).ok_or("Сборка не найдена")?;
    b.name = name;
    upsert_build(b.clone())?;
    Ok(b)
}

/// Транслитерация кириллицы + очистка под имя папки.
fn slugify(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        let lower = ch.to_lowercase().next().unwrap_or(ch);
        let mapped: &str = match lower {
            'а' => "a", 'б' => "b", 'в' => "v", 'г' => "g", 'д' => "d",
            'е' | 'ё' => "e", 'ж' => "zh", 'з' => "z", 'и' | 'й' => "i",
            'к' => "k", 'л' => "l", 'м' => "m", 'н' => "n", 'о' => "o",
            'п' => "p", 'р' => "r", 'с' => "s", 'т' => "t", 'у' => "u",
            'ф' => "f", 'х' => "h", 'ц' => "c", 'ч' => "ch", 'ш' => "sh",
            'щ' => "sch", 'ы' => "y", 'э' => "e", 'ю' => "yu", 'я' => "ya",
            'ъ' | 'ь' => "",
            c if c.is_ascii_alphanumeric() => {
                out.push(c);
                continue;
            }
            _ => "-",
        };
        out.push_str(mapped);
    }
    // схлопываем дефисы, обрезаем края
    let mut slug = String::new();
    let mut prev_dash = false;
    for c in out.chars() {
        if c == '-' {
            if !prev_dash && !slug.is_empty() {
                slug.push('-');
            }
            prev_dash = true;
        } else {
            slug.push(c);
            prev_dash = false;
        }
    }
    slug.trim_matches('-').to_string()
}

/// Уникальное имя папки (латиница) для новой сборки.
fn unique_dir(name: &str) -> String {
    let base = {
        let s = slugify(name);
        if s.is_empty() { "build".to_string() } else { s }
    };
    let s = settings::load_settings();
    let root = PathBuf::from(&s.builds_dir);
    let taken: Vec<String> = load_builds().iter().map(|b| b.dir.clone()).collect();
    let mut candidate = base.clone();
    let mut i = 2;
    while root.join(&candidate).exists() || taken.iter().any(|d| d == &candidate) {
        candidate = format!("{base}-{i}");
        i += 1;
    }
    candidate
}

fn store_file() -> PathBuf {
    settings::data_root().join("builds.json")
}

pub fn load_builds() -> Vec<Build> {
    match std::fs::read_to_string(store_file()) {
        Ok(txt) => serde_json::from_str(&txt).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_builds(list: &[Build]) -> Result<(), String> {
    let txt = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    // Атомарно: список сборок читается на каждом экране, обрезанный файл
    // выглядел бы как «сборок нет».
    crate::atomic::write(&store_file(), &txt)
}

/// Сериализует изменения builds.json. Раньше create/upsert/delete делали
/// load→modify→save без блокировки: параллельная установка модпака (create в
/// начале, финальный upsert через минуты) и любая другая операция читали устаревший
/// список и затирали чужие записи → потеря сборок и дубли. Лок вокруг коротких
/// секций (без await внутри) это сериализует. Poisoning нам не важен — под локом
/// только (), данные не портятся.
fn builds_lock() -> &'static std::sync::Mutex<()> {
    static L: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    L.get_or_init(|| std::sync::Mutex::new(()))
}

/// Уникальное ОТОБРАЖАЕМОЕ имя сборки: если такое имя уже есть, добавляем
/// " (2)", " (3)"… По решению владельца повторная установка того же модпака НЕ
/// переиспользует и НЕ затирает существующую сборку (это исключает потерю данных),
/// а создаётся отдельная с числовым суффиксом — чтобы их было видно раздельно.
fn unique_name(name: &str) -> String {
    let taken: Vec<String> = load_builds().into_iter().map(|b| b.name).collect();
    if !taken.iter().any(|n| n == name) {
        return name.to_string();
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{name} ({n})");
        if !taken.iter().any(|x| x == &candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// Папка данных конкретной сборки: <builds_dir>/<dir|id>.
pub fn build_dir(id: &str) -> PathBuf {
    let s = settings::load_settings();
    let folder = get_build(id)
        .map(|b| if b.dir.is_empty() { b.id } else { b.dir })
        .unwrap_or_else(|| id.to_string());
    PathBuf::from(&s.builds_dir).join(folder)
}

/// Как build_dir, но по уже загруженной сборке — без повторного load_settings /
/// load_builds. Поведение идентично build_dir(&b.id): при пустом b.dir берётся
/// b.id (совпадает с get_build(id) для той же записи). Используется в командах,
/// которые уже держат Build на руках, чтобы убрать N+1 чтения builds.json.
fn build_dir_for(builds_dir: &str, b: &Build) -> PathBuf {
    let folder = if b.dir.is_empty() { &b.id } else { &b.dir };
    PathBuf::from(builds_dir).join(folder)
}

pub fn mods_dir(id: &str) -> PathBuf {
    build_dir(id).join("mods")
}

/// Папка контента конкретного типа внутри сборки.
pub fn content_dir(id: &str, kind: &str) -> PathBuf {
    build_dir(id).join(kind_subdir(kind))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn gen_id() -> String {
    format!("{:x}", md5::compute(now_secs().to_string() + &fastrand_suffix()))
}

fn fastrand_suffix() -> String {
    // немного энтропии, чтобы id не совпадали при быстром создании
    format!("{:?}", SystemTime::now())
}

pub fn get_build(id: &str) -> Option<Build> {
    load_builds().into_iter().find(|b| b.id == id)
}

pub fn upsert_build(build: Build) -> Result<(), String> {
    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let mut list = load_builds();
    if let Some(existing) = list.iter_mut().find(|b| b.id == build.id) {
        *existing = build;
    } else {
        list.push(build);
    }
    save_builds(&list)
}

#[tauri::command]
pub fn get_builds() -> Vec<Build> {
    load_builds()
}

#[tauri::command]
pub fn create_build(name: String, mc_version: String, loader: String) -> Result<Build, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Введите название сборки".into());
    }
    if mc_version.is_empty() {
        return Err("Выберите версию Minecraft".into());
    }
    // Под локом: подбор уникального имени/папки и запись атомарны относительно
    // параллельных create/upsert/delete — иначе две установки могли бы выбрать
    // одинаковый суффикс или затереть список друг друга.
    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let name = unique_name(&name);
    let dir = unique_dir(&name);
    let build = Build {
        id: gen_id(),
        name,
        mc_version,
        loader,
        loader_version: String::new(),
        mods: Vec::new(),
        created: now_secs(),
        dir: dir.clone(),
        banner: String::new(),
        image: String::new(),
        icon_url: String::new(),
        source_id: String::new(),
        playtime_secs: 0,
    };
    let s = settings::load_settings();
    let base = PathBuf::from(&s.builds_dir).join(&dir);
    for sub in ["mods", "resourcepacks", "shaderpacks"] {
        let _ = std::fs::create_dir_all(base.join(sub));
    }
    let mut list = load_builds();
    list.push(build.clone());
    save_builds(&list)?;
    Ok(build)
}

#[tauri::command]
pub fn delete_build(id: String) -> Result<(), String> {
    // Папку определяем ПОКА сборка ещё в списке (build_dir резолвит слаг через get_build).
    let dir = build_dir(&id);
    {
        // Мутацию списка держим под локом; медленный remove_dir_all — вне лока.
        let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
        let mut list = load_builds();
        list.retain(|b| b.id != id);
        save_builds(&list)?;
    }
    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}

#[tauri::command]
pub fn open_build_folder(id: String) -> Result<(), String> {
    let dir = build_dir(&id);
    open_folder(dir.to_string_lossy().into_owned())
}

/// Ставит широкий баннер сборки (шапка на странице сборки). Копируется в папку
/// сборки как `banner.<ext>`; пустой src_path — убрать баннер.
#[tauri::command]
pub fn set_build_banner(build_id: String, src_path: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Сборка не найдена")?;
    // Папку резолвим по загруженной сборке — без повторного load_builds.
    let dir = build_dir_for(&settings::load_settings().builds_dir, &build);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !build.banner.is_empty() {
        let _ = std::fs::remove_file(dir.join(&build.banner));
    }
    if src_path.is_empty() {
        build.banner = String::new();
        upsert_build(build.clone())?;
        return Ok(build);
    }
    let src = PathBuf::from(&src_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let filename = format!("banner.{ext}");
    std::fs::copy(&src, dir.join(&filename)).map_err(|e| e.to_string())?;
    build.banner = filename;
    upsert_build(build.clone())?;
    Ok(build)
}

/// Баннер сборки как data-URL (base64), либо None.
#[tauri::command]
pub fn get_build_banner(build_id: String) -> Option<String> {
    let build = get_build(&build_id)?;
    if build.banner.is_empty() {
        return None;
    }
    let base = build_dir_for(&settings::load_settings().builds_dir, &build);
    file_data_url(&base.join(&build.banner))
}

/// Читает картинку с диска и отдаёт как data-URL.
fn file_data_url(path: &std::path::Path) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = std::fs::read(path).ok()?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

/// Ставит обложку сборки (копирует картинку в папку сборки).
#[tauri::command]
pub fn set_build_image(build_id: String, src_path: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Сборка не найдена")?;
    let src = PathBuf::from(&src_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let filename = format!("cover.{ext}");
    // Папку резолвим по загруженной сборке — без повторного load_builds.
    let dir = build_dir_for(&settings::load_settings().builds_dir, &build);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if !build.image.is_empty() {
        let _ = std::fs::remove_file(dir.join(&build.image));
    }
    std::fs::copy(&src, dir.join(&filename)).map_err(|e| e.to_string())?;
    build.image = filename;
    upsert_build(build.clone())?;
    Ok(build)
}

/// Возвращает обложку сборки как data-URL (base64), либо None.
#[tauri::command]
pub fn get_build_image(build_id: String) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let build = get_build(&build_id)?;
    if build.image.is_empty() {
        return None;
    }
    let path = build_dir_for(&settings::load_settings().builds_dir, &build).join(&build.image);
    let bytes = std::fs::read(&path).ok()?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    Some(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

/// Включает/выключает мод (переименовывает файл, добавляя/убирая .disabled).
#[tauri::command]
pub fn toggle_mod(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Сборка не найдена")?;
    // Резолвим папку по уже загруженной сборке — без повторного чтения builds.json.
    let build_base = build_dir_for(&settings::load_settings().builds_dir, &build);
    if let Some(m) = build.mods.iter_mut().find(|m| m.project_id == project_id) {
        let dir = build_base.join(kind_subdir(&m.kind));
        let cur = dir.join(&m.filename);
        let new_name = if m.enabled {
            format!("{}.disabled", m.filename)
        } else {
            m.filename
                .strip_suffix(".disabled")
                .unwrap_or(&m.filename)
                .to_string()
        };
        let _ = std::fs::rename(&cur, dir.join(&new_name));
        m.filename = new_name;
        m.enabled = !m.enabled;
    }
    upsert_build(build.clone())?;
    Ok(build)
}

/// Удаляет мод из сборки и его файл.
#[tauri::command]
pub fn remove_mod(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Сборка не найдена")?;
    // Резолвим папку по уже загруженной сборке — без повторного чтения builds.json.
    let build_base = build_dir_for(&settings::load_settings().builds_dir, &build);
    if let Some(m) = build.mods.iter().find(|m| m.project_id == project_id) {
        let file = build_base.join(kind_subdir(&m.kind)).join(&m.filename);
        let _ = std::fs::remove_file(file);
    }
    build.mods.retain(|m| m.project_id != project_id);
    upsert_build(build.clone())?;
    Ok(build)
}

/// Синхронизирует список контента сборки с файлами на диске: подхватывает
/// вручную добавленные моды/ресурспаки/шейдеры и убирает удалённые файлы.
#[tauri::command]
pub fn refresh_build_content(build_id: String) -> Result<Build, String> {
    use std::collections::HashMap;
    let mut build = get_build(&build_id).ok_or("Сборка не найдена")?;
    let mut kept: Vec<InstalledMod> = Vec::new();

    // Папку сборки резолвим один раз (было: build_dir() внутри цикла ×3 →
    // ×3 load_settings + ×3 load_builds). Значение то же: build уже загружен,
    // на диске он не меняется до финального upsert_build ниже.
    let build_base = build_dir_for(&settings::load_settings().builds_dir, &build);

    for kind in ["mod", "resourcepack", "shader"] {
        let dir = build_base.join(kind_subdir(kind));
        let _ = std::fs::create_dir_all(&dir);
        let exts = kind_exts(kind);

        // известные записи этого типа, по базовому имени файла
        let mut known: HashMap<String, InstalledMod> = build
            .mods
            .iter()
            .filter(|m| m.kind == kind)
            .map(|m| (base_name(&m.filename), m.clone()))
            .collect();

        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                if !e.path().is_file() {
                    continue;
                }
                let fname = e.file_name().to_string_lossy().to_string();
                let is_disabled = fname.ends_with(".disabled");
                let core = fname.strip_suffix(".disabled").unwrap_or(&fname);
                if !exts.iter().any(|x| core.to_lowercase().ends_with(&format!(".{x}"))) {
                    continue;
                }
                let base = base_name(&fname);
                match known.remove(&base) {
                    // файл уже отслеживается — обновляем имя/состояние
                    Some(mut m) => {
                        m.filename = fname.clone();
                        m.enabled = !is_disabled;
                        kept.push(m);
                    }
                    // добавлен вручную — заводим запись
                    None => {
                        let pretty = core
                            .trim_end_matches(".jar")
                            .trim_end_matches(".zip")
                            .to_string();
                        kept.push(InstalledMod {
                            project_id: format!("local:{kind}:{base}"),
                            version_id: String::new(),
                            name: pretty,
                            filename: fname,
                            icon_url: String::new(),
                            enabled: !is_disabled,
                            kind: kind.to_string(),
                        });
                    }
                }
            }
        }
        // оставшиеся в known — файлы удалены с диска → в список не попадают
    }

    build.mods = kept;
    upsert_build(build.clone())?;
    Ok(build)
}
