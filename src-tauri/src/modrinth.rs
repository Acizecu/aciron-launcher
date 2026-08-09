use crate::builds::{self, Build, InstalledMod};
use crate::launcher::emit_op;

fn emit(app: &tauri::AppHandle, stage: &str, message: &str, current: u64, total: u64) {
    emit_op(app, "install", stage, message, current, total);
}
use serde_json::{json, Value};
use sha2::{Digest, Sha512};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::AppHandle;

const API: &str = "https://api.modrinth.com/v2";

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

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent("AcironLauncher/0.1 (aciron.pro)")
                .connect_timeout(Duration::from_secs(8))
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|e| e.clone())
}

fn http() -> Result<reqwest::Client, String> {
    client().map(|c| c.clone())
}

#[tauri::command]
pub async fn modrinth_search(
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

    let ptype = if project_type.is_empty() {
        "mod".to_string()
    } else {
        project_type
    };

    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{ptype}")]];
    if !loader.is_empty() {
        facets.push(vec![format!("categories:{loader}")]);
    }
    if !game_version.is_empty() {
        facets.push(vec![format!("versions:{game_version}")]);
    }
    for c in categories.iter().filter(|c| !c.is_empty()) {
        facets.push(vec![format!("categories:{c}")]);
    }
    let facets_json = serde_json::to_string(&facets).unwrap_or_else(|_| "[]".into());

    let idx = if index.is_empty() { "relevance".to_string() } else { index };
    let offset_s = offset.to_string();
    let limit_s = limit.clamp(1, 100).to_string();

    let resp = cl
        .get(format!("{API}/search"))
        .query(&[
            ("query", query.as_str()),
            ("facets", facets_json.as_str()),
            ("index", idx.as_str()),
            ("limit", limit_s.as_str()),
            ("offset", offset_s.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth: {}", resp.status()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_categories() -> Result<Vec<String>, String> {
    let cl = http()?;
    let tags: Value = cl
        .get(format!("{API}/tag/category"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let mut cats: Vec<String> = tags
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|t| t["project_type"].as_str() == Some("mod"))

                .filter(|t| {
                    !matches!(
                        t["name"].as_str(),
                        Some("fabric") | Some("forge") | Some("neoforge") | Some("quilt")
                            | Some("liteloader") | Some("modloader") | Some("rift")
                            | Some("bukkit") | Some("bungeecord") | Some("paper")
                            | Some("purpur") | Some("spigot") | Some("sponge")
                            | Some("velocity") | Some("waterfall") | Some("datapack")
                            | Some("folia")
                    )
                })
                .filter_map(|t| t["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    cats.sort();
    cats.dedup();
    Ok(cats)
}

#[tauri::command]
pub async fn change_build_version(build_id: String, mc_version: String) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = build.loader.clone();
    let cl = http()?;

    for m in build.mods.iter_mut() {
        let dir = builds::content_dir(&build_id, &m.kind);

        if m.project_id.starts_with("local:")
            || m.project_id.starts_with("mrpack:")
            || m.project_id.starts_with("cf:")
        {
            continue;
        }
        let vloader: Option<&str> = if m.kind == "mod" { Some(loader.as_str()) } else { None };
        match best_version(&cl, &m.project_id, vloader, &mc_version).await? {
            Some(ver) => {
                let files = ver["files"].as_array().cloned().unwrap_or_default();
                let file = files
                    .iter()
                    .find(|f| f["primary"].as_bool() == Some(true))
                    .or_else(|| files.first());
                if let Some(f) = file {
                    let url = f["url"].as_str().unwrap_or("");
                    let filename = f["filename"].as_str().unwrap_or("mod.jar").to_string();

                    let _ = std::fs::remove_file(dir.join(&m.filename));
                    download_to(&cl, url, &dir.join(&filename)).await?;
                    m.filename = filename;
                    m.version_id = ver["id"].as_str().unwrap_or("").to_string();
                    m.enabled = true;
                }
            }
            None => {

                if m.enabled {
                    let disabled = format!("{}.disabled", m.filename);
                    let _ = std::fs::rename(dir.join(&m.filename), dir.join(&disabled));
                    m.filename = disabled;
                    m.enabled = false;
                }
            }
        }
    }

    build.mc_version = mc_version;
    builds::upsert_build(build.clone())?;
    Ok(build)
}

#[tauri::command]
pub async fn install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    // Обёртка: любая ошибка (кроме отмены) шлёт "error", иначе орб установки завис
    // бы на «Подготовка…» без сигнала о сбое. Отмену ошибкой не считаем.
    let res = install_modpack_inner(app.clone(), project_id, version_id).await;
    if let Err(e) = &res {
        if e != crate::cancel::CANCELLED {
            emit(&app, "error", e, 0, 1);
        }
    }
    res
}

async fn install_modpack_inner(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    let cl = http()?;

    let ver: Value = match version_id.as_deref().filter(|s| !s.is_empty()) {
        Some(vid) => cl
            .get(format!("{API}/version/{vid}"))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?,
        None => {
            let versions: Value = cl
                .get(format!("{API}/project/{project_id}/version"))
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json()
                .await
                .map_err(|e| e.to_string())?;
            versions
                .as_array()
                .and_then(|a| a.first())
                .cloned()
                .ok_or("У модпака нет версий")?
        }
    };
    let files = ver["files"].as_array().cloned().unwrap_or_default();
    let file = files
        .iter()
        .find(|f| f["primary"].as_bool() == Some(true))
        .or_else(|| files.first())
        .ok_or("У модпака нет файла .mrpack")?;
    let url = file["url"].as_str().ok_or("Нет ссылки на .mrpack")?;

    emit(&app, "modpack", "Скачивание модпака", 0, 1);
    let bytes = cl
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?
        .to_vec();

    build_from_mrpack(&app, &cl, bytes, &project_id).await
}

#[tauri::command]
pub async fn import_mrpack(app: AppHandle, path: String) -> Result<Build, String> {
    let res = import_mrpack_inner(app.clone(), path).await;
    if let Err(e) = &res {
        if e != crate::cancel::CANCELLED {
            emit(&app, "error", e, 0, 1);
        }
    }
    res
}

async fn import_mrpack_inner(app: AppHandle, path: String) -> Result<Build, String> {
    let cl = http()?;
    emit(&app, "modpack", "Чтение файла модпака", 0, 1);
    let bytes = std::fs::read(&path).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    build_from_mrpack(&app, &cl, bytes, "").await
}

async fn build_from_mrpack(
    app: &AppHandle,
    cl: &reqwest::Client,
    bytes: Vec<u8>,
    source_id: &str,
) -> Result<Build, String> {

    let (build_id, build_dir, files_list) = {
        let reader = std::io::Cursor::new(bytes);
        let mut zip = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;

        let index_txt = {
            let mut f = zip
                .by_name("modrinth.index.json")
                .map_err(|_| "modrinth.index.json не найден в .mrpack")?;
            let mut s = String::new();
            std::io::Read::read_to_string(&mut f, &mut s).map_err(|e| e.to_string())?;
            s
        };
        let index: Value = serde_json::from_str(&index_txt).map_err(|e| e.to_string())?;
        let deps = &index["dependencies"];
        let mc = deps["minecraft"]
            .as_str()
            .ok_or("В модпаке не указана версия Minecraft")?
            .to_string();
        let loader = if deps.get("fabric-loader").is_some() {
            "fabric"
        } else if deps.get("quilt-loader").is_some() {
            "quilt"
        } else if deps.get("neoforge").is_some() {
            "neoforge"
        } else if deps.get("forge").is_some() {
            "forge"
        } else {
            "fabric"
        };
        let name = index["name"].as_str().unwrap_or("Модпак").to_string();

        let build = builds::create_build(name, mc, loader.to_string())?;
        let dir = builds::build_dir(&build.id);

        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            if entry.is_dir() {
                continue;
            }
            let ename = entry.name().to_string();
            let rel = ename
                .strip_prefix("overrides/")
                .or_else(|| ename.strip_prefix("client-overrides/"));
            if let Some(rel) = rel {

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

        let files_list = index["files"].as_array().cloned().unwrap_or_default();
        (build.id, dir, files_list)
    };

    let total = files_list.len() as u64;
    let ckey = "legacy";
    crate::cancel::reset(ckey);

    // B1: раньше файлы модпака качались строго по одному (последовательный
    // `for` + `download_cancelable(...).await`), из-за чего сетевые RTT не
    // перекрывались и установка большого модпака шла суммой латентностей.
    // Теперь качаем через buffer_unordered(8) — тот же приём, что уже принят
    // в check_build_updates (buffer_unordered(8)) и в launcher.rs (ассеты
    // buffer_unordered(16)). Семантику сохраняем 1-в-1:
    //  * порядок mods_entries восстанавливаем по исходному индексу (сортировкой),
    //    поэтому build.mods не зависит от порядка завершения задач;
    //  * отмена проверяется до старта каждой задачи И внутри download_cancelable
    //    (на каждый chunk) — как и было; при отмене удаляем сборку и возвращаем
    //    CANCELLED;
    //  * ошибка загрузки БЕЗ отмены по-прежнему игнорируется (файл пропускается,
    //    но mods/-запись всё равно добавляется — как в исходном коде);
    //  * прогресс считаем атомарно (AtomicU64 fetch_add), эмитим порционно,
    //    финальный emit гарантирует total == total.
    // Мы завели свежий локальный ckey-механизм не трогая (общий ключ "legacy"
    // сохранён), т.к. cancel.rs потокобезопасен (Mutex<HashSet>).
    use futures::StreamExt;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::Arc;

    let done = Arc::new(AtomicU64::new(0));
    // Признак отмены, замеченной внутри какой-либо задачи — чтобы после
    // завершения стрима принять то же решение (delete_build + CANCELLED),
    // что и раньше при раннем return.
    let cancelled = Arc::new(AtomicBool::new(false));

    // Сначала полностью вытаскиваем owned-данные из files_list (borrow &Value
    // заканчивается здесь). Это обязательно: если мапить прямо по
    // files_list.iter().enumerate(), замыкание получает аргумент
    // (usize, &serde_json::Value), и futures::stream::iter(..).buffer_unordered
    // требует от этого замыкания HRTB-обобщённости по времени жизни borrow'а,

    let prepared: Vec<(bool, String, Option<String>)> = files_list
        .iter()
        .map(|f| {
            let unsupported = f["env"]["client"].as_str() == Some("unsupported");
            let path = f["path"].as_str().unwrap_or("").to_string();
            let dl = f["downloads"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());
            (unsupported, path, dl)
        })
        .collect();

    let tasks = prepared.into_iter().enumerate().map(|(i, (unsupported, path, dl))| {

        let cl = (*cl).clone();
        let build_dir = build_dir.clone();

        let app = (*app).clone();
        let done = done.clone();
        let cancelled = cancelled.clone();
        async move {

            if crate::cancel::is_cancelled(ckey) {
                cancelled.store(true, Ordering::Relaxed);
                return None;
            }
            if unsupported {
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                if n % 10 == 0 || n == total {
                    emit(&app, "modpack", "Загрузка модпака", n, total);
                }
                return None;
            }
            if path.is_empty() {
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                if n % 10 == 0 || n == total {
                    emit(&app, "modpack", "Загрузка модпака", n, total);
                }
                return None;
            }
            let mut entry: Option<InstalledMod> = None;
            if let Some(dl) = dl {
                let dest = match safe_join(&build_dir, &path) {
                    Some(d) => d,

                    None => return None,
                };
                if download_cancelable(&cl, &dl, &dest, ckey).await.is_err()
                    && crate::cancel::is_cancelled(ckey)
                {
                    cancelled.store(true, Ordering::Relaxed);
                    return None;
                }
                if path.starts_with("mods/") {
                    let filename = Path::new(&path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&path)
                        .to_string();
                    let name = filename.trim_end_matches(".jar").to_string();
                    entry = Some(InstalledMod {
                        project_id: format!("mrpack:{filename}"),
                        version_id: String::new(),
                        name,
                        filename,
                        icon_url: String::new(),
                        enabled: true,
                        kind: "mod".into(),
                    });
                }
            }
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            if n % 10 == 0 || n == total {
                emit(&app, "modpack", "Загрузка модпака", n, total);
            }
            entry.map(|m| (i, m))
        }
    });

    let results: Vec<Option<(usize, InstalledMod)>> =
        futures::stream::iter(tasks).buffer_unordered(8).collect().await;

    if cancelled.load(Ordering::Relaxed) {
        let _ = builds::delete_build(build_id.clone());
        return Err(crate::cancel::CANCELLED.into());
    }

    if total > 0 {
        emit(app, "modpack", "Загрузка модпака", total, total);
    }

    let mut collected: Vec<(usize, InstalledMod)> = results.into_iter().flatten().collect();
    collected.sort_by_key(|(i, _)| *i);
    let mods_entries: Vec<InstalledMod> = collected.into_iter().map(|(_, m)| m).collect();

    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    build.mods = mods_entries;
    if !source_id.is_empty() {
        build.source_id = source_id.to_string();

        let (_title, icon) = project_title(cl, source_id).await;
        if !icon.is_empty() {
            build.icon_url = icon.clone();
            let ext = icon
                .rsplit('.')
                .next()
                .filter(|e| matches!(*e, "png" | "jpg" | "jpeg" | "webp" | "gif"))
                .unwrap_or("png")
                .to_string();
            let filename = format!("cover.{ext}");
            let dest = build_dir.join(&filename);
            if download_to(cl, &icon, &dest).await.is_ok() {
                build.image = filename;
            }
        }
    }

    let _ = enrich_local_mods(cl, &mut build, &build_id).await;

    builds::upsert_build(build.clone())?;
    emit(app, "done", "Модпак установлен", 1, 1);
    Ok(build)
}

#[tauri::command]
pub async fn modrinth_project(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let resp = cl
        .get(format!("{API}/project/{project_id}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth: {}", resp.status()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

async fn enrich_local_mods(
    cl: &reqwest::Client,
    build: &mut Build,
    build_id: &str,
) -> Result<bool, String> {

    let mut targets: Vec<(usize, String)> = Vec::new();
    for (i, m) in build.mods.iter().enumerate() {
        if !(m.project_id.starts_with("local:") || m.project_id.starts_with("mrpack:")) {
            continue;
        }
        let path = builds::content_dir(build_id, &m.kind).join(&m.filename);
        if let Ok(bytes) = std::fs::read(&path) {
            targets.push((i, format!("{:x}", Sha512::digest(&bytes))));
        }
    }
    if targets.is_empty() {
        return Ok(false);
    }

    let hashes: Vec<&str> = targets.iter().map(|(_, h)| h.as_str()).collect();
    let resp: Value = cl
        .post(format!("{API}/version_files"))
        .json(&json!({ "hashes": hashes, "algorithm": "sha512" }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let mut changed = false;
    for (i, h) in &targets {
        let ver = match resp.get(h) {
            Some(v) if v.is_object() => v,
            _ => continue,
        };
        let pid = ver["project_id"].as_str().unwrap_or("").to_string();
        if pid.is_empty() {
            continue;
        }
        let vid = ver["id"].as_str().unwrap_or("").to_string();
        let (title, icon) = project_title(cl, &pid).await;
        let m = &mut build.mods[*i];
        m.project_id = pid;
        m.version_id = vid;
        m.name = title;
        m.icon_url = icon;
        changed = true;
    }
    Ok(changed)
}

#[tauri::command]
pub async fn match_local_mods(build_id: String) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let cl = http()?;
    if enrich_local_mods(&cl, &mut build, &build_id).await? {
        builds::upsert_build(build.clone())?;
    }
    Ok(build)
}

async fn download_to(cl: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    download_cancelable(cl, url, path, "").await
}

async fn download_cancelable(
    cl: &reqwest::Client,
    url: &str,
    path: &Path,
    cancel_key: &str,
) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    let resp = cl.get(url).send().await.map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(path).await.map_err(|e| e.to_string())?;

    while let Some(chunk) = stream.next().await {
        if !cancel_key.is_empty() && crate::cancel::is_cancelled(cancel_key) {
            drop(stream);
            drop(file);
            let _ = tokio::fs::remove_file(path).await;
            return Err(crate::cancel::CANCELLED.into());
        }
        let bytes = chunk.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())
}

async fn best_version(
    cl: &reqwest::Client,
    project_id: &str,
    loader: Option<&str>,
    mc_version: &str,
) -> Result<Option<Value>, String> {
    let gvs = json!([mc_version]).to_string();
    let mut req = cl
        .get(format!("{API}/project/{project_id}/version"))
        .query(&[("game_versions", gvs.as_str())]);
    let loaders;
    if let Some(l) = loader {
        loaders = json!([l]).to_string();
        req = req.query(&[("loaders", loaders.as_str())]);
    }
    let versions: Value = req
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(versions.as_array().and_then(|a| a.first().cloned()))
}

#[tauri::command]
pub async fn check_build_updates(build_id: String) -> Result<Vec<String>, String> {
    use futures::StreamExt;

    let build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let cl = http()?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();

    let mut targets: Vec<(String, String, bool)> = Vec::new();
    for m in &build.mods {
        let pid = m.project_id.as_str();
        if pid.starts_with("local:") || pid.starts_with("mrpack:") || pid.starts_with("cf:") {
            continue;
        }
        targets.push((m.project_id.clone(), m.version_id.clone(), m.kind == "mod"));
    }

    let tasks = targets.into_iter().map(|(pid, installed, is_mod)| {
        let cl = cl.clone();
        let loader = loader.clone();
        let mc = mc.clone();
        async move {
            let filter = if is_mod { Some(loader.as_str()) } else { None };
            match best_version(&cl, &pid, filter, &mc).await {
                Ok(Some(v)) => {
                    let latest = v["id"].as_str().unwrap_or_default();
                    (!latest.is_empty() && latest != installed).then_some(pid)
                }
                _ => None,
            }
        }
    });

    let found: Vec<Option<String>> = futures::stream::iter(tasks).buffer_unordered(8).collect().await;
    Ok(found.into_iter().flatten().collect())
}

async fn project_kind(cl: &reqwest::Client, project_id: &str) -> String {
    let t = cl
        .get(format!("{API}/project/{project_id}"))
        .send()
        .await
        .ok()
        .and_then(|r| r.error_for_status().ok());
    if let Some(r) = t {
        let p: Value = r.json().await.unwrap_or(Value::Null);
        match p["project_type"].as_str() {
            Some("resourcepack") => return "resourcepack".into(),
            Some("shader") => return "shader".into(),
            _ => {}
        }
    }
    "mod".into()
}

async fn project_title(cl: &reqwest::Client, project_id: &str) -> (String, String) {
    match cl
        .get(format!("{API}/project/{project_id}"))
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => {
            let p: Value = r.json().await.unwrap_or(Value::Null);
            (
                p["title"].as_str().unwrap_or(project_id).to_string(),
                p["icon_url"].as_str().unwrap_or("").to_string(),
            )
        }
        Err(_) => (project_id.to_string(), String::new()),
    }
}

#[tauri::command]
pub async fn modrinth_install(build_id: String, project_id: String) -> Result<Build, String> {
    let build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let ckey = format!("mod:{project_id}");
    crate::cancel::reset(&ckey);

    let kind = project_kind(&cl, &project_id).await;
    let is_mod = kind == "mod";
    let dir = builds::content_dir(&build_id, &kind);
    let loader_filter: Option<&str> = if is_mod { Some(loader.as_str()) } else { None };

    let mut seen: HashSet<String> = build.mods.iter().map(|m| m.project_id.clone()).collect();
    let mut queue: Vec<(String, bool)> = vec![(project_id.clone(), true)];

    let mut added: Vec<InstalledMod> = Vec::new();

    while let Some((pid, is_root)) = queue.pop() {
        if seen.contains(&pid) {
            continue;
        }
        seen.insert(pid.clone());

        let vloader = if is_root { loader_filter } else { Some(loader.as_str()) };
        let ver = match best_version(&cl, &pid, vloader, &mc).await? {
            Some(v) => v,
            None => {
                if is_root {
                    return Err(match kind.as_str() {
                        "resourcepack" => format!(
                            "Ресурспак не подходит этой сборке. Выберите другую версию: {mc}"
                        ),
                        "shader" => {
                            format!("Шейдер не подходит этой сборке. Выберите другую версию: {mc}")
                        }
                        _ => format!(
                            "Мод не подходит этой сборке. Выберите другую версию: {mc} · {loader}"
                        ),
                    });
                }

                continue;
            }
        };

        let files = ver["files"].as_array().cloned().unwrap_or_default();
        let file = files
            .iter()
            .find(|f| f["primary"].as_bool() == Some(true))
            .or_else(|| files.first());
        let (url, filename) = match file {
            Some(f) => (
                f["url"].as_str().unwrap_or("").to_string(),
                f["filename"].as_str().unwrap_or("file.jar").to_string(),
            ),
            None => {
                if is_root {
                    return Err("Нет файла для скачивания".into());
                }
                continue;
            }
        };

        let dest_dir = if is_root { dir.clone() } else { builds::mods_dir(&build_id) };
        if crate::cancel::is_cancelled(&ckey) {
            return Err(crate::cancel::CANCELLED.into());
        }
        download_cancelable(&cl, &url, &dest_dir.join(&filename), &ckey).await?;

        let version_id = ver["id"].as_str().unwrap_or("").to_string();
        let (title, icon) = project_title(&cl, &pid).await;
        added.push(InstalledMod {
            project_id: pid.clone(),
            version_id,
            name: title,
            filename,
            icon_url: icon,
            enabled: true,
            kind: if is_root { kind.clone() } else { "mod".into() },
        });

        if is_mod {
            if let Some(deps) = ver["dependencies"].as_array() {
                for d in deps {
                    if d["dependency_type"].as_str() == Some("required") {
                        if let Some(dep_pid) = d["project_id"].as_str() {
                            if !seen.contains(dep_pid) {
                                queue.push((dep_pid.to_string(), false));
                            }
                        }
                    }
                }
            }
        }
    }

    builds::add_installed(&build_id, added)
}

#[tauri::command]
pub async fn project_versions(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let resp = cl
        .get(format!("{API}/project/{project_id}/version"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth: {}", resp.status()));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_install_version(
    build_id: String,
    project_id: String,
    version_id: String,
) -> Result<Build, String> {
    let build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let kind = project_kind(&cl, &project_id).await;
    let is_mod = kind == "mod";
    let dir = builds::content_dir(&build_id, &kind);

    let ver: Value = cl
        .get(format!("{API}/version/{version_id}"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let files = ver["files"].as_array().cloned().unwrap_or_default();
    let file = files
        .iter()
        .find(|f| f["primary"].as_bool() == Some(true))
        .or_else(|| files.first())
        .ok_or("Нет файла для скачивания")?;
    let url = file["url"].as_str().unwrap_or("").to_string();
    let filename = file["filename"].as_str().unwrap_or("file.jar").to_string();

    if let Some(old) = build.mods.iter().find(|m| m.project_id == project_id) {
        let _ = std::fs::remove_file(builds::content_dir(&build_id, &old.kind).join(&old.filename));
    }

    let mut added: Vec<InstalledMod> = Vec::new();

    download_to(&cl, &url, &dir.join(&filename)).await?;
    let (title, icon) = project_title(&cl, &project_id).await;
    added.push(InstalledMod {
        project_id: project_id.clone(),
        version_id: version_id.clone(),
        name: title,
        filename,
        icon_url: icon,
        enabled: true,
        kind: kind.clone(),
    });

    if is_mod {

        let mut seen: HashSet<String> = build
            .mods
            .iter()
            .chain(added.iter())
            .map(|m| m.project_id.clone())
            .collect();
        let mut queue: Vec<String> = Vec::new();
        if let Some(deps) = ver["dependencies"].as_array() {
            for d in deps {
                if d["dependency_type"].as_str() == Some("required") {
                    if let Some(p) = d["project_id"].as_str() {
                        queue.push(p.to_string());
                    }
                }
            }
        }
        while let Some(pid) = queue.pop() {
            if seen.contains(&pid) {
                continue;
            }
            seen.insert(pid.clone());
            if let Some(v) = best_version(&cl, &pid, Some(loader.as_str()), &mc).await? {
                let dfiles = v["files"].as_array().cloned().unwrap_or_default();
                if let Some(f) = dfiles
                    .iter()
                    .find(|f| f["primary"].as_bool() == Some(true))
                    .or_else(|| dfiles.first())
                {
                    let durl = f["url"].as_str().unwrap_or("").to_string();
                    let dname = f["filename"].as_str().unwrap_or("mod.jar").to_string();
                    download_to(&cl, &durl, &builds::mods_dir(&build_id).join(&dname)).await?;
                    let (t, ic) = project_title(&cl, &pid).await;
                    added.push(InstalledMod {
                        project_id: pid.clone(),
                        version_id: v["id"].as_str().unwrap_or("").to_string(),
                        name: t,
                        filename: dname,
                        icon_url: ic,
                        enabled: true,
                        kind: "mod".into(),
                    });
                    if let Some(ds) = v["dependencies"].as_array() {
                        for d in ds {
                            if d["dependency_type"].as_str() == Some("required") {
                                if let Some(p) = d["project_id"].as_str() {
                                    if !seen.contains(p) {
                                        queue.push(p.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    builds::add_installed(&build_id, added)
}
