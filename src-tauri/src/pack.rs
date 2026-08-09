

use crate::builds::{self, Build, InstalledMod};
use crate::launcher::emit_op;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha512};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;
use zip::write::SimpleFileOptions;

const API: &str = "https://api.modrinth.com/v2";

const PACK_FORMAT: u32 = 2;

const CKEY: &str = "legacy";

const NEVER: [&str; 10] = [
    "logs",
    "crash-reports",
    "backups",
    "natives",
    ".fabric",
    ".mixin.out",
    "realms-persistence",
    "debug",
    "usercache.json",
    "usernamecache.json",
];

const DEFAULT_ON: [&str; 5] = [
    "mods",
    "resourcepacks",
    "shaderpacks",
    "config",
    "options.txt",
];

const REMOTE_DIRS: [&str; 3] = ["mods/", "resourcepacks/", "shaderpacks/"];

fn is_never(name: &str) -> bool {
    NEVER.contains(&name) || name.starts_with(".aciron") || name == "Thumbs.db" || name == ".DS_Store"
}

fn is_remote_candidate(rel: &str) -> bool {
    REMOTE_DIRS.iter().any(|d| rel.starts_with(d)) && !rel.ends_with(".disabled")
}

#[derive(Serialize)]
pub struct TreeEntry {
    pub name: String,
    pub is_dir: bool,

    pub size: u64,

    pub files: u64,

    pub default_on: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RemoteFile {

    pub path: String,

    #[serde(default)]
    pub name: String,

    #[serde(default)]
    pub version: String,

    pub source: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub version_id: String,

    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub sha1: String,
    #[serde(default)]
    pub sha512: String,

    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub icon_url: String,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub build: Build,

    pub missing: Vec<String>,
}

fn dir_size(dir: &Path) -> (u64, u64) {
    let mut size = 0;
    let mut files = 0;
    let Ok(rd) = std::fs::read_dir(dir) else { return (0, 0) };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            let (s, f) = dir_size(&p);
            size += s;
            files += f;
        } else if let Ok(m) = e.metadata() {
            size += m.len();
            files += 1;
        }
    }
    (size, files)
}

#[tauri::command]
pub async fn build_tree(build_id: String) -> Result<Vec<TreeEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || build_tree_blocking(&build_id))
        .await
        .map_err(|e| e.to_string())?
}

fn build_tree_blocking(build_id: &str) -> Result<Vec<TreeEntry>, String> {
    let dir = builds::build_dir(build_id);
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Ok(out);
    };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if is_never(&name) {
            continue;
        }
        let p = e.path();
        let (size, files) = if p.is_dir() {
            dir_size(&p)
        } else {
            (e.metadata().map(|m| m.len()).unwrap_or(0), 1)
        };
        out.push(TreeEntry {
            default_on: DEFAULT_ON.contains(&name.as_str()),
            name,
            is_dir: p.is_dir(),
            size,
            files,
        });
    }

    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(b.size.cmp(&a.size)));
    Ok(out)
}

fn collect(base: &Path, include: &[String]) -> Result<Vec<(String, PathBuf)>, String> {
    let mut out = Vec::new();
    walk(base, base, include, &mut out)?;
    out.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(out)
}

fn walk(
    base: &Path,
    dir: &Path,
    include: &[String],
    out: &mut Vec<(String, PathBuf)>,
) -> Result<(), String> {
    let rd = std::fs::read_dir(dir)
        .map_err(|e| format!("Не прочитать папку: {} — {e}", dir.display()))?;
    for e in rd {
        let e = e.map_err(|err| format!("Не прочитать папку: {} — {err}", dir.display()))?;
        let path = e.path();
        let Ok(rel) = path.strip_prefix(base) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let head = rel.split('/').next().unwrap_or("");
        if is_never(head) || !include.iter().any(|i| i == head) {
            continue;
        }
        if path.is_dir() {
            walk(base, &path, include, out)?;
        } else if path.is_file() {
            out.push((rel, path));
        }
    }
    Ok(())
}

fn sha512_hex(bytes: &[u8]) -> String {
    let mut h = Sha512::new();
    h.update(bytes);
    hex(&h.finalize())
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(bytes);
    hex(&h.finalize())
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn kind_of(rel: &str) -> &'static str {
    if rel.starts_with("resourcepacks/") {
        "resourcepack"
    } else if rel.starts_with("shaderpacks/") {
        "shader"
    } else {
        "mod"
    }
}

/// Ядро загрузчика в терминах зависимостей mrpack. None — ядро неизвестно
/// (ванильная сборка или что-то, чего в формате нет): тогда зависимость лучше
/// не писать вовсе, чем выдумать чужую.
fn loader_key(loader: &str) -> Option<&'static str> {
    match loader {
        "fabric" => Some("fabric-loader"),
        "quilt" => Some("quilt-loader"),
        "forge" => Some("forge"),
        "neoforge" => Some("neoforge"),
        _ => None,
    }
}

async fn loader_version_for(loader: &str, mc: &str) -> Option<String> {
    let cl = modrinth_client()?;
    match loader {
        "fabric" | "quilt" => {
            let url = if loader == "fabric" {
                format!("https://meta.fabricmc.net/v2/versions/loader/{mc}")
            } else {
                format!("https://meta.quiltmc.org/v3/versions/loader/{mc}")
            };
            let list: Value = cl.get(url).send().await.ok()?.json().await.ok()?;
            list.as_array()?
                .first()?["loader"]["version"]
                .as_str()
                .map(|s| s.to_string())
        }
        "forge" => crate::forge::resolve_forge_version(&cl, mc).await.ok(),
        "neoforge" => crate::forge::resolve_neoforge_version(&cl, mc).await.ok(),
        _ => None,
    }
}

#[tauri::command]
pub async fn export_build(
    app: AppHandle,
    build_id: String,
    format: String,
    dest: String,
    include: Vec<String>,
) -> Result<u64, String> {
    let build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let dir = builds::build_dir(&build_id);
    if !dir.is_dir() {
        return Err("Папка сборки не найдена".into());
    }

    crate::cancel::reset(CKEY);
    emit_op(&app, "export", "modpack", "Читаем файлы сборки", 0, 1);
    let mut include = if include.is_empty() {
        DEFAULT_ON.iter().map(|s| s.to_string()).collect::<Vec<_>>()
    } else {
        include
    };

    for art in [&build.image, &build.banner] {
        if !art.is_empty() && !include.iter().any(|i| i == art) {
            include.push(art.clone());
        }
    }
    let files = collect(&dir, &include)?;
    if files.is_empty() {
        return Err("Нечего экспортировать: ничего не выбрано".into());
    }

    let hits = modrinth_hits(&app, &files).await;

    let mrpack_index: HashMap<String, Value> = if format == "mrpack" {
        hits.iter()
            .map(|h| {
                (
                    h.rel.clone(),
                    json!({
                        "path": h.rel,
                        "hashes": { "sha1": h.sha1, "sha512": h.sha512 },
                        "env": { "client": "required", "server": "optional" },
                        "downloads": [h.url],
                        "fileSize": h.size,
                    }),
                )
            })
            .collect()
    } else {
        HashMap::new()
    };

    let remote: HashMap<String, RemoteFile> = if format == "acpack" {
        resolve_remote(&app, &files, &build, hits).await
    } else {
        HashMap::new()
    };

    let mrpack_loader = if format == "mrpack" && loader_key(&build.loader).is_some() {
        if build.loader_version.is_empty() {
            loader_version_for(&build.loader, &build.mc_version).await
        } else {
            Some(build.loader_version.clone())
        }
    } else {
        None
    };

    if crate::cancel::is_cancelled(CKEY) {
        return Err(crate::cancel::CANCELLED.to_string());
    }

    let dest_path = PathBuf::from(&dest);
    if let Some(p) = dest_path.parent() {
        let _ = std::fs::create_dir_all(p);
    }

    let tmp_path = dest_path.with_extension("part");
    let out = std::fs::File::create(&tmp_path).map_err(|e| format!("Не создать файл: {e}"))?;
    let mut zip = zip::ZipWriter::new(out);

    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9));

    let total = files.len() as u64;
    let mut index_files: Vec<Value> = Vec::new();
    let mut remote_list: Vec<RemoteFile> = Vec::new();
    let mut done = 0u64;

    let mut pack = || -> Result<(), String> {
        for (rel, path) in &files {

            if crate::cancel::is_cancelled(CKEY) {
                return Err(crate::cancel::CANCELLED.to_string());
            }
            done += 1;
            if done % 8 == 0 || done == total {
                emit_op(&app, "export", "modpack", "Упаковываем", done, total);
            }

            if let Some(v) = mrpack_index.get(rel) {
                index_files.push(v.clone());
                continue;
            }
            if let Some(r) = remote.get(rel) {
                remote_list.push(r.clone());
                continue;
            }

            let bytes =
                std::fs::read(path).map_err(|e| format!("Не прочитать файл: {rel} — {e}"))?;
            zip.start_file(format!("overrides/{rel}"), opts)
                .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        Ok(())
    };
    if let Err(e) = pack() {
        drop(zip);
        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    let manifest = if format == "mrpack" {
        let mut deps = serde_json::Map::new();
        deps.insert("minecraft".into(), json!(build.mc_version));

        if let (Some(key), Some(lv)) = (loader_key(&build.loader), mrpack_loader.clone()) {
            deps.insert(key.into(), json!(lv));
        }
        (
            "modrinth.index.json".to_string(),
            json!({
                "formatVersion": 1,
                "game": "minecraft",
                "versionId": "1.0.0",
                "name": build.name,
                "summary": "Экспортировано из Aciron Launcher",
                "dependencies": Value::Object(deps),
                "files": index_files,
            }),
        )
    } else {
        (
            "aciron.pack.json".to_string(),
            acpack_manifest(&build, &remote_list),
        )
    };

    let finish = (|| -> Result<(), String> {
        zip.start_file(&manifest.0, opts).map_err(|e| e.to_string())?;
        zip.write_all(
            serde_json::to_string(&manifest.1)
                .map_err(|e| e.to_string())?
                .as_bytes(),
        )
        .map_err(|e| e.to_string())?;
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(e) = finish {

        let _ = std::fs::remove_file(&tmp_path);
        return Err(e);
    }

    let _ = std::fs::remove_file(&dest_path);
    std::fs::rename(&tmp_path, &dest_path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Не сохранить архив: {e}")
    })?;

    emit_op(&app, "export", "done", "Сборка экспортирована", 1, 1);

    std::fs::metadata(&dest_path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

fn acpack_manifest(b: &Build, remote: &[RemoteFile]) -> Value {
    json!({
        "format": PACK_FORMAT,
        "kind": "aciron-pack",
        "name": b.name,
        "mc_version": b.mc_version,
        "loader": b.loader,
        "loader_version": b.loader_version,
        "icon_url": b.icon_url,
        "source_id": b.source_id,
        "image": b.image,
        "banner": b.banner,
        "exported_by": format!("Aciron Launcher {}", env!("CARGO_PKG_VERSION")),
        "mods": b.mods,
        "remote": remote,
    })
}

struct MrHit {
    rel: String,
    size: u64,
    sha1: String,
    sha512: String,
    url: String,
    project_id: String,
    version_id: String,
    version_number: String,

    title: String,
}

fn modrinth_client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .ok()
}

fn download_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

async fn download_file(cl: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    if !url.starts_with("https://") {
        return Err("Ссылка не по https".into());
    }
    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    let tmp = {
        let mut s = path.as_os_str().to_os_string();
        s.push(".part");
        PathBuf::from(s)
    };
    let res: Result<(), String> = async {
        let resp = cl.get(url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status().as_u16()));
        }
        let mut stream = resp.bytes_stream();
        let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
        while let Some(chunk) = stream.next().await {
            file.write_all(&chunk.map_err(|e| e.to_string())?)
                .await
                .map_err(|e| e.to_string())?;
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

async fn modrinth_hits(app: &AppHandle, files: &[(String, PathBuf)]) -> Vec<MrHit> {
    let targets: Vec<&(String, PathBuf)> = files
        .iter()
        .filter(|(rel, _)| is_remote_candidate(rel))
        .collect();
    if targets.is_empty() {
        return Vec::new();
    }

    emit_op(
        app,
        "export",
        "modpack",
        "Ищем файлы на Modrinth",
        0,
        targets.len() as u64,
    );

    let mut by_hash: HashMap<String, (String, u64, String)> = HashMap::new();
    for (rel, path) in &targets {
        let Ok(bytes) = std::fs::read(path) else { continue };
        by_hash.insert(
            sha512_hex(&bytes),
            (rel.clone(), bytes.len() as u64, sha1_hex(&bytes)),
        );
    }
    if by_hash.is_empty() {
        return Vec::new();
    }

    let Some(cl) = modrinth_client() else { return Vec::new() };

    let hashes: Vec<&String> = by_hash.keys().collect();
    let resp: Value = match cl
        .post(format!("{API}/version_files"))
        .json(&json!({ "hashes": hashes, "algorithm": "sha512" }))
        .send()
        .await
    {
        Ok(r) => match r.json().await {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        },
        Err(_) => return Vec::new(),
    };

    let mut out: Vec<MrHit> = Vec::new();
    let Some(map) = resp.as_object() else {
        return out;
    };
    for (hash, version) in map {
        let Some((rel, size, sha1)) = by_hash.get(hash) else { continue };

        let url = version["files"]
            .as_array()
            .and_then(|arr| {
                arr.iter()
                    .find(|f| f["hashes"]["sha512"].as_str() == Some(hash.as_str()))
                    .or_else(|| arr.first())
            })
            .and_then(|f| f["url"].as_str())
            .unwrap_or_default()
            .to_string();
        if url.is_empty() {
            continue;
        }
        out.push(MrHit {
            rel: rel.clone(),
            size: *size,
            sha1: sha1.clone(),
            sha512: hash.clone(),
            url,
            project_id: version["project_id"].as_str().unwrap_or_default().to_string(),
            version_id: version["id"].as_str().unwrap_or_default().to_string(),
            version_number: version["version_number"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            title: String::new(),
        });
    }

    fill_modrinth_titles(&cl, &mut out).await;
    out
}

async fn fill_modrinth_titles(cl: &reqwest::Client, hits: &mut [MrHit]) {
    let mut ids: Vec<String> = hits
        .iter()
        .map(|h| h.project_id.clone())
        .filter(|s| !s.is_empty())
        .collect();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return;
    }
    let Ok(ids_json) = serde_json::to_string(&ids) else { return };
    let Ok(resp) = cl
        .get(format!("{API}/projects"))
        .query(&[("ids", ids_json)])
        .send()
        .await
    else {
        return;
    };
    let Ok(list) = resp.json::<Value>().await else { return };
    let Some(arr) = list.as_array() else { return };
    let titles: HashMap<&str, &str> = arr
        .iter()
        .filter_map(|p| Some((p["id"].as_str()?, p["title"].as_str()?)))
        .collect();
    for h in hits.iter_mut() {
        if let Some(t) = titles.get(h.project_id.as_str()) {
            h.title = (*t).to_string();
        }
    }
}

async fn resolve_remote(
    app: &AppHandle,
    files: &[(String, PathBuf)],
    build: &Build,
    hits: Vec<MrHit>,
) -> HashMap<String, RemoteFile> {
    let mut out: HashMap<String, RemoteFile> = HashMap::new();

    let icons: HashMap<&str, &str> = build
        .mods
        .iter()
        .map(|m| (m.filename.as_str(), m.icon_url.as_str()))
        .collect();

    for h in hits {
        let file_name = h.rel.rsplit('/').next().unwrap_or(&h.rel).to_string();
        out.insert(
            h.rel.clone(),
            RemoteFile {
                kind: kind_of(&h.rel).to_string(),
                icon_url: icons.get(file_name.as_str()).unwrap_or(&"").to_string(),
                name: if h.title.is_empty() { file_name } else { h.title },
                version: h.version_number,
                source: "modrinth".into(),
                project_id: h.project_id,
                version_id: h.version_id,
                url: h.url,
                size: h.size,
                sha1: h.sha1,
                sha512: h.sha512,
                path: h.rel,
            },
        );
    }

    let cf: HashMap<&str, &InstalledMod> = build
        .mods
        .iter()
        .filter(|m| m.project_id.starts_with("cf:"))
        .map(|m| (m.filename.as_str(), m))
        .collect();
    if cf.is_empty() {
        return out;
    }

    let pending: Vec<(String, &InstalledMod, String)> = files
        .iter()
        .filter(|(rel, _)| is_remote_candidate(rel) && !out.contains_key(rel))
        .filter_map(|(rel, path)| {
            let file_name = rel.rsplit('/').next().unwrap_or(rel);
            let m = *cf.get(file_name)?;
            let bytes = std::fs::read(path).ok()?;
            Some((rel.clone(), m, sha1_hex(&bytes)))
        })
        .collect();
    if pending.is_empty() {
        return out;
    }

    let Ok(cl) = crate::curseforge::client() else { return out };
    emit_op(
        app,
        "export",
        "modpack",
        "Ищем файлы на CurseForge",
        0,
        pending.len() as u64,
    );

    let mut done = 0u64;
    let total = pending.len() as u64;

    let mut names: HashMap<i64, String> = HashMap::new();
    for (rel, m, local_sha1) in pending {

        if crate::cancel::is_cancelled(CKEY) {
            return out;
        }
        done += 1;
        emit_op(app, "export", "modpack", "Ищем файлы на CurseForge", done, total);

        let Ok(mid) = m.project_id.trim_start_matches("cf:").parse::<i64>() else { continue };
        let Ok(info) = crate::curseforge::file_info(&cl, mid, &m.version_id).await else {
            continue;
        };

        if info.url.is_empty() {
            continue;
        }

        let local_name = rel.rsplit('/').next().unwrap_or(&rel);
        if !info.file_name.is_empty() && info.file_name != local_name {
            continue;
        }

        if info.sha1.is_empty() || !info.sha1.eq_ignore_ascii_case(&local_sha1) {
            continue;
        }

        let name = match names.get(&mid) {
            Some(n) => n.clone(),
            None => {
                let n = crate::curseforge::project_name(&cl, mid).await;
                names.insert(mid, n.clone());
                n
            }
        };

        out.insert(
            rel.clone(),
            RemoteFile {
                name: if name.is_empty() { m.name.clone() } else { name },
                version: info.display,
                source: "curseforge".into(),
                project_id: m.project_id.clone(),
                version_id: m.version_id.clone(),

                url: info.url,
                size: info.size,
                sha1: info.sha1,
                sha512: String::new(),
                kind: kind_of(&rel).to_string(),
                icon_url: m.icon_url.clone(),
                path: rel,
            },
        );
    }

    out
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

#[tauri::command]
pub async fn import_acpack(app: AppHandle, path: String) -> Result<ImportResult, String> {
    crate::cancel::reset(CKEY);
    let app2 = app.clone();
    let (mut build, remote) =
        tauri::async_runtime::spawn_blocking(move || unpack_acpack(&app2, &path))
            .await
            .map_err(|e| e.to_string())??;

    let missing = fetch_remote(&app, &mut build, &remote).await;

    if crate::cancel::is_cancelled(CKEY) {
        let _ = builds::delete_build(build.id.clone());
        return Err(crate::cancel::CANCELLED.to_string());
    }

    let bid = build.id.clone();
    build
        .mods
        .retain(|m| builds::content_dir(&bid, &m.kind).join(&m.filename).exists());

    builds::upsert_build(build.clone())?;
    emit_op(&app, "install", "done", "Сборка импортирована", 1, 1);
    Ok(ImportResult { build, missing })
}

fn unpack_acpack(app: &AppHandle, path: &str) -> Result<(Build, Vec<RemoteFile>), String> {
    emit_op(app, "install", "modpack", "Читаем файл сборки", 0, 1);

    let file = std::fs::File::open(path).map_err(|e| format!("Не открыть файл: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Это не архив .acpack")?;

    let manifest: Value = {
        let mut f = zip
            .by_name("aciron.pack.json")
            .map_err(|_| "В архиве нет aciron.pack.json — это не сборка Aciron")?;
        let mut s = String::new();
        f.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("Испорченный манифест: {e}"))?
    };

    let name = manifest["name"].as_str().unwrap_or("Импортированная сборка");
    let mc = manifest["mc_version"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("В архиве не указана версия Minecraft")?;
    let loader = manifest["loader"].as_str().unwrap_or("fabric");

    let mut build = builds::create_build(name.to_string(), mc.to_string(), loader.to_string())?;
    let dir = builds::build_dir(&build.id);

    let total = zip.len() as u64;
    for i in 0..zip.len() {
        if i % 16 == 0 {
            emit_op(app, "install", "modpack", "Распаковываем", i as u64, total);
        }
        let mut entry = match zip.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let ename = entry.name().to_string();
        let Some(rel) = ename.strip_prefix("overrides/") else { continue };
        let Some(dest) = safe_join(&dir, rel) else { continue };
        if let Some(p) = dest.parent() {
            std::fs::create_dir_all(p).map_err(|e| format!("Не создать файл: {rel} — {e}"))?;
        }

        let mut out =
            std::fs::File::create(&dest).map_err(|e| format!("Не создать файл: {rel} — {e}"))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Не распаковать файл: {rel} — {e}"))?;
    }

    let remote: Vec<RemoteFile> = manifest["remote"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| serde_json::from_value::<RemoteFile>(v.clone()).ok())
                .filter(|r| !r.path.is_empty() && safe_join(&dir, &r.path).is_some())
                .collect()
        })
        .unwrap_or_default();

    let mods: Vec<InstalledMod> = manifest["mods"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| serde_json::from_value::<InstalledMod>(v.clone()).ok())
                .filter(|m| {
                    builds::content_dir(&build.id, &m.kind).join(&m.filename).exists()
                        || remote
                            .iter()
                            .any(|r| r.path.rsplit('/').next() == Some(m.filename.as_str()))
                })
                .collect()
        })
        .unwrap_or_default();

    build.mods = mods;
    build.loader_version = manifest["loader_version"].as_str().unwrap_or("").to_string();
    build.icon_url = manifest["icon_url"].as_str().unwrap_or("").to_string();
    build.source_id = manifest["source_id"].as_str().unwrap_or("").to_string();

    for (field, value) in [
        ("image", manifest["image"].as_str().unwrap_or("")),
        ("banner", manifest["banner"].as_str().unwrap_or("")),
    ] {
        if value.is_empty() {
            continue;
        }
        let Some(p) = safe_join(&dir, value) else { continue };
        if !p.is_file() {
            continue;
        }
        if field == "image" {
            build.image = value.to_string();
        } else {
            build.banner = value.to_string();
        }
    }
    builds::upsert_build(build.clone())?;

    Ok((build, remote))
}

async fn fetch_remote(app: &AppHandle, build: &mut Build, remote: &[RemoteFile]) -> Vec<String> {
    use futures::StreamExt;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    if remote.is_empty() {
        return Vec::new();
    }
    let dir = builds::build_dir(&build.id);
    let total = remote.len() as u64;
    emit_op(app, "install", "modpack", "Скачиваем моды", 0, total);

    let (Ok(dl), Ok(api)) = (download_client(), crate::curseforge::client()) else {
        return remote.iter().map(|r| r.name.clone()).collect();
    };

    let done = Arc::new(AtomicU64::new(0));

    let owned: Vec<(usize, RemoteFile)> = remote.iter().cloned().enumerate().collect();
    let tasks = owned.into_iter().map(|(i, r)| {
        let dl = dl.clone();
        let api = api.clone();
        let dir = dir.clone();
        let app = app.clone();
        let done = done.clone();
        async move {
            let outcome = fetch_one(&dl, &api, &dir, &r).await;
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            emit_op(&app, "install", "modpack", "Скачиваем моды", n, total);
            (i, outcome)
        }
    });

    let mut results: Vec<(usize, Option<InstalledMod>)> = futures::stream::iter(tasks)
        .buffer_unordered(8)
        .collect()
        .await;
    results.sort_by_key(|(i, _)| *i);

    let mut missing = Vec::new();
    for (i, outcome) in results {
        match outcome {

            Some(m) => {
                if !build.mods.iter().any(|x| x.filename == m.filename) {
                    build.mods.push(m);
                }
            }
            None => missing.push(remote[i].name.clone()),
        }
    }
    missing
}

async fn fetch_one(
    dl: &reqwest::Client,
    api: &reqwest::Client,
    dir: &Path,
    r: &RemoteFile,
) -> Option<InstalledMod> {

    if crate::cancel::is_cancelled(CKEY) {
        return None;
    }
    let dest = safe_join(dir, &r.path)?;

    let mut ok = false;
    if !r.url.is_empty() {
        ok = download_file(dl, &r.url, &dest).await.is_ok();
    }
    if !ok && r.source == "curseforge" {
        let mid = r.project_id.trim_start_matches("cf:").parse::<i64>().ok()?;
        let info = crate::curseforge::file_info(api, mid, &r.version_id).await.ok()?;
        if info.url.is_empty() || info.url == r.url {
            return None;
        }
        ok = download_file(dl, &info.url, &dest).await.is_ok();
    }
    if !ok {
        return None;
    }

    if !hash_ok(&dest, r) {
        let _ = std::fs::remove_file(&dest);
        return None;
    }

    let filename = r.path.rsplit('/').next().unwrap_or(&r.path).to_string();
    Some(InstalledMod {
        project_id: r.project_id.clone(),
        version_id: r.version_id.clone(),
        name: r.name.clone(),
        filename,
        icon_url: r.icon_url.clone(),
        enabled: true,
        kind: if r.kind.is_empty() {
            kind_of(&r.path).to_string()
        } else {
            r.kind.clone()
        },
    })
}

fn hash_ok(path: &Path, r: &RemoteFile) -> bool {
    let Ok(bytes) = std::fs::read(path) else { return false };
    if bytes.is_empty() {
        return false;
    }
    if !r.sha512.is_empty() {
        return sha512_hex(&bytes).eq_ignore_ascii_case(&r.sha512);
    }
    if !r.sha1.is_empty() {
        return sha1_hex(&bytes).eq_ignore_ascii_case(&r.sha1);
    }
    let archive = r.path.ends_with(".jar") || r.path.ends_with(".zip");
    !archive || bytes.starts_with(b"PK")
}

fn argv_pack() -> &'static Mutex<Option<String>> {
    static S: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// Ищет в аргументах запуска путь к .acpack. Вызывается один раз при старте.
pub fn scan_argv() -> Option<String> {
    let found = std::env::args()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".acpack") && Path::new(a).is_file());
    if let (Some(p), Ok(mut g)) = (found.clone(), argv_pack().lock()) {
        *g = Some(p);
    }
    found
}

/// Файл-почтовый ящик: через него второй запуск передаёт путь уже работающему
/// лаунчеру. Полноценный IPC ради одной строки — перебор; файл в папке данных
/// делает то же самое и переживает любой порядок запуска.
pub fn inbox() -> PathBuf {
    crate::settings::launcher_root().join(".acpack-inbox")
}

/// Кладёт путь в ящик (вызывается вторым процессом перед выходом).
pub fn post_to_inbox(path: &str) {
    let p = inbox();
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&p, path);
}

/// Путь к сборке, которую просили открыть при запуске (и сразу забывает его).
#[tauri::command]
pub fn pending_pack() -> Option<String> {
    argv_pack().lock().ok().and_then(|mut g| g.take())
}

/// Следит за ящиком: если пришёл путь — сообщает окну событием `acpack-open`.
/// Опрос раз в секунду: событие редкое, а отдельный файловый наблюдатель ради
/// него тянул бы новую зависимость.
pub fn watch_inbox(app: AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let p = inbox();
        if !p.is_file() {
            continue;
        }
        let text = std::fs::read_to_string(&p).unwrap_or_default();
        let path = text.trim().to_string();
        // Ящик чистим ПОСЛЕ отправки: иначе при неудачной отправке путь пропал
        // бы навсегда, а повторить его нечем — файл-то уже удалён.
        if !path.is_empty() && Path::new(&path).is_file() {
            let _ = app.emit("acpack-open", path);
        }
        let _ = std::fs::remove_file(&p);
    });
}
