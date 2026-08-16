use crate::builds::{self, Build, InstalledMod};
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

// B4: потоковая загрузка вместо буферизации всего файла в памяти.
// Пишем чанки по мере прихода (образец — modrinth.rs download_cancelable),
// что убирает пик ~1× размера файла в RAM на каждую параллельную загрузку.
// Поведение то же: тот же путь назначения, та же семантика ошибок (любая
// сетевая/IO-ошибка → Err), файл создаётся целиком при успехе.
async fn download_to(url: &str, path: &Path) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    // Качаем клиентом без ключа прокси: url сюда приходит из ответа API и
    // указывает на чужой CDN (см. dl_client).
    let cl = dl_client()?;

    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    // Пишем во временный .part и атомарно переименовываем в итоговый файл. Стриминг
    // напрямую в path оставлял бы усечённый файл при обрыве/ошибке — на следующем
    // запуске он выглядел бы как корректно установленный. .part + rename исключает это.
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

/* ================================================ для формата сборок .acpack */

/// Файл CurseForge в терминах манифеста сборки.
pub(crate) struct CfFile {
    /// Прямая ссылка. Пустая, если автор запретил стороннюю загрузку — тогда
    /// файл придётся положить в архив как есть.
    pub url: String,
    pub file_name: String,
    pub size: u64,
    /// sha1 из ответа CurseForge (algo = 1). Может отсутствовать.
    pub sha1: String,
    /// Отображаемое имя версии, например «sodium-fabric-0.5.8».
    pub display: String,
}

/// Общий HTTP-клиент модуля — чтобы pack.rs ходил на прокси с теми же
/// заголовками и таймаутами, а не заводил собственный.
pub(crate) fn client() -> Result<reqwest::Client, String> {
    http()
}

/// Имя проекта CurseForge. При любой ошибке — пустая строка: имя нужно только
/// для показа человеку, из-за него экспорт падать не должен.
pub(crate) async fn project_name(cl: &reqwest::Client, mod_id: i64) -> String {
    match get_json(cl, &format!("{}/v1/mods/{mod_id}", base())).await {
        Ok(j) => j["data"]["name"].as_str().unwrap_or_default().to_string(),
        Err(_) => String::new(),
    }
}

/// Описание конкретного файла проекта: ссылка, имя, размер, хеш.
///
/// Отсутствие ссылки здесь — не ошибка, а нормальный исход: часть авторов на
/// CurseForge запрещает загрузку через сторонние лаунчеры. Поэтому `url` в
/// таком случае пустой, а решение (положить файл в архив) принимает вызывающий.
pub(crate) async fn file_info(
    cl: &reqwest::Client,
    mod_id: i64,
    file_id: &str,
) -> Result<CfFile, String> {
    let f = get_json(cl, &format!("{}/v1/mods/{mod_id}/files/{file_id}", base())).await?["data"]
        .clone();
    if f.is_null() {
        return Err("Файл не найден".into());
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

// Скачиванием файлов по ссылкам из чужих манифестов занимается pack.rs своим
// клиентом. Через здешний download_to это делать нельзя: его клиент носит ключ
// к нашему прокси, а адрес в .acpack приходит снаружи.

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
                continue; // несовместимую зависимость пропускаем
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
    let filename = sane_filename(file["fileName"].as_str().unwrap_or("file.jar"), "file.jar");
    let url = file_download_url(&cl, mid, &file).await?;

    // Убираем прежнюю версию этого проекта (файл + запись).
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

/// Устанавливает модпак CurseForge в новую сборку: качает .zip, разбирает manifest.json,
/// создаёт сборку, распаковывает overrides и качает все моды по projectID/fileID.
#[tauri::command]
pub async fn curseforge_install_modpack(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    // Обёртка: любая ошибка (кроме отмены) шлёт "error", иначе орб установки завис
    // бы на «Подготовка…» без сигнала о сбое. Отмену ошибкой не считаем.
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
    // Снимаем прошлую пометку отмены под общим ключом орба ("legacy").
    crate::cancel::reset("legacy");
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

    // B4: .zip модпака стримим во временный файл, а не держим в памяти + ещё раз
    // в bytes.to_vec() (это был пик ~2× размера модпака). Читаем чанки и пишем на
    // диск по мере прихода; ZipArchive затем работает поверх файла, а не буфера.
    // Уникальное имя — по mid+file-id, чтобы параллельные установки не пересекались.
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
            // Отмена во время самой большой загрузки (.zip модпака) — сворачиваемся
            // сразу, удаляя недокачанный временный файл. Сборки ещё нет — чистить
            // нечего кроме tmp_zip.
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

    // --- синхронно: разбор zip, создание сборки, распаковка overrides ---
    // Выносим блокирующий zip-I/O в spawn_blocking, чтобы не держать поток
    // tokio-executor'а на чтении/распаковке (образец: launcher.rs spawn_blocking).

    let tmp_zip_for_task = tmp_zip.clone();
    let parse_result = tokio::task::spawn_blocking(move || -> Result<(String, PathBuf, Vec<Value>), String> {
        let f = std::fs::File::open(&tmp_zip_for_task).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;

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
                crate::i18n::pick(
                    "Модпак CurseForge",
                    "CurseForge modpack",
                    "CurseForge mod paketi",
                )
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
            emit(&app, "modpack", "Загрузка модпака", n, total);
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
            return Err("Сборка не найдена".into());
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
    emit(&app, "done", "Модпак установлен", 1, 1);
    Ok(build)
}
