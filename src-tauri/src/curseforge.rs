use crate::builds::{self, Build, InstalledMod};
use crate::content::{body_overflows, clamp_body};
use crate::launcher::emit_op;
use serde_json::{json, Value};

fn emit(app: &AppHandle, stage: &str, message: &str, current: u64, total: u64) {
    emit_op(app, "install", stage, message, current, total);
}
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::AppHandle;

const DEFAULT_PROXY: &str = match option_env!("ACIRON_CF_PROXY_URL") {
    Some(u) => u,
    None => "https://example.invalid",
};
const GAME_MINECRAFT: i64 = 432;

fn base() -> String {
    std::env::var("ACIRON_CF_PROXY").unwrap_or_else(|_| DEFAULT_PROXY.to_string())
}

pub(crate) fn proxy_base() -> String {
    base()
}

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

fn sane_filename(name: &str, fallback: &str) -> String {
    let mut it = Path::new(name).components();
    match (it.next(), it.next()) {
        (Some(Component::Normal(s)), None) => s.to_string_lossy().into_owned(),
        _ => fallback.to_string(),
    }
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .default_headers(proxy_headers())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn http() -> Result<reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c.clone());
    }
    let c = build_client()?;

    Ok(CLIENT.get_or_init(|| c).clone())
}

pub(crate) fn dl_client() -> Result<reqwest::Client, String> {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(c) = C.get() {
        return Ok(c.clone());
    }
    let c = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    Ok(C.get_or_init(|| c).clone())
}

pub fn proxy_headers() -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    if let Some(tok) = option_env!("ACIRON_PROXY_TOKEN") {
        if let Ok(v) = reqwest::header::HeaderValue::from_str(tok) {
            h.insert("X-Aciron-Key", v);
        }
    }
    h
}

fn class_id(project_type: &str) -> i64 {
    match project_type {
        "resourcepack" => 12,
        "shader" => 6552,
        "modpack" => 4471,
        _ => 6,
    }
}

fn kind_of_class(class_id: i64) -> &'static str {
    match class_id {
        12 => "resourcepack",
        6552 => "shader",
        _ => "mod",
    }
}

fn loader_type(loader: &str) -> i64 {
    match loader {
        "forge" => 1,
        "fabric" => 4,
        "quilt" => 5,
        "neoforge" => 6,
        _ => 0,
    }
}

fn sort_field(index: &str) -> Option<i64> {
    match index {
        "downloads" => Some(6),
        "follows" => Some(2),
        "newest" | "updated" => Some(3),
        _ => None,
    }
}

fn strip_id(project_id: &str) -> &str {
    project_id.strip_prefix("cf:").unwrap_or(project_id)
}

async fn get_json(cl: &reqwest::Client, url: &str) -> Result<Value, String> {
    get_query(cl, url, &[]).await
}

async fn get_query(cl: &reqwest::Client, url: &str, params: &[(&str, String)]) -> Result<Value, String> {
    let resp = cl
        .get(url)
        .query(params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge: {}", resp.status()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn curseforge_search(
    query: String,
    loader: String,
    game_version: String,
    categories: Vec<String>,
    index: String,
    offset: u32,
    limit: u32,
    project_type: String,
) -> Result<Value, String> {
    let cl = http()?;
    let cid = class_id(&project_type);

    let mut params: Vec<(&str, String)> = vec![
        ("gameId", GAME_MINECRAFT.to_string()),
        ("classId", cid.to_string()),
        ("index", offset.to_string()),
        ("pageSize", limit.clamp(1, 50).to_string()),
        ("sortOrder", "desc".into()),
    ];
    if !query.is_empty() {
        params.push(("searchFilter", query.clone()));
    }
    if !game_version.is_empty() {
        params.push(("gameVersion", game_version.clone()));
    }

    if cid == 6 {
        let lt = loader_type(&loader);
        if lt != 0 {
            params.push(("modLoaderType", lt.to_string()));
        }
    }
    if let Some(sf) = sort_field(&index) {
        params.push(("sortField", sf.to_string()));
    }

    let wanted: Vec<&String> = categories.iter().filter(|c| !c.is_empty()).collect();
    if !wanted.is_empty() {
        let map = category_map(&cl, cid).await.unwrap_or_default();
        let ids: Vec<String> = wanted
            .iter()
            .filter_map(|name| map.get(name.as_str()).map(|id| id.to_string()))
            .collect();
        if !ids.is_empty() {
            params.push(("categoryIds", format!("[{}]", ids.join(","))));
        }
    }

    let json = get_query(&cl, &format!("{}/v1/mods/search", base()), &params).await?;

    let hits: Vec<Value> = json["data"]
        .as_array()
        .map(|a| a.iter().map(normalize_hit).collect())
        .unwrap_or_default();

    let total = json["pagination"]["totalCount"].as_u64().unwrap_or(0).min(10_000);

    Ok(json!({
        "hits": hits,
        "total_hits": total,
        "offset": offset,
        "limit": limit,
    }))
}

async fn category_map(cl: &reqwest::Client, cid: i64) -> Result<HashMap<String, i64>, String> {
    let json = get_json(
        &cl,
        &format!("{}/v1/categories?gameId={GAME_MINECRAFT}&classId={cid}", base()),
    )
    .await?;
    let mut map = HashMap::new();
    if let Some(arr) = json["data"].as_array() {
        for c in arr {
            if let (Some(name), Some(id)) = (c["name"].as_str(), c["id"].as_i64()) {
                map.insert(name.to_string(), id);
            }
        }
    }
    Ok(map)
}

#[tauri::command]
pub async fn curseforge_categories() -> Result<Vec<String>, String> {
    let cl = http()?;
    let map = category_map(&cl, 6).await?;
    let mut names: Vec<String> = map.into_keys().collect();
    names.sort();
    Ok(names)
}

fn normalize_hit(m: &Value) -> Value {
    let id = m["id"].as_i64().unwrap_or_default();
    json!({
        "project_id": format!("cf:{id}"),
        "slug": m["slug"].as_str().unwrap_or(""),
        "title": m["name"].as_str().unwrap_or(""),
        "description": m["summary"].as_str().unwrap_or(""),
        "icon_url": m["logo"]["url"].as_str().unwrap_or(""),
        "downloads": m["downloadCount"].as_u64().unwrap_or(0),
        "categories": m["categories"].as_array().map(|a| {
            a.iter().filter_map(|c| c["name"].as_str().map(|s| s.to_string())).collect::<Vec<_>>()
        }).unwrap_or_default(),
        "author": m["authors"].as_array().and_then(|a| a.first())
            .and_then(|a| a["name"].as_str()).unwrap_or("").to_string(),
    })
}

fn loader_name(id: i64) -> Option<&'static str> {
    match id {
        1 => Some("forge"),
        4 => Some("fabric"),
        5 => Some("quilt"),
        6 => Some("neoforge"),
        _ => None,
    }
}

async fn description(cl: &reqwest::Client, id: &str) -> String {
    match get_json(cl, &format!("{}/v1/mods/{id}/description", base())).await {
        Ok(v) => v["data"].as_str().unwrap_or("").to_string(),
        Err(_) => String::new(),
    }
}

fn unwrap_linkouts(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(at) = rest.find("/linkout?remoteUrl=") {
        out.push_str(&rest[..at]);
        let tail = &rest[at + "/linkout?remoteUrl=".len()..];

        let end = tail
            .find(|c: char| c == '"' || c == '\'' || c == '<' || c == '>' || c.is_whitespace())
            .unwrap_or(tail.len());
        let encoded = &tail[..end];
        match decoded_http(encoded) {
            Some(url) => out.push_str(&url),

            None => {
                out.push_str("/linkout?remoteUrl=");
                out.push_str(encoded);
            }
        }
        rest = &tail[end..];
    }
    out.push_str(rest);
    out
}

fn decoded_http(encoded: &str) -> Option<String> {
    let once = percent_decode(encoded);
    [percent_decode(&once), once]
        .into_iter()
        .find(|c| c.starts_with("http://") || c.starts_with("https://"))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

#[tauri::command]
pub async fn curseforge_project(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let id = strip_id(&project_id).to_string();

    let url = format!("{}/v1/mods/{id}", base());
    let (json, body) = futures::join!(get_json(&cl, &url), description(&cl, &id));
    let json = json?;
    let m = &json["data"];
    let links = &m["links"];

    let gallery: Vec<Value> = m["screenshots"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s["url"].as_str().map(|u| (s, u)))
                .map(|(s, u)| {
                    json!({
                        "url": u,
                        "title": s["title"].as_str().filter(|x| !x.is_empty()),
                        "description": s["description"].as_str().filter(|x| !x.is_empty()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let authors: Vec<Value> = m["authors"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str())
                .map(|n| json!({ "name": n }))
                .collect()
        })
        .unwrap_or_default();

    let idx = m["latestFilesIndexes"].as_array().cloned().unwrap_or_default();
    let mut game_versions: Vec<String> = Vec::new();
    let mut loaders: Vec<String> = Vec::new();
    for f in &idx {
        if let Some(v) = f["gameVersion"].as_str() {
            if !v.is_empty() && !game_versions.iter().any(|x| x == v) {
                game_versions.push(v.to_string());
            }
        }
        if let Some(l) = f["modLoader"].as_i64().and_then(loader_name) {
            if !loaders.iter().any(|x| x == l) {
                loaders.push(l.to_string());
            }
        }
    }
    crate::content::sort_versions_desc(&mut game_versions);

    let website = links["websiteUrl"].as_str().unwrap_or("");

    Ok(json!({
        "title": m["name"].as_str().unwrap_or(""),
        "slug": m["slug"].as_str().unwrap_or(""),
        "description": m["summary"].as_str().unwrap_or(""),
        "body": clamp_body(&unwrap_linkouts(&body)),
        "body_format": if body.is_empty() { "" } else { "html" },
        "body_truncated": body_overflows(&body),
        "categories": m["categories"].as_array().map(|a| {
            a.iter().filter_map(|c| c["name"].as_str().map(|s| s.to_string())).collect::<Vec<_>>()
        }).unwrap_or_default(),
        "additional_categories": Vec::<String>::new(),
        "downloads": m["downloadCount"].as_u64().unwrap_or(0),

        "followers": m["thumbsUpCount"].as_u64(),
        "icon_url": m["logo"]["url"].as_str().unwrap_or(""),
        "gallery": gallery,
        "authors": authors,
        "game_versions": game_versions,
        "loaders": loaders,
        "donation_urls": Vec::<Value>::new(),

        "license_name": Value::Null,
        "license_url": Value::Null,
        "client_side": Value::Null,
        "server_side": Value::Null,
        "published": m["dateCreated"].as_str(),
        "updated": m["dateModified"].as_str().or_else(|| m["dateReleased"].as_str()),
        "project_type": kind_of_class(m["classId"].as_i64().unwrap_or(6)),
        "status": Value::Null,
        "versions_count": Value::Null,
        "is_available": m["isAvailable"].as_bool().unwrap_or(true),

        "allow_distribution": m["allowModDistribution"].as_bool(),
        "source_url": links["sourceUrl"].as_str().filter(|s| !s.is_empty()),
        "issues_url": links["issuesUrl"].as_str().filter(|s| !s.is_empty()),
        "wiki_url": links["wikiUrl"].as_str().filter(|s| !s.is_empty()),
        "discord_url": Value::Null,

        "website_url": website,
    }))
}

fn is_loader_tag(s: &str) -> bool {
    matches!(
        s.to_ascii_lowercase().as_str(),
        "forge" | "fabric" | "quilt" | "neoforge" | "liteloader" | "rift" | "cauldron"
            | "client" | "server"
    )
}

fn normalize_file(f: &Value) -> Value {
    let id = f["id"].as_i64().unwrap_or_default();
    let gvs = f["gameVersions"].as_array().cloned().unwrap_or_default();
    let game_versions: Vec<String> = gvs
        .iter()
        .filter_map(|v| v.as_str())
        .filter(|s| !is_loader_tag(s))
        .map(|s| s.to_string())
        .collect();
    let loaders: Vec<String> = gvs
        .iter()
        .filter_map(|v| v.as_str())
        .filter(|s| is_loader_tag(s) && !matches!(s.to_ascii_lowercase().as_str(), "client" | "server"))
        .map(|s| s.to_ascii_lowercase())
        .collect();
    let vtype = match f["releaseType"].as_i64().unwrap_or(1) {
        2 => "beta",
        3 => "alpha",
        _ => "release",
    };
    let name = f["displayName"].as_str().unwrap_or("").to_string();
    json!({
        "id": id.to_string(),
        "name": name.clone(),
        "version_number": name,
        "version_type": vtype,
        "game_versions": game_versions,
        "loaders": loaders,
        "date_published": f["fileDate"].as_str().unwrap_or(""),
        "downloads": f["downloadCount"].as_u64().unwrap_or(0),
    })
}

#[tauri::command]
pub async fn curseforge_project_versions(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let id = strip_id(&project_id);
    let json = get_json(
        &cl,
        &format!("{}/v1/mods/{id}/files?index=0&pageSize=50", base()),
    )
    .await?;
    let versions: Vec<Value> = json["data"]
        .as_array()
        .map(|a| a.iter().map(normalize_file).collect())
        .unwrap_or_default();
    Ok(Value::Array(versions))
}

async fn download_to(url: &str, path: &Path) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    let cl = dl_client()?;

    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }

    let tmp = {
        let mut s = path.as_os_str().to_os_string();
        s.push(".part");
        std::path::PathBuf::from(s)
    };
    let res: Result<(), String> = async {
        let resp = cl.get(url).send().await.map_err(|e| e.to_string())?;
        let mut stream = resp.bytes_stream();
        let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| e.to_string())?;
            file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        }
        file.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    .await;
    match res {
        Ok(()) => tokio::fs::rename(&tmp, path).await.map_err(|e| e.to_string()),
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            Err(e)
        }
    }
}

async fn file_download_url(cl: &reqwest::Client, mod_id: i64, f: &Value) -> Result<String, String> {
    if let Some(u) = f["downloadUrl"].as_str().filter(|s| !s.is_empty()) {
        return Ok(u.to_string());
    }
    let file_id = f["id"].as_i64().unwrap_or_default();
    let json = get_json(
        &cl,
        &format!("{}/v1/mods/{mod_id}/files/{file_id}/download-url", base()),
    )
    .await?;
    json["data"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())

        .ok_or_else(|| "The author has disabled downloading this file in third-party launchers".to_string())
}

pub(crate) struct CfFile {

    pub url: String,
    pub file_name: String,
    pub size: u64,

    pub sha1: String,

    pub display: String,
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    http()
}

pub(crate) async fn project_name(cl: &reqwest::Client, mod_id: i64) -> String {
    match get_json(cl, &format!("{}/v1/mods/{mod_id}", base())).await {
        Ok(j) => j["data"]["name"].as_str().unwrap_or_default().to_string(),
        Err(_) => String::new(),
    }
}

pub(crate) async fn file_info(
    cl: &reqwest::Client,
    mod_id: i64,
    file_id: &str,
) -> Result<CfFile, String> {
    let f = get_json(cl, &format!("{}/v1/mods/{mod_id}/files/{file_id}", base())).await?["data"]
        .clone();
    if f.is_null() {
        return Err("File not found".into());
    }
    let sha1 = f["hashes"]
        .as_array()
        .and_then(|a| a.iter().find(|h| h["algo"].as_i64() == Some(1)))
        .and_then(|h| h["value"].as_str())
        .unwrap_or_default()
        .to_string();
    Ok(CfFile {
        url: file_download_url(cl, mod_id, &f).await.unwrap_or_default(),
        file_name: f["fileName"].as_str().unwrap_or_default().to_string(),
        size: f["fileLength"].as_u64().unwrap_or(0),
        sha1,
        display: f["displayName"].as_str().unwrap_or_default().to_string(),
    })
}

async fn mod_info(cl: &reqwest::Client, mod_id: i64) -> (String, String, i64) {
    match get_json(cl, &format!("{}/v1/mods/{mod_id}", base())).await {
        Ok(j) => {
            let m = &j["data"];
            (
                m["name"].as_str().unwrap_or("").to_string(),
                m["logo"]["url"].as_str().unwrap_or("").to_string(),
                m["classId"].as_i64().unwrap_or(6),
            )
        }
        Err(_) => (mod_id.to_string(), String::new(), 6),
    }
}

async fn best_file(
    cl: &reqwest::Client,
    mod_id: i64,
    loader: Option<&str>,
    mc_version: &str,
) -> Result<Option<Value>, String> {
    let mut params: Vec<(&str, String)> = vec![
        ("index", "0".into()),
        ("pageSize", "30".into()),
        ("gameVersion", mc_version.to_string()),
    ];
    if let Some(l) = loader {
        let lt = loader_type(l);
        if lt != 0 {
            params.push(("modLoaderType", lt.to_string()));
        }
    }
    let json = get_query(cl, &format!("{}/v1/mods/{mod_id}/files", base()), &params).await?;
    Ok(json["data"].as_array().and_then(|a| a.first().cloned()))
}

#[tauri::command]
pub async fn cf_check_build_updates(build_id: String) -> Result<Vec<String>, String> {
    use futures::StreamExt;

    let build = builds::get_build(&build_id).ok_or("Instance not found")?;
    let cl = http()?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();

    let targets: Vec<(String, i64, String, bool)> = build
        .mods
        .iter()
        .filter(|m| m.project_id.starts_with("cf:") && !m.version_id.is_empty())
        .filter_map(|m| {
            strip_id(&m.project_id)
                .parse::<i64>()
                .ok()
                .map(|id| (m.project_id.clone(), id, m.version_id.clone(), m.kind == "mod"))
        })
        .collect();

    let tasks = targets.into_iter().map(|(pid, mid, installed, is_mod)| {
        let cl = cl.clone();
        let loader = loader.clone();
        let mc = mc.clone();
        async move {
            let filter = if is_mod { Some(loader.as_str()) } else { None };
            match best_file(&cl, mid, filter, &mc).await {
                Ok(Some(f)) => {
                    let latest = f["id"].as_i64().unwrap_or_default().to_string();
                    (latest != "0" && latest != installed).then_some(pid)
                }
                Ok(None) => None,
                Err(e) => {
                    eprintln!("[updates] {pid}: {e}");
                    None
                }
            }
        }
    });

    let found: Vec<Option<String>> = futures::stream::iter(tasks).buffer_unordered(8).collect().await;
    Ok(found.into_iter().flatten().collect())
}

fn required_deps(f: &Value) -> Vec<i64> {
    f["dependencies"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|d| d["relationType"].as_i64() == Some(3))
                .filter_map(|d| d["modId"].as_i64())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn curseforge_install(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Instance not found")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let root_id: i64 = strip_id(&project_id).parse().map_err(|_| "Invalid CurseForge id")?;
    let (_n, _i, root_class) = mod_info(&cl, root_id).await;
    let kind = kind_of_class(root_class).to_string();
    let is_mod = kind == "mod";

    let existing = build
        .mods
        .iter()
        .find(|m| strip_id(&m.project_id).parse::<i64>().ok() == Some(root_id))
        .cloned();
    let mut seen: HashSet<i64> = build
        .mods
        .iter()
        .filter_map(|m| strip_id(&m.project_id).parse::<i64>().ok())
        .collect();
    seen.remove(&root_id);
    build
        .mods
        .retain(|m| strip_id(&m.project_id).parse::<i64>().ok() != Some(root_id));

    let mut queue: Vec<(i64, bool)> = vec![(root_id, true)];

    while let Some((mid, is_root)) = queue.pop() {
        if seen.contains(&mid) {
            continue;
        }
        seen.insert(mid);

        let file_loader = if is_root && !is_mod { None } else { Some(loader.as_str()) };
        let file = match best_file(&cl, mid, file_loader, &mc).await? {
            Some(f) => f,
            None => {
                if is_root {
                    return Err(match kind.as_str() {
                        "resourcepack" => format!(
                            "This resource pack doesn't fit this build. Pick another version: {mc}"
                        ),
                        "shader" => {
                            format!("This shader doesn't fit this build. Pick another version: {mc}")
                        }
                        _ => format!(
                            "This mod doesn't fit this build. Pick another version: {mc} · {loader}"
                        ),
                    });
                }
                continue;
            }
        };

        let filename = sane_filename(file["fileName"].as_str().unwrap_or("file.jar"), "file.jar");
        let url = file_download_url(&cl, mid, &file).await?;
        let dest_dir = if is_root {
            builds::content_dir(&build_id, &kind)
        } else {
            builds::mods_dir(&build_id)
        };
        download_to(&url, &dest_dir.join(&filename)).await?;

        let prev = if is_root { existing.as_ref() } else { None };

        if let Some(old) = prev {
            let old_path = builds::content_dir(&build_id, &old.kind).join(&old.filename);
            if old_path != dest_dir.join(&filename) {
                let _ = std::fs::remove_file(old_path);
            }
        }

        let enabled = prev.map(|o| o.enabled).unwrap_or(true);
        let filename = if enabled {
            filename
        } else {
            let off = format!("{filename}.disabled");
            let _ = std::fs::rename(dest_dir.join(&filename), dest_dir.join(&off));
            off
        };

        let (title, icon, _c) = mod_info(&cl, mid).await;
        build.mods.push(InstalledMod {
            project_id: format!("cf:{mid}"),
            version_id: file["id"].as_i64().unwrap_or_default().to_string(),
            name: title,
            filename,
            icon_url: icon,
            enabled,
            kind: if is_root { kind.clone() } else { "mod".into() },
        });

        if is_mod || !is_root {
            for dep in required_deps(&file) {
                if !seen.contains(&dep) {
                    queue.push((dep, false));
                }
            }
        }
    }

    builds::upsert_build(build.clone())?;
    Ok(build)
}

#[tauri::command]
pub async fn curseforge_install_version(
    build_id: String,
    project_id: String,
    version_id: String,
) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Instance not found")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let mid: i64 = strip_id(&project_id).parse().map_err(|_| "Invalid CurseForge id")?;
    let (title, icon, root_class) = mod_info(&cl, mid).await;
    let kind = kind_of_class(root_class).to_string();
    let is_mod = kind == "mod";

    let file = get_json(&cl, &format!("{}/v1/mods/{mid}/files/{version_id}", base()))
        .await?["data"]
        .clone();
    if file.is_null() {
        return Err("File not found".into());
    }
    let filename = sane_filename(file["fileName"].as_str().unwrap_or("file.jar"), "file.jar");
    let url = file_download_url(&cl, mid, &file).await?;

    let pid = format!("cf:{mid}");
    if let Some(old) = build.mods.iter().find(|m| m.project_id == pid) {
        let _ = std::fs::remove_file(builds::content_dir(&build_id, &old.kind).join(&old.filename));
    }
    build.mods.retain(|m| m.project_id != pid);

    download_to(&url, &builds::content_dir(&build_id, &kind).join(&filename)).await?;
    build.mods.push(InstalledMod {
        project_id: pid,
        version_id: version_id.clone(),
        name: title,
        filename,
        icon_url: icon,
        enabled: true,
        kind: kind.clone(),
    });

    if is_mod {
        let mut seen: HashSet<i64> = build
            .mods
            .iter()
            .filter_map(|m| strip_id(&m.project_id).parse::<i64>().ok())
            .collect();
        let mut queue: Vec<i64> = required_deps(&file);
        while let Some(mid) = queue.pop() {
            if seen.contains(&mid) {
                continue;
            }
            seen.insert(mid);
            if let Some(f) = best_file(&cl, mid, Some(loader.as_str()), &mc).await? {
                let fname = sane_filename(f["fileName"].as_str().unwrap_or("mod.jar"), "mod.jar");
                let durl = match file_download_url(&cl, mid, &f).await {
                    Ok(u) => u,
                    Err(_) => continue,
                };
                download_to(&durl, &builds::mods_dir(&build_id).join(&fname)).await?;
                let (t, ic, _c) = mod_info(&cl, mid).await;
                build.mods.push(InstalledMod {
                    project_id: format!("cf:{mid}"),
                    version_id: f["id"].as_i64().unwrap_or_default().to_string(),
                    name: t,
                    filename: fname,
                    icon_url: ic,
                    enabled: true,
                    kind: "mod".into(),
                });
                for d in required_deps(&f) {
                    if !seen.contains(&d) {
                        queue.push(d);
                    }
                }
            }
        }
    }

    builds::upsert_build(build.clone())?;
    Ok(build)
}

#[tauri::command]
pub async fn curseforge_install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {

    let res = cf_install_inner(app.clone(), project_id, version_id).await;
    if let Err(e) = &res {
        if e != crate::cancel::CANCELLED {
            emit(&app, "error", e, 0, 1);
        }
    }
    res
}

async fn cf_install_inner(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    let cl = http()?;

    crate::cancel::reset("legacy");
    let mid: i64 = strip_id(&project_id).parse().map_err(|_| "Invalid CurseForge id")?;

    let file = match version_id.as_deref().filter(|s| !s.is_empty()) {
        Some(vid) => {
            get_json(&cl, &format!("{}/v1/mods/{mid}/files/{vid}", base())).await?["data"].clone()
        }
        None => {
            let j = get_query(
                &cl,
                &format!("{}/v1/mods/{mid}/files", base()),
                &[("index", "0".into()), ("pageSize", "1".into())],
            )
            .await?;
            j["data"]
                .as_array()
                .and_then(|a| a.first().cloned())
                .ok_or("The modpack has no files")?
        }
    };

    emit(&app, "modpack", "Downloading modpack", 0, 1);
    let url = file_download_url(&cl, mid, &file).await?;

    let file_id = file["id"].as_i64().unwrap_or_default();
    let tmp_zip = std::env::temp_dir().join(format!("aciron-cf-modpack-{mid}-{file_id}.zip"));
    {
        use futures::StreamExt;
        use tokio::io::AsyncWriteExt;
        let resp = cl.get(&url).send().await.map_err(|e| e.to_string())?;
        let mut stream = resp.bytes_stream();
        let mut out = tokio::fs::File::create(&tmp_zip)
            .await
            .map_err(|e| e.to_string())?;
        while let Some(chunk) = stream.next().await {

            if crate::cancel::is_cancelled("legacy") {
                drop(out);
                let _ = tokio::fs::remove_file(&tmp_zip).await;
                return Err(crate::cancel::CANCELLED.into());
            }
            let bytes = chunk.map_err(|e| e.to_string())?;
            out.write_all(&bytes).await.map_err(|e| e.to_string())?;
        }
        out.flush().await.map_err(|e| e.to_string())?;
    }

    let tmp_zip_for_task = tmp_zip.clone();
    let parse_result = tokio::task::spawn_blocking(move || -> Result<(String, PathBuf, Vec<Value>), String> {
        let f = std::fs::File::open(&tmp_zip_for_task).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;

        let manifest_txt = {
            let mut f = zip
                .by_name("manifest.json")
                .map_err(|_| "manifest.json is missing from the modpack")?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };
        let manifest: Value = serde_json::from_str(&manifest_txt).map_err(|e| e.to_string())?;
        let mc = manifest["minecraft"]["version"]
            .as_str()
            .ok_or("The modpack does not state a Minecraft version")?
            .to_string();

        let loaders = manifest["minecraft"]["modLoaders"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let loader_id = loaders
            .iter()
            .find(|l| l["primary"].as_bool() == Some(true))
            .or_else(|| loaders.first())
            .and_then(|l| l["id"].as_str())
            .unwrap_or("forge");
        let loader = match loader_id.split('-').next().unwrap_or("forge") {
            "fabric" => "fabric",
            "quilt" => "quilt",
            "neoforge" => "neoforge",
            _ => "forge",
        };
        let name = manifest["name"]
            .as_str()
            .unwrap_or_else(|| {
                crate::i18n::t("CurseForge modpack")
            })
            .to_string();
        let overrides = manifest["overrides"].as_str().unwrap_or("overrides").to_string();

        let build = builds::create_build(name, mc, loader.to_string())?;
        let dir = builds::build_dir(&build.id);

        let prefix = format!("{overrides}/");
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            if entry.is_dir() {
                continue;
            }
            let ename = entry.name().to_string();
            if let Some(rel) = ename.strip_prefix(&prefix) {

                let dest = match safe_join(&dir, rel) {
                    Some(d) => d,
                    None => continue,
                };
                if let Some(p) = dest.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                if let Ok(mut out) = std::fs::File::create(&dest) {
                    let _ = std::io::copy(&mut entry, &mut out);
                }
            }
        }

        let files_list = manifest["files"].as_array().cloned().unwrap_or_default();
        Ok((build.id, dir, files_list))
    })
    .await;

    let _ = tokio::fs::remove_file(&tmp_zip).await;

    let (build_id, build_dir, files_list) = match parse_result {
        Ok(r) => r?,
        Err(e) => return Err(e.to_string()),
    };

    use futures::StreamExt;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    let total = files_list.len() as u64;
    let mods_dir = builds::mods_dir(&build_id);
    let done = Arc::new(AtomicU64::new(0));

    let tasks = files_list.into_iter().enumerate().map(|(i, f)| {
        let cl = cl.clone();
        let app = app.clone();
        let mods_dir = mods_dir.clone();
        let done = done.clone();
        let pid = f["projectID"].as_i64().unwrap_or(0);
        let fid = f["fileID"].as_i64().unwrap_or(0);
        async move {
            let mut entry: Option<InstalledMod> = None;

            if pid != 0 && fid != 0 && !crate::cancel::is_cancelled("legacy") {
                if let Ok(fj) =
                    get_json(&cl, &format!("{}/v1/mods/{pid}/files/{fid}", base())).await
                {
                    let dl_file = &fj["data"];
                    if let Ok(durl) = file_download_url(&cl, pid, dl_file).await {
                        let filename =
                            sane_filename(dl_file["fileName"].as_str().unwrap_or("mod.jar"), "mod.jar");
                        let dest = mods_dir.join(&filename);
                        if download_to(&durl, &dest).await.is_ok() {
                            entry = Some(InstalledMod {
                                project_id: format!("cf:{pid}"),
                                version_id: fid.to_string(),
                                name: filename.trim_end_matches(".jar").to_string(),
                                filename,
                                icon_url: String::new(),
                                enabled: true,
                                kind: "mod".into(),
                            });
                        }
                    }
                }
            }
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            emit(&app, "modpack", "Downloading modpack", n, total);
            (i, entry)
        }
    });

    let mut results: Vec<(usize, Option<InstalledMod>)> =
        futures::stream::iter(tasks).buffer_unordered(8).collect().await;

    results.sort_by_key(|(i, _)| *i);
    let mods_entries: Vec<InstalledMod> = results.into_iter().filter_map(|(_, e)| e).collect();

    if crate::cancel::is_cancelled("legacy") {
        let _ = builds::delete_build(build_id.clone());
        return Err(crate::cancel::CANCELLED.into());
    }

    let mut build = match builds::get_build(&build_id) {
        Some(b) => b,
        None => {
            let _ = builds::delete_build(build_id.clone());
            return Err("Instance not found".into());
        }
    };
    build.mods = mods_entries;
    build.source_id = project_id.clone();

    let (_n, icon, _c) = mod_info(&cl, mid).await;
    if !icon.is_empty() {
        let ext = icon
            .rsplit('.')
            .next()
            .filter(|e| matches!(*e, "png" | "jpg" | "jpeg" | "webp" | "gif"))
            .unwrap_or("png")
            .to_string();
        let filename = format!("cover.{ext}");
        if download_to(&icon, &build_dir.join(&filename)).await.is_ok() {
            build.image = filename;
        }
        build.icon_url = icon;
    }

    if let Err(e) = builds::upsert_build(build.clone()) {
        let _ = builds::delete_build(build_id.clone());
        return Err(e);
    }
    emit(&app, "done", "Modpack installed", 1, 1);
    Ok(build)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwraps_redirect_links() {

        let html = r#"<a href="/linkout?remoteUrl=http%253a%252f%252fwiki.aidancbrady.com%252fwiki%252fMain_Page">Wiki</a>"#;
        let got = unwrap_linkouts(html);
        assert!(got.contains(r#"href="http://wiki.aidancbrady.com/wiki/Main_Page""#), "{got}");
        assert!(!got.contains("linkout"), "{got}");
    }

    #[test]
    fn several_links_in_a_row() {
        let html = concat!(
            r#"<a href="/linkout?remoteUrl=https%253a%252f%252fa.test%252f">A</a> and "#,
            r#"<a href="/linkout?remoteUrl=https%253a%252f%252fb.test%252f">B</a>"#
        );
        let got = unwrap_linkouts(html);
        assert!(got.contains("https://a.test/") && got.contains("https://b.test/"), "{got}");
    }

    #[test]
    fn plain_html_is_left_alone() {
        let html = r#"<p>text <a href="https://ok.test/x">link</a></p>"#;
        assert_eq!(unwrap_linkouts(html), html);
    }

    #[test]
    fn malformed_link_is_left_as_is() {
        let html = r#"<a href="/linkout?remoteUrl=%%%">x</a>"#;
        let got = unwrap_linkouts(html);
        assert!(got.contains("/linkout?remoteUrl=%%%"), "{got}");
    }
}
