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

fn kind_exts(kind: &str) -> &'static [&'static str] {
    match kind {
        "resourcepack" | "shader" => &["zip"],
        _ => &["jar"],
    }
}

fn base_name(f: &str) -> String {
    f.strip_suffix(".disabled").unwrap_or(f).to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Build {
    pub id: String,
    pub name: String,
    pub mc_version: String,

    pub loader: String,
    #[serde(default)]
    pub loader_version: String,
    #[serde(default)]
    pub mods: Vec<InstalledMod>,
    #[serde(default)]
    pub created: u64,

    #[serde(default)]
    pub dir: String,

    #[serde(default)]
    pub banner: String,

    #[serde(default)]
    pub image: String,

    #[serde(default)]
    pub icon_url: String,

    #[serde(default)]
    pub source_id: String,

    #[serde(default)]
    pub playtime_secs: u64,

    #[serde(default)]
    pub favorite: bool,

    #[serde(default)]
    pub server: String,

    #[serde(default)]
    pub last_played: u64,
}

pub fn touch_launch(build_id: &str) {

    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let mut list = load_builds();
    if let Some(b) = list.iter_mut().find(|b| b.id == build_id) {
        b.last_played = now_secs();
        let _ = save_builds(&list);
    }
}

#[tauri::command]
pub fn set_build_favorite(build_id: String, favorite: bool) -> Result<Build, String> {

    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let mut list = load_builds();
    let b = list
        .iter_mut()
        .find(|b| b.id == build_id)
        .ok_or("Instance not found")?;
    b.favorite = favorite;
    let updated = b.clone();
    save_builds(&list)?;
    Ok(updated)
}

pub fn add_playtime(build_id: &str, secs: u64) {

    let mut list = load_builds();
    if let Some(b) = list.iter_mut().find(|b| b.id == build_id) {
        b.playtime_secs += secs;
        let _ = save_builds(&list);
    }
}

#[tauri::command]
pub fn rename_build(build_id: String, name: String) -> Result<Build, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Enter an instance name".into());
    }
    let mut b = get_build(&build_id).ok_or("Instance not found")?;
    b.name = name;
    upsert_build(b.clone())?;
    Ok(b)
}

#[tauri::command]
pub fn set_build_loader(
    build_id: String,
    loader: String,
    loader_version: String,
) -> Result<Build, String> {
    if !matches!(loader.as_str(), "fabric" | "quilt" | "forge" | "neoforge") {
        return Err(format!("This loader isn't supported: {loader}"));
    }
    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let mut b = get_build(&build_id).ok_or("Instance not found")?;
    b.loader = loader;
    b.loader_version = loader_version.trim().to_string();
    upsert_build(b.clone())?;
    Ok(b)
}

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

    crate::atomic::write(&store_file(), &txt)
}

fn builds_lock() -> &'static std::sync::Mutex<()> {
    static L: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    L.get_or_init(|| std::sync::Mutex::new(()))
}

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

pub fn build_dir(id: &str) -> PathBuf {
    let s = settings::load_settings();
    let folder = get_build(id)
        .map(|b| if b.dir.is_empty() { b.id } else { b.dir })
        .unwrap_or_else(|| id.to_string());
    PathBuf::from(&s.builds_dir).join(folder)
}

fn build_dir_for(builds_dir: &str, b: &Build) -> PathBuf {
    let folder = if b.dir.is_empty() { &b.id } else { &b.dir };
    PathBuf::from(builds_dir).join(folder)
}

pub fn mods_dir(id: &str) -> PathBuf {
    build_dir(id).join("mods")
}

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

    format!("{:?}", SystemTime::now())
}

pub fn get_build(id: &str) -> Option<Build> {
    load_builds().into_iter().find(|b| b.id == id)
}

pub fn merge_mods(
    build_id: &str,
    drop_ids: &[String],
    add: Vec<InstalledMod>,
) -> Result<Build, String> {
    let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
    let mut list = load_builds();
    let build = list
        .iter_mut()
        .find(|b| b.id == build_id)
        .ok_or("Instance not found")?;
    build
        .mods
        .retain(|m| !drop_ids.contains(&m.project_id) && !add.iter().any(|n| n.project_id == m.project_id));
    build.mods.extend(add);
    let updated = build.clone();
    save_builds(&list)?;
    Ok(updated)
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
        return Err("Enter an instance name".into());
    }
    if mc_version.is_empty() {
        return Err("Choose a Minecraft version".into());
    }

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
        favorite: false,
        server: String::new(),
        last_played: 0,
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

    let dir = build_dir(&id);
    {

        let _guard = builds_lock().lock().unwrap_or_else(|p| p.into_inner());
        let mut list = load_builds();
        list.retain(|b| b.id != id);
        save_builds(&list)?;
    }

    crate::recents::remove(&format!("build:{id}"));
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

#[tauri::command]
pub fn set_build_banner(build_id: String, src_path: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Instance not found")?;

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

#[tauri::command]
pub fn get_build_banner(build_id: String) -> Option<String> {
    let build = get_build(&build_id)?;
    if build.banner.is_empty() {
        return None;
    }
    let base = build_dir_for(&settings::load_settings().builds_dir, &build);
    file_data_url(&base.join(&build.banner))
}

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

#[tauri::command]
pub fn set_build_image(build_id: String, src_path: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Instance not found")?;
    let src = PathBuf::from(&src_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let filename = format!("cover.{ext}");

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

#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    const MAX_BYTES: u64 = 16 * 1024 * 1024;
    let path = PathBuf::from(path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return Err("This is not an image".into()),
    };
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("This is not a file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("The image is too large".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
}

#[tauri::command]
pub fn toggle_mod(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Instance not found")?;

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

#[tauri::command]
pub fn remove_mod(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = get_build(&build_id).ok_or("Instance not found")?;

    let build_base = build_dir_for(&settings::load_settings().builds_dir, &build);
    if let Some(m) = build.mods.iter().find(|m| m.project_id == project_id) {
        let file = build_base.join(kind_subdir(&m.kind)).join(&m.filename);
        let _ = std::fs::remove_file(file);
    }
    build.mods.retain(|m| m.project_id != project_id);
    upsert_build(build.clone())?;
    Ok(build)
}

fn sniff_zip_kind(path: &std::path::Path) -> Option<&'static str> {
    let file = std::fs::File::open(path).ok()?;
    let mut zip = zip::ZipArchive::new(file).ok()?;
    let mut looks_resourcepack = false;
    for i in 0..zip.len() {
        let Ok(entry) = zip.by_index(i) else { continue };
        let name = entry.name().replace('\\', "/");

        let rel = match name.split_once('/') {
            Some((_, rest)) if !rest.is_empty() && !name.starts_with("shaders/") && !name.starts_with("assets/") => rest,
            _ => name.as_str(),
        };
        if rel.starts_with("shaders/") || name.starts_with("shaders/") {
            return Some("shader");
        }
        if rel.starts_with("pack.mcmeta") || rel.starts_with("assets/") || name.starts_with("assets/") {
            looks_resourcepack = true;
        }
    }
    if looks_resourcepack {
        Some("resourcepack")
    } else {
        None
    }
}

#[tauri::command]
pub fn add_content_files(
    build_id: String,
    paths: Vec<String>,
    hint: String,
) -> Result<(Build, u32, u32), String> {
    let build = get_build(&build_id).ok_or("Instance not found")?;
    let base = build_dir_for(&settings::load_settings().builds_dir, &build);
    let mut added = 0u32;
    let mut skipped = 0u32;

    for p in &paths {
        let src = PathBuf::from(p);
        if !src.is_file() {
            skipped += 1;
            continue;
        }
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let kind = match ext.as_str() {
            "jar" => "mod",
            "zip" => sniff_zip_kind(&src).unwrap_or(match hint.as_str() {
                "shader" => "shader",
                "mod" => "resourcepack",
                _ => "resourcepack",
            }),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let dir = base.join(kind_subdir(kind));
        if std::fs::create_dir_all(&dir).is_err() {
            skipped += 1;
            continue;
        }
        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            skipped += 1;
            continue;
        };
        let dest = dir.join(name);

        if dest.exists() {
            skipped += 1;
            continue;
        }
        if std::fs::copy(&src, &dest).is_ok() {
            added += 1;
        } else {
            skipped += 1;
        }
    }

    let updated = refresh_build_content(build_id)?;
    Ok((updated, added, skipped))
}

#[tauri::command]
pub fn refresh_build_content(build_id: String) -> Result<Build, String> {
    use std::collections::HashMap;
    let mut build = get_build(&build_id).ok_or("Instance not found")?;
    let mut kept: Vec<InstalledMod> = Vec::new();

    let build_base = build_dir_for(&settings::load_settings().builds_dir, &build);

    for kind in ["mod", "resourcepack", "shader"] {
        let dir = build_base.join(kind_subdir(kind));
        let _ = std::fs::create_dir_all(&dir);
        let exts = kind_exts(kind);

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

                    Some(mut m) => {
                        m.filename = fname.clone();
                        m.enabled = !is_disabled;
                        kept.push(m);
                    }

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

    }

    build.mods = kept;
    upsert_build(build.clone())?;
    Ok(build)
}
