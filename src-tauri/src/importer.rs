

use crate::{accounts, builds, settings};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct ExternalInstance {
    pub source: String,
    pub source_label: String,
    pub path: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub mods_count: u32,
}

struct Parsed {
    name: String,
    mc_version: String,
    loader: String,
    mods_count: u32,
    content_dir: PathBuf,
}

const SUPPORTED_LOADERS: [&str; 4] = ["fabric", "forge", "neoforge", "quilt"];

fn mmc_roots() -> Vec<(PathBuf, &'static str, &'static str)> {
    let cfg = settings_config_dir();
    let mut roots = Vec::new();
    if let Some(base) = cfg {
        roots.push((base.join("PrismLauncher"), "prism", "Prism Launcher"));
        roots.push((base.join("MultiMC"), "multimc", "MultiMC"));
        roots.push((base.join("PolyMC"), "polymc", "PolyMC"));
    }
    roots
}

fn modrinth_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(base) = settings_config_dir() {
        roots.push(base.join("com.modrinth.theseus"));
        roots.push(base.join("ModrinthApp"));
    }
    roots
}

fn settings_config_dir() -> Option<PathBuf> {
    dirs::config_dir()
}

fn cfg_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix(&format!("{key}=")) {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn count_mods(mods_dir: &Path) -> u32 {
    std::fs::read_dir(mods_dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| {
                    e.path().is_file()
                        && {
                            let n = e.file_name().to_string_lossy().to_lowercase();
                            n.ends_with(".jar") || n.ends_with(".jar.disabled")
                        }
                })
                .count() as u32
        })
        .unwrap_or(0)
}

fn parse_mmc(dir: &Path) -> Option<Parsed> {
    let pack: Value =
        serde_json::from_slice(&std::fs::read(dir.join("mmc-pack.json")).ok()?).ok()?;

    let mut mc_version = String::new();
    let mut loader = String::new();
    for c in pack["components"].as_array()? {
        let uid = c["uid"].as_str().unwrap_or("");
        let ver = c["cachedVersion"]
            .as_str()
            .or_else(|| c["version"].as_str())
            .unwrap_or("")
            .to_string();
        match uid {
            "net.minecraft" => mc_version = ver,
            "net.fabricmc.fabric-loader" => loader = "fabric".into(),
            "org.quiltmc.quilt-loader" => loader = "quilt".into(),
            "net.minecraftforge" => loader = "forge".into(),
            "net.neoforged" => loader = "neoforge".into(),
            _ => {}
        }
    }

    let mc_dir = [dir.join(".minecraft"), dir.join("minecraft")]
        .into_iter()
        .find(|p| p.is_dir())?;

    let name = std::fs::read_to_string(dir.join("instance.cfg"))
        .ok()
        .and_then(|t| cfg_value(&t, "name"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| dir.file_name().unwrap_or_default().to_string_lossy().into_owned());

    let mods_count = count_mods(&mc_dir.join("mods"));
    Some(Parsed { name, mc_version, loader, mods_count, content_dir: mc_dir })
}

fn parse_modrinth(dir: &Path) -> Option<Parsed> {
    parse_modrinth_json(dir).or_else(|| parse_modrinth_db(dir))
}

fn parse_modrinth_json(dir: &Path) -> Option<Parsed> {
    let v: Value =
        serde_json::from_slice(&std::fs::read(dir.join("profile.json")).ok()?).ok()?;

    let meta = if v.get("metadata").is_some() { &v["metadata"] } else { &v };
    let get = |k: &str| -> String {
        meta[k]
            .as_str()
            .or_else(|| v[k].as_str())
            .unwrap_or("")
            .to_string()
    };
    let name = {
        let n = get("name");
        if n.is_empty() {
            dir.file_name().unwrap_or_default().to_string_lossy().into_owned()
        } else {
            n
        }
    };
    let mc_version = get("game_version");
    let mut loader = get("loader").to_lowercase();
    if loader == "vanilla" {
        loader = String::new();
    }

    let content_dir = dir.to_path_buf();
    let mods_count = count_mods(&content_dir.join("mods"));
    Some(Parsed { name, mc_version, loader, mods_count, content_dir })
}

fn parse_modrinth_db(dir: &Path) -> Option<Parsed> {
    let folder = dir.file_name()?.to_string_lossy().to_string();

    let db = dir.parent()?.parent()?.join("app.db");
    if !db.is_file() {
        return None;
    }
    let conn =
        rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .ok()?;
    let mut stmt = conn.prepare("SELECT * FROM profiles WHERE path = ?1").ok()?;

    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let col = |n: &str| names.iter().position(|c| c == n);
    let name_i = col("name");
    let ver_i = col("game_version");
    let loader_i = col("mod_loader").or_else(|| col("loader"));

    let mut rows = stmt.query([folder.as_str()]).ok()?;
    let row = rows.next().ok()??;
    let get = |i: Option<usize>| -> String {
        i.and_then(|idx| row.get::<usize, String>(idx).ok()).unwrap_or_default()
    };

    let name = {
        let n = get(name_i);
        if n.is_empty() {
            folder.clone()
        } else {
            n
        }
    };
    let mc_version = get(ver_i);
    let mut loader = get(loader_i).to_lowercase();
    if loader == "vanilla" {
        loader = String::new();
    }
    let content_dir = dir.to_path_buf();
    let mods_count = count_mods(&content_dir.join("mods"));
    Some(Parsed { name, mc_version, loader, mods_count, content_dir })
}

fn parse_for(source: &str, dir: &Path) -> Option<Parsed> {
    if source == "modrinth" {
        parse_modrinth(dir)
    } else {
        parse_mmc(dir)
    }
}

fn importable(p: &Parsed) -> bool {
    !p.mc_version.is_empty() && SUPPORTED_LOADERS.contains(&p.loader.as_str())
}

#[tauri::command]
pub fn scan_external_instances() -> Vec<ExternalInstance> {
    let mut out = Vec::new();

    for (root, source, label) in mmc_roots() {
        let instances = root.join("instances");
        if let Ok(rd) = std::fs::read_dir(&instances) {
            for e in rd.flatten() {
                let dir = e.path();
                if !dir.is_dir() {
                    continue;
                }
                if let Some(p) = parse_mmc(&dir) {
                    if importable(&p) {
                        out.push(to_external(source, label, &dir, p));
                    }
                }
            }
        }
    }

    for root in modrinth_roots() {
        let profiles = root.join("profiles");
        if let Ok(rd) = std::fs::read_dir(&profiles) {
            for e in rd.flatten() {
                let dir = e.path();
                if !dir.is_dir() {
                    continue;
                }
                if let Some(p) = parse_modrinth(&dir) {
                    if importable(&p) {
                        out.push(to_external("modrinth", "Modrinth App", &dir, p));
                    }
                }
            }
        }
    }

    out
}

fn to_external(source: &str, label: &str, dir: &Path, p: Parsed) -> ExternalInstance {
    ExternalInstance {
        source: source.into(),
        source_label: label.into(),
        path: dir.to_string_lossy().into_owned(),
        name: p.name,
        mc_version: p.mc_version,
        loader: p.loader,
        mods_count: p.mods_count,
    }
}

#[tauri::command]
pub fn import_external_instance(path: String, source: String) -> Result<builds::Build, String> {
    let dir = PathBuf::from(&path);
    let p = parse_for(&source, &dir).ok_or("Не удалось прочитать инстанс")?;
    if !importable(&p) {
        return Err("У инстанса не определены версия/загрузчик".into());
    }

    let build = builds::create_build(p.name.clone(), p.mc_version.clone(), p.loader.clone())?;
    let dst = builds::build_dir(&build.id);

    for sub in ["mods", "resourcepacks", "shaderpacks", "config"] {
        copy_dir(&p.content_dir.join(sub), &dst.join(sub));
    }

    let opts = p.content_dir.join("options.txt");
    if opts.is_file() {
        let _ = std::fs::copy(&opts, dst.join("options.txt"));
    }

    builds::refresh_build_content(build.id.clone())
}

fn copy_dir(src: &Path, dst: &Path) {
    if !src.is_dir() {
        return;
    }
    let _ = std::fs::create_dir_all(dst);
    if let Ok(rd) = std::fs::read_dir(src) {
        for e in rd.flatten() {
            let from = e.path();
            let to = dst.join(e.file_name());
            if from.is_dir() {
                copy_dir(&from, &to);
            } else if from.is_file() {
                let _ = std::fs::copy(&from, &to);
            }
        }
    }
}

fn setup_marker() -> PathBuf {
    settings::data_root().join(".aciron_setup_done")
}

#[tauri::command]
pub fn first_run_pending() -> bool {

    if crate::instance::slot() > 1 {
        return false;
    }
    if setup_marker().exists() {
        return false;
    }

    if !builds::load_builds().is_empty() || accounts::active_account().is_some() {
        let _ = complete_first_run();
        return false;
    }
    true
}

#[tauri::command]
pub fn complete_first_run() -> Result<(), String> {
    let m = setup_marker();
    if let Some(p) = m.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    std::fs::write(&m, b"1").map_err(|e| e.to_string())
}
