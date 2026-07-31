use crate::builds::{self, Build, InstalledMod};
use crate::launcher::emit;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
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

// Безопасное соединение относительного пути с базовой директорией: отклоняем
// любые компоненты, выходящие за пределы базы (защита от zip-slip / path traversal).
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
        .default_headers(proxy_headers())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
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

/// modLoaderType CurseForge по ядру сборки. 0 = любой.
fn loader_type(loader: &str) -> i64 {
    match loader {
        "forge" => 1,
        "fabric" => 4,
        "quilt" => 5,
        "neoforge" => 6,
        _ => 0,
    }
}

/// sortField CurseForge по режиму сортировки фронта. None = релевантность (по умолчанию).
fn sort_field(index: &str) -> Option<i64> {
    match index {
        "downloads" => Some(6), // TotalDownloads
        "follows" => Some(2),   // Popularity
        "newest" | "updated" => Some(3), // LastUpdated
        _ => None,              // relevance
    }
}

/// Убираем "cf:"-префикс, которым помечены проекты CurseForge во фронте.
fn strip_id(project_id: &str) -> &str {
    project_id.strip_prefix("cf:").unwrap_or(project_id)
}

async fn get_json(cl: &reqwest::Client, url: &str) -> Result<Value, String> {
    get_query(cl, url, &[]).await
}

/// GET с query-параметрами (reqwest сам кодирует значения).
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

/// Поиск контента на CurseForge. Возвращает форму ModSearch ({hits,total_hits,...}),
/// как у Modrinth, — фронт не отличает источники.
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
    // Ядро применимо только к модам; для ресурспаков/шейдеров CF его игнорирует.
    if cid == 6 {
        let lt = loader_type(&loader);
        if lt != 0 {
            params.push(("modLoaderType", lt.to_string()));
        }
    }
    if let Some(sf) = sort_field(&index) {
        params.push(("sortField", sf.to_string()));
    }
    // Категории у CF задаются id, а фронт передаёт имена — переводим через справочник.
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
    // CF ограничивает пагинацию 10000 позициями — не даём фронту уехать дальше.
    let total = json["pagination"]["totalCount"].as_u64().unwrap_or(0).min(10_000);

    Ok(json!({
        "hits": hits,
        "total_hits": total,
        "offset": offset,
        "limit": limit,
    }))
}

/// Справочник «имя категории → id» для нужного classId.
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

/// Список категорий модов CurseForge (имена, для фильтров UI).
#[tauri::command]
pub async fn curseforge_categories() -> Result<Vec<String>, String> {
    let cl = http()?;
    let map = category_map(&cl, 6).await?;
    let mut names: Vec<String> = map.into_keys().collect();
    names.sort();
    Ok(names)
}

/// Приводит объект мода CurseForge к форме ModHit.
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

/// Полная инфо-страница проекта CurseForge в форме ModProject.
#[tauri::command]
pub async fn curseforge_project(project_id: String) -> Result<Value, String> {
    let cl = http()?;
    let id = strip_id(&project_id);
    let json = get_json(&cl, &format!("{}/v1/mods/{id}", base())).await?;
    let m = &json["data"];
    let links = &m["links"];
    let gallery: Vec<Value> = m["screenshots"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s["url"].as_str())
                .map(|u| json!({ "url": u }))
                .collect()
        })
        .unwrap_or_default();

    Ok(json!({
        "title": m["name"].as_str().unwrap_or(""),
        "slug": m["slug"].as_str().unwrap_or(""),
        "description": m["summary"].as_str().unwrap_or(""),
        "body": "",
        "categories": m["categories"].as_array().map(|a| {
            a.iter().filter_map(|c| c["name"].as_str().map(|s| s.to_string())).collect::<Vec<_>>()
        }).unwrap_or_default(),
        "downloads": m["downloadCount"].as_u64().unwrap_or(0),
        "followers": m["thumbsUpCount"].as_u64().unwrap_or(0),
        "icon_url": m["logo"]["url"].as_str().unwrap_or(""),
        "gallery": gallery,
        "source_url": links["sourceUrl"].as_str().filter(|s| !s.is_empty()),
        "issues_url": links["issuesUrl"].as_str().filter(|s| !s.is_empty()),
        "wiki_url": links["wikiUrl"].as_str().filter(|s| !s.is_empty()),
        "discord_url": Value::Null,
        // websiteUrl нужен фронту для внешней ссылки на страницу CurseForge.
        "website_url": links["websiteUrl"].as_str().unwrap_or(""),
    }))
}

/// Актуальные версии-лоадеры Minecraft (для отделения версий игры от ядер в файлах).
fn is_loader_tag(s: &str) -> bool {
    matches!(
        s.to_ascii_lowercase().as_str(),
        "forge" | "fabric" | "quilt" | "neoforge" | "liteloader" | "rift" | "cauldron"
            | "client" | "server"
    )
}

/// Приводит файл CurseForge к форме ModVersion.
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

/// Все версии (файлы) проекта CurseForge в форме ModVersion[].
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

/// Ссылка на скачивание файла: сначала downloadUrl, иначе отдельный download-url эндпоинт.
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
        // Автор мода запретил скачивание через API — честно об этом говорим.
        .ok_or_else(|| "Автор запретил загрузку этого файла через сторонние лаунчеры".to_string())
}

/// Инфо о моде: имя, иконка, classId (для определения типа контента).
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

/// Лучший файл мода под версию игры (и ядро — для модов). Первый в отсортированном по дате списке.
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

/// Обязательные зависимости (relationType == 3) файла.
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

/// Устанавливает проект CurseForge в сборку (последняя совместимая версия + зависимости).
#[tauri::command]
pub async fn curseforge_install(build_id: String, project_id: String) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let root_id: i64 = strip_id(&project_id).parse().map_err(|_| "Неверный id CurseForge")?;
    let (_n, _i, root_class) = mod_info(&cl, root_id).await;
    let kind = kind_of_class(root_class).to_string();
    let is_mod = kind == "mod";

    let mut seen: HashSet<i64> = build
        .mods
        .iter()
        .filter_map(|m| strip_id(&m.project_id).parse::<i64>().ok())
        .collect();
    // (modId, is_root)
    let mut queue: Vec<(i64, bool)> = vec![(root_id, true)];

    while let Some((mid, is_root)) = queue.pop() {
        if seen.contains(&mid) {
            continue;
        }
        seen.insert(mid);

        // Корень ставим по своему типу, зависимости — всегда моды под ядро сборки.
        let file_loader = if is_root && !is_mod { None } else { Some(loader.as_str()) };
        let file = match best_file(&cl, mid, file_loader, &mc).await? {
            Some(f) => f,
            None => {
                if is_root {
                    let what = match kind.as_str() {
                        "resourcepack" => format!("Ресурспак не поддерживает {mc}."),
                        "shader" => format!("Шейдер не поддерживает {mc}."),
                        _ => format!("Мод не поддерживает {mc} · {loader}."),
                    };
                    return Err(format!("{what} Выберите другой или версию сборки."));
                }
                continue; // несовместимую зависимость пропускаем
            }
        };

        let filename = file["fileName"].as_str().unwrap_or("file.jar").to_string();
        let url = file_download_url(&cl, mid, &file).await?;
        let dest_dir = if is_root {
            builds::content_dir(&build_id, &kind)
        } else {
            builds::mods_dir(&build_id)
        };
        download_to(&cl, &url, &dest_dir.join(&filename)).await?;

        let (title, icon, _c) = mod_info(&cl, mid).await;
        build.mods.push(InstalledMod {
            project_id: format!("cf:{mid}"),
            version_id: file["id"].as_i64().unwrap_or_default().to_string(),
            name: title,
            filename,
            icon_url: icon,
            enabled: true,
            kind: if is_root { kind.clone() } else { "mod".into() },
        });

        // Зависимости тянем только для модов.
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

/// Устанавливает КОНКРЕТНУЮ версию (файл) проекта CurseForge (вкладка «Версии»).
#[tauri::command]
pub async fn curseforge_install_version(
    build_id: String,
    project_id: String,
    version_id: String,
) -> Result<Build, String> {
    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    let loader = build.loader.clone();
    let mc = build.mc_version.clone();
    let cl = http()?;

    let mid: i64 = strip_id(&project_id).parse().map_err(|_| "Неверный id CurseForge")?;
    let (title, icon, root_class) = mod_info(&cl, mid).await;
    let kind = kind_of_class(root_class).to_string();
    let is_mod = kind == "mod";

    let file = get_json(&cl, &format!("{}/v1/mods/{mid}/files/{version_id}", base()))
        .await?["data"]
        .clone();
    if file.is_null() {
        return Err("Файл не найден".into());
    }
    let filename = file["fileName"].as_str().unwrap_or("file.jar").to_string();
    let url = file_download_url(&cl, mid, &file).await?;

    // Убираем прежнюю версию этого проекта (файл + запись).
    let pid = format!("cf:{mid}");
    if let Some(old) = build.mods.iter().find(|m| m.project_id == pid) {
        let _ = std::fs::remove_file(builds::content_dir(&build_id, &old.kind).join(&old.filename));
    }
    build.mods.retain(|m| m.project_id != pid);

    download_to(&cl, &url, &builds::content_dir(&build_id, &kind).join(&filename)).await?;
    build.mods.push(InstalledMod {
        project_id: pid,
        version_id: version_id.clone(),
        name: title,
        filename,
        icon_url: icon,
        enabled: true,
        kind: kind.clone(),
    });

    // Обязательные зависимости (только для модов) — лучшая версия под сборку.
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
                let fname = f["fileName"].as_str().unwrap_or("mod.jar").to_string();
                let durl = match file_download_url(&cl, mid, &f).await {
                    Ok(u) => u,
                    Err(_) => continue,
                };
                download_to(&cl, &durl, &builds::mods_dir(&build_id).join(&fname)).await?;
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

/// Устанавливает модпак CurseForge в новую сборку: качает .zip, разбирает manifest.json,
/// создаёт сборку, распаковывает overrides и качает все моды по projectID/fileID.
#[tauri::command]
pub async fn curseforge_install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    let cl = http()?;
    let mid: i64 = strip_id(&project_id).parse().map_err(|_| "Неверный id CurseForge")?;

    // Файл модпака: выбранная версия или последняя.
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
                .ok_or("У модпака нет файлов")?
        }
    };

    emit(&app, "modpack", "Скачивание модпака", 0, 1);
    let url = file_download_url(&cl, mid, &file).await?;
    let bytes = cl
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    // --- синхронно: разбор zip, создание сборки, распаковка overrides ---
    let (build_id, build_dir, files_list) = {
        let reader = std::io::Cursor::new(bytes.to_vec());
        let mut zip = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;

        let manifest_txt = {
            let mut f = zip
                .by_name("manifest.json")
                .map_err(|_| "manifest.json не найден в модпаке")?;
            let mut s = String::new();
            f.read_to_string(&mut s).map_err(|e| e.to_string())?;
            s
        };
        let manifest: Value = serde_json::from_str(&manifest_txt).map_err(|e| e.to_string())?;
        let mc = manifest["minecraft"]["version"]
            .as_str()
            .ok_or("В модпаке не указана версия Minecraft")?
            .to_string();
        // Ядро — из primary-загрузчика ("forge-47.2.0" → forge).
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
        let name = manifest["name"].as_str().unwrap_or("Модпак CurseForge").to_string();
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
                // Защита от zip-slip: пропускаем записи, выходящие за пределы сборки.
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
        (build.id, dir, files_list)
    };

    // --- асинхронно: качаем моды по projectID/fileID ---
    let total = files_list.len() as u64;
    let mut mods_entries: Vec<InstalledMod> = Vec::new();
    for (i, f) in files_list.iter().enumerate() {
        let pid = f["projectID"].as_i64().unwrap_or(0);
        let fid = f["fileID"].as_i64().unwrap_or(0);
        if pid != 0 && fid != 0 {
            if let Ok(fj) = get_json(&cl, &format!("{}/v1/mods/{pid}/files/{fid}", base())).await {
                let dl_file = &fj["data"];
                if let Ok(durl) = file_download_url(&cl, pid, dl_file).await {
                    let filename = dl_file["fileName"].as_str().unwrap_or("mod.jar").to_string();
                    let dest = builds::mods_dir(&build_id).join(&filename);
                    if download_to(&cl, &durl, &dest).await.is_ok() {
                        mods_entries.push(InstalledMod {
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
        emit(&app, "modpack", "Загрузка модпака", (i + 1) as u64, total);
    }

    let mut build = builds::get_build(&build_id).ok_or("Сборка не найдена")?;
    build.mods = mods_entries;
    build.source_id = project_id.clone();

    // Обложка = иконка модпака.
    let (_n, icon, _c) = mod_info(&cl, mid).await;
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
