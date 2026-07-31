use crate::builds::{self, Build, InstalledMod};
use crate::launcher::emit;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

const API: &str = "https://api.modpacks.ch/public";

fn cf_proxy() -> String {
    crate::curseforge::proxy_base()
}

// Безопасное соединение относительного пути с базовой директорией: отклоняем
// любые компоненты, выходящие за пределы базы (защита от path traversal).
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut p = base.to_path_buf();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(s) => p.push(s),
            _ => return None,
        }
    }
    Some(p)
}

fn http() -> Result<reqwest::Client, String> {

    reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .default_headers(crate::curseforge::proxy_headers())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn strip_id(project_id: &str) -> &str {
    project_id.strip_prefix("ftb:").unwrap_or(project_id)
}

async fn get_json(cl: &reqwest::Client, url: &str) -> Result<Value, String> {
    let resp = cl.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("FTB: {}", resp.status()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

fn art_url(pack: &Value, kind: &str) -> String {
    pack["art"]
        .as_array()
        .and_then(|a| a.iter().find(|x| x["type"].as_str() == Some(kind)))
        .and_then(|x| x["url"].as_str())
        .unwrap_or("")
        .to_string()
}

fn normalize_hit(pack: &Value) -> Value {
    let id = pack["id"].as_i64().unwrap_or_default();
    json!({
        "project_id": format!("ftb:{id}"),
        "slug": id.to_string(),
        "title": pack["name"].as_str().unwrap_or(""),
        "description": pack["synopsis"].as_str().unwrap_or(""),
        "icon_url": art_url(pack, "square"),
        "downloads": pack["installs"].as_u64().unwrap_or(0),
        "categories": pack["tags"].as_array().map(|a| {
            a.iter().filter_map(|t| t["name"].as_str().map(|s| s.to_string())).collect::<Vec<_>>()
        }).unwrap_or_default(),
        "author": pack["authors"].as_array().and_then(|a| a.first())
            .and_then(|a| a["name"].as_str()).unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn ftb_search(
    query: String,
    offset: u32,
    limit: u32,
) -> Result<Value, String> {
    let cl = http()?;

    let fetch = (offset + limit).clamp(limit, 50);
    let list_url = if query.trim().is_empty() {
        format!("{API}/modpack/popular/installs/{fetch}")
    } else {
        format!("{API}/modpack/search/{fetch}?term={}", urlencode(&query))
    };
    let list = get_json(&cl, &list_url).await?;
    let ids: Vec<i64> = list["packs"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_i64()).collect())
        .unwrap_or_default();
    let total = ids.len() as u64;

    let page: Vec<i64> = ids
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect();
    let mut hits: Vec<Value> = Vec::new();
    for id in page {
        if let Ok(pack) = get_json(&cl, &format!("{API}/modpack/{id}")).await {
            hits.push(normalize_hit(&pack));
        }
    }

    Ok(json!({
        "hits": hits,
        "total_hits": total,
        "offset": offset,
        "limit": limit,
    }))
}

#[tauri::command]
pub async fn ftb_project(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let id = strip_id(&project_id);
    let pack = get_json(&cl, &format!("{API}/modpack/{id}")).await?;
    let splash = art_url(&pack, "splash");
    let gallery: Vec<Value> = if splash.is_empty() {
        vec![]
    } else {
        vec![json!({ "url": splash })]
    };
    let description = pack["description"]
        .as_str()
        .filter(|s| !s.is_empty())
        .or_else(|| pack["synopsis"].as_str())
        .unwrap_or("");

    Ok(json!({
        "title": pack["name"].as_str().unwrap_or(""),
        "slug": id,
        "description": description,
        "body": "",
        "categories": pack["tags"].as_array().map(|a| {
            a.iter().filter_map(|t| t["name"].as_str().map(|s| s.to_string())).collect::<Vec<_>>()
        }).unwrap_or_default(),
        "downloads": pack["installs"].as_u64().unwrap_or(0),
        "followers": 0,
        "icon_url": art_url(&pack, "square"),
        "gallery": gallery,
        "source_url": Value::Null,
        "issues_url": Value::Null,
        "wiki_url": Value::Null,
        "discord_url": Value::Null,
        "website_url": format!("https://www.feed-the-beast.com/modpacks/{id}"),
    }))
}

fn normalize_version(v: &Value) -> Value {
    let targets = v["targets"].as_array().cloned().unwrap_or_default();
    let game_versions: Vec<String> = targets
        .iter()
        .filter(|t| t["type"].as_str() == Some("game"))
        .filter_map(|t| t["version"].as_str().map(|s| s.to_string()))
        .collect();
    let loaders: Vec<String> = targets
        .iter()
        .filter(|t| t["type"].as_str() == Some("modloader"))
        .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
        .collect();
    let vtype = v["type"].as_str().unwrap_or("Release").to_ascii_lowercase();
    let name = v["name"].as_str().unwrap_or("").to_string();
    json!({
        "id": v["id"].as_i64().unwrap_or_default().to_string(),
        "name": name.clone(),
        "version_number": name,
        "version_type": vtype,
        "game_versions": game_versions,
        "loaders": loaders,
        "date_published": "",
        "downloads": 0,
    })
}

#[tauri::command]
pub async fn ftb_project_versions(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let id = strip_id(&project_id);
    let pack = get_json(&cl, &format!("{API}/modpack/{id}")).await?;
    let mut versions: Vec<Value> = pack["versions"]
        .as_array()
        .map(|a| a.iter().map(normalize_version).collect())
        .unwrap_or_default();
    versions.reverse();
    Ok(Value::Array(versions))
}

async fn download_to(cl: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    let bytes = cl
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(path, &bytes).await.map_err(|e| e.to_string())
}

async fn resolve_url(cl: &reqwest::Client, f: &Value) -> Option<String> {
    if let Some(u) = f["url"].as_str().filter(|s| !s.is_empty()) {
        return Some(u.to_string());
    }
    let cf = &f["curseforge"];
    let (pid, fid) = (cf["project"].as_i64(), cf["file"].as_i64());
    if let (Some(pid), Some(fid)) = (pid, fid) {
        let url = format!("{}/v1/mods/{pid}/files/{fid}/download-url", cf_proxy());
        if let Ok(j) = get_json(cl, &url).await {
            return j["data"].as_str().filter(|s| !s.is_empty()).map(|s| s.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn ftb_install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    let cl = http()?;
    let id = strip_id(&project_id).to_string();

    let pack = get_json(&cl, &format!("{API}/modpack/{id}")).await?;
    let name = pack["name"].as_str().unwrap_or("Модпак FTB").to_string();
    let icon = art_url(&pack, "square");
    let vid = match version_id.filter(|s| !s.is_empty()) {
        Some(v) => v,
        None => pack["versions"]
            .as_array()
            .and_then(|a| a.last())
            .and_then(|v| v["id"].as_i64())
            .map(|n| n.to_string())
            .ok_or("У модпака нет версий")?,
    };

    emit(&app, "modpack", "Чтение манифеста", 0, 1);
    let manifest = get_json(&cl, &format!("{API}/modpack/{id}/{vid}")).await?;
    let targets = manifest["targets"].as_array().cloned().unwrap_or_default();
    let mc = targets
        .iter()
        .find(|t| t["type"].as_str() == Some("game"))
        .and_then(|t| t["version"].as_str())
        .ok_or("В модпаке не указана версия Minecraft")?
        .to_string();
    let loader = targets
        .iter()
        .find(|t| t["type"].as_str() == Some("modloader"))
        .and_then(|t| t["name"].as_str())
        .map(|s| match s {
            "fabric" => "fabric",
            "quilt" => "quilt",
            "neoforge" => "neoforge",
            _ => "forge",
        })
        .unwrap_or("forge");

    let build = builds::create_build(name, mc, loader.to_string())?;
    let build_dir = builds::build_dir(&build.id);

    let files = manifest["files"].as_array().cloned().unwrap_or_default();
    let total = files.len() as u64;
    let mut mods_entries: Vec<InstalledMod> = Vec::new();

    for (i, f) in files.iter().enumerate() {

        if f["serveronly"].as_bool() == Some(true) {
            emit(&app, "modpack", "Загрузка модпака", (i + 1) as u64, total);
            continue;
        }
        let fname = f["name"].as_str().unwrap_or("").to_string();
        if fname.is_empty() {
            continue;
        }

        let rel = f["path"].as_str().unwrap_or("./");
        let rel = rel.trim_start_matches("./").trim_start_matches('/');
        // Защита от path traversal: путь и имя файла из манифеста не должны
        // выходить за пределы сборки — иначе пропускаем запись.
        let dest = match safe_join(&build_dir, rel).and_then(|d| safe_join(&d, &fname)) {
            Some(d) => d,
            None => {
                emit(&app, "modpack", "Загрузка модпака", (i + 1) as u64, total);
                continue;
            }
        };

        if let Some(url) = resolve_url(&cl, f).await {
            if download_to(&cl, &url, &dest).await.is_ok() {

                if rel.replace('\\', "/").starts_with("mods") && fname.ends_with(".jar") {
                    mods_entries.push(InstalledMod {
                        project_id: format!("local:{fname}"),
                        version_id: String::new(),
                        name: fname.trim_end_matches(".jar").to_string(),
                        filename: fname.clone(),
                        icon_url: String::new(),
                        enabled: true,
                        kind: "mod".into(),
                    });
                }
            }
        }
        emit(&app, "modpack", "Загрузка модпака", (i + 1) as u64, total);
    }

    let mut build = builds::get_build(&build.id).ok_or("Сборка не найдена")?;
    build.mods = mods_entries;
    build.source_id = project_id.clone();

    if !icon.is_empty() {
        let ext = icon
            .rsplit('.')
            .next()
            .filter(|e| matches!(*e, "png" | "jpg" | "jpeg" | "webp" | "gif"))
            .unwrap_or("png")
            .to_string();
        let filename = format!("cover.{ext}");
        if download_to(&cl, &icon, &build_dir.join(&filename)).await.is_ok() {
            build.image = filename;
        }
        build.icon_url = icon;
    }

    builds::upsert_build(build.clone())?;
    emit(&app, "done", "Модпак установлен", 1, 1);
    Ok(build)
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
