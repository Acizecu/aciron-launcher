use crate::builds::{self, Build, InstalledMod};
use crate::launcher::emit_op;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

// Локальный emit тегирует ВСЕ события этого модуля как операцию "install", чтобы
// орб установки не закрывался чужим "done" от запуска игры, а ошибка установки не
// поднимала баннер запуска (launch-progress — глобальное событие).
fn emit(app: &AppHandle, stage: &str, message: &str, current: u64, total: u64) {
    emit_op(app, "install", stage, message, current, total);
}

const API: &str = "https://api.modpacks.ch/public";

fn cf_proxy() -> String {
    crate::curseforge::proxy_base()
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

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .default_headers(crate::curseforge::proxy_headers())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

// B8: один ленивый reqwest::Client на модуль (образец — cancel.rs/discord.rs OnceLock).
// Client клонируется дёшево и шарит внутренний connection-pool/TLS, поэтому команды
// (search/project/versions/install) переиспользуют keep-alive соединения между вызовами.
// Конфигурация статична (user-agent + compile-time proxy_headers), так что кэшировать
// клиент безопасно — поведение идентично прежнему построению на каждый вызов.
fn http() -> Result<reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT.get_or_init(build_client).clone()
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

    // B5: раньше детали каждого пака страницы тянулись строго последовательно
    // (N round-trip'ов до api.modpacks.ch перед выдачей). Теперь тянем через
    // buffer_unordered(8) — задержка ≈ один RTT вместо суммы. batch-эндпоинта
    // у modpacks.ch public нет, поэтому параллелим по одному запросу на пак.
    // Список ранжирован (search/popular), а buffer_unordered отдаёт результаты
    // в произвольном порядке — поэтому тегируем индексом и восстанавливаем порядок,
    // а неуспешные запросы отбрасываем ровно как прежний `if let Ok(..)`.
    use futures::StreamExt;
    let tasks = page.into_iter().enumerate().map(|(i, id)| {
        let cl = cl.clone();
        async move {
            match get_json(&cl, &format!("{API}/modpack/{id}")).await {
                Ok(pack) => Some((i, normalize_hit(&pack))),
                Err(_) => None,
            }
        }
    });
    let mut ordered: Vec<(usize, Value)> = futures::stream::iter(tasks)
        .buffer_unordered(8)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .flatten()
        .collect();
    ordered.sort_by_key(|(i, _)| *i);
    let hits: Vec<Value> = ordered.into_iter().map(|(_, v)| v).collect();

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

// B6: стриминг ответа чанками вместо буферизации всего файла в память
// (.bytes() -> tokio::fs::write). Образец — modrinth.rs download_cancelable.
// Пиковое потребление памяти теперь ограничено размером чанка, а не всего файла;
// это особенно важно при параллельной установке модпака (B3). Поведение (создать
// родительскую директорию, записать байты в path, вернуть ошибку сети/IO) неизменно.
async fn download_to(cl: &reqwest::Client, url: &str, path: &Path) -> Result<(), String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    if let Some(p) = path.parent() {
        tokio::fs::create_dir_all(p).await.map_err(|e| e.to_string())?;
    }
    // Пишем во временный .part и атомарно переименовываем: обрыв/ошибка не оставят
    // усечённый файл на месте итогового (иначе он сошёл бы за корректно установленный).
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
    // Обёртка: любая ошибка (кроме отмены) шлёт "error", иначе орб установки завис
    // бы на «Подготовка…» без сигнала о сбое. Отмену ошибкой не считаем.
    let res = ftb_install_inner(app.clone(), project_id, version_id).await;
    if let Err(e) = &res {
        if e != crate::cancel::CANCELLED {
            emit(&app, "error", e, 0, 1);
        }
    }
    res
}

async fn ftb_install_inner(
    app: AppHandle,
    project_id: String,
    version_id: Option<String>,
) -> Result<Build, String> {
    let cl = http()?;
    // Снимаем прошлую пометку отмены под общим ключом орба ("legacy").
    crate::cancel::reset("legacy");
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
    let build_id = build.id.clone();

    let files = manifest["files"].as_array().cloned().unwrap_or_default();
    let total = files.len() as u64;

    // B3: раньше файлы модпака обрабатывались строго последовательно — на каждый
    // CF-файл resolve_url делал лишний round-trip к download-url прокси (ftb.rs),
    // а затем download_to тоже .await по одному. На крупных FTB-модпаках это
    // сотни сериализованных сетевых операций. Теперь и resolve_url, и download_to
    // выполняются внутри одной задачи на файл, а задачи гоняются через
    // buffer_unordered(8) (CF-прокси строг по rate-limit — держим 8, как в
    // curseforge.rs/modrinth check_build_updates).
    //
    // Поведение сохранено 1-в-1:
    //  * прогресс: как и раньше, каждый файл эмитит ровно один тик "modpack"/
    //    "Загрузка модпака"; счётчик атомарный (образец — launcher.rs done.fetch_add),
    //    значение current теперь порядковый номер завершения (total совпадает,
    //    монотонно 1..=total). Пустой name по-прежнему не эмитит прогресс (ранний
    //    `continue` без emit) — такой файл возвращает None и не двигает счётчик;
    //  * serveronly и провал safe_join по-прежнему эмитят прогресс и не качаются;
    //  * mods_entries собираются по индексу файла и восстанавливаются в исходном
    //    порядке (buffer_unordered отдаёт результаты вразнобой);
    //  * каждый файл пишется в свой safe_join-путь, гонок по файловой системе нет.
    use futures::StreamExt;
    let done = Arc::new(AtomicU64::new(0));
    // into_iter() (а не iter()) отдаёт владение Value в замыкание: раньше замыкание
    // принимало &serde_json::Value и клонировало его внутри (let f = f.clone()), из-за
    // чего async-блок захватывал заём и не был higher-ranked-lifetime general enough —
    // tauri::generate_handler не мог доказать FnOnce для любых лайфтаймов. Передавая
    // owned `f`, заём через границу async исчезает (HRTB-ошибка уходит), а лишний clone
    // устранён. `files` — уже owned Vec и дальше не используется, поведение 1-в-1.
    let tasks = files.into_iter().enumerate().map(|(i, f)| {
        let cl = cl.clone();
        let app = app.clone();
        let build_dir = build_dir.clone();
        let done = done.clone();
        async move {
            let emit_tick = || {
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                emit(&app, "modpack", "Загрузка модпака", n, total);
            };

            if f["serveronly"].as_bool() == Some(true) {
                emit_tick();
                return None;
            }
            let fname = f["name"].as_str().unwrap_or("").to_string();
            if fname.is_empty() {
                // как и в исходнике: ранний выход без эмита прогресса
                return None;
            }

            let rel = f["path"].as_str().unwrap_or("./");
            let rel = rel.trim_start_matches("./").trim_start_matches('/');

            let dest = match safe_join(&build_dir, rel).and_then(|d| safe_join(&d, &fname)) {
                Some(d) => d,
                None => {
                    emit_tick();
                    return None;
                }
            };

            let mut entry: Option<InstalledMod> = None;
            // Отмена: не начинаем скачивание оставшихся файлов (итоговая очистка
            // сборки — после сбора результатов).
            if !crate::cancel::is_cancelled("legacy") {
              if let Some(url) = resolve_url(&cl, &f).await {
                if download_to(&cl, &url, &dest).await.is_ok()
                    && rel.replace('\\', "/").starts_with("mods")
                    && fname.ends_with(".jar")
                {
                    entry = Some(InstalledMod {
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
            emit_tick();
            entry.map(|e| (i, e))
        }
    });

    let mut collected: Vec<(usize, InstalledMod)> = futures::stream::iter(tasks)
        .buffer_unordered(8)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .flatten()
        .collect();
    collected.sort_by_key(|(i, _)| *i);
    let mods_entries: Vec<InstalledMod> = collected.into_iter().map(|(_, e)| e).collect();

    // Отмена во время закачки → удаляем осиротевшую сборку целиком. Папка создана
    // create_build этой операцией, поэтому remove_dir_all безопасен и не трогает
    // ранее существовавшие данные (образец: modrinth build_from_mrpack).
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

    if let Err(e) = builds::upsert_build(build.clone()) {
        let _ = builds::delete_build(build_id.clone());
        return Err(e);
    }
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
