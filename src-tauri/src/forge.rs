

use crate::launcher::{artifact_key, download_file, emit, get_json, maven_path};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

pub struct LoaderProfile {
    pub main_class: String,
    pub jvm_args: Vec<String>,
    pub game_args: Vec<String>,

    pub libraries: Vec<(String, PathBuf)>,
}

fn sep() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}

/// Ставит Forge/NeoForge под версию игры и отдаёт профиль запуска.
pub async fn install(
    client: &reqwest::Client,
    kind: &str, // "forge" | "neoforge"
    mc_version: &str,
    root: &Path,
    libraries_dir: &Path,
    // Папка ванильной версии (<versions_dir>/<mc>) — из неё установщик берёт клиент.
    vanilla_dir: &Path,
    java: &Path,
    app: &AppHandle,
) -> Result<LoaderProfile, String> {
    let (version, url) = if kind == "neoforge" {
        let v = resolve_neoforge_version(client, mc_version).await?;
        let u = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar"
        );
        (v, u)
    } else {
        let v = resolve_forge_version(client, mc_version).await?;
        let u = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{v}/forge-{mc}-{v}-installer.jar",
            mc = mc_version
        );
        (v, u)
    };

    let installer = root.join("cache").join(format!("{kind}-{version}-installer.jar"));
    emit(app, "forge", "Загрузка установщика Forge", 0, 1);
    // Установщик — крупный файл: отдельный клиент только с таймаутом соединения
    // (без общего лимита, чтобы медленная закачка не оборвалась) — HNS-02.
    let installer_client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    download_file(&installer_client, &url, &installer)
        .await
        .map_err(|e| format!("Не удалось скачать установщик {kind} {version}: {e}"))?;

    // SEC-06: перед запуском проверяем целостность установщика. Промоушны/metadata,
    // которые лаунчер уже забирает (promotions_slim.json / maven-metadata.xml), НЕ
    // содержат хеша конкретного installer.jar — это известный пробел «доверие TLS»:
    // мы полагаемся на HTTPS до maven-репозиториев Forge/NeoForged. Поэтому как
    // минимум убеждаемся, что скачан непустой валидный zip (jar начинается с "PK"),
    // чтобы не запускать java -jar на мусоре/HTML-заглушке прокси.
    verify_installer_zip(&installer)?;

    // id версии, которую создаст установщик (из version.json внутри jar).
    let embedded = read_json_from_jar(&installer, "version.json")?;
    let id = embedded["id"]
        .as_str()
        .ok_or("В установщике нет version.json с полем id")?
        .to_string();
    let forge_json = root.join("versions").join(&id).join(format!("{id}.json"));

    // Установщик ищет ванильную версию в <root>/versions/<mc>/ — если наши версии
    // лежат в другой папке (настройка «Папка версий»), кладём туда копию.
    mirror_vanilla(root, vanilla_dir, mc_version);

    if !forge_json.exists() {
        run_installer(java, &installer, root, app).await?;
        if !forge_json.exists() {
            return Err(format!(
                "Установщик {kind} не создал профиль версии {id}. Проверьте Java и интернет."
            ));
        }
    }
    emit(app, "forge", "Forge установлен", 1, 1);

    let read_profile = |path: &Path| -> Result<Value, String> {
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    };

    let vjson = read_profile(&forge_json)?;
    let profile = build_profile(client, &vjson, libraries_dir, mc_version).await?;

    // Часть библиотек Forge создают ПРОЦЕССОРЫ установщика (client-…-srg.jar,
    // client-…-extra.jar, forge-…-client.jar). Если прошлый запуск установщика
    // оборвался, профиль уже лежит на диске, установщик больше не запускается —
    // и игра падает с «Invalid paths argument». Поэтому проверяем файлы и при
    // необходимости прогоняем установщик ещё раз.
    let missing: Vec<PathBuf> = profile
        .libraries
        .iter()
        .filter(|(_, p)| !p.exists())
        .map(|(_, p)| p.clone())
        .collect();
    if missing.is_empty() {
        return Ok(profile);
    }

    emit(app, "forge", "Доустановка файлов Forge…", 0, 1);
    run_installer(java, &installer, root, app).await?;
    let profile = build_profile(client, &read_profile(&forge_json)?, libraries_dir, mc_version).await?;
    if let Some((_, p)) = profile.libraries.iter().find(|(_, p)| !p.exists()) {
        return Err(format!(
            "Установщик {kind} не создал файл {}. Удалите папку versions/{id} и попробуйте снова.",
            p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
        ));
    }
    Ok(profile)
}

/// Копирует ванильные <mc>.json и <mc>.jar в <root>/versions/<mc>/ — там их ищет
/// установщик Forge (его процессоры патчат именно этот клиент).
fn mirror_vanilla(root: &Path, vanilla_dir: &Path, mc_version: &str) {
    let target = root.join("versions").join(mc_version);
    if target == vanilla_dir {
        return;
    }
    let _ = std::fs::create_dir_all(&target);
    for ext in ["json", "jar"] {
        let from = vanilla_dir.join(format!("{mc_version}.{ext}"));
        let to = target.join(format!("{mc_version}.{ext}"));
        if from.exists() && !to.exists() {
            let _ = std::fs::copy(&from, &to);
        }
    }
}

/// Последняя (recommended, иначе latest) версия Forge под версию игры.
async fn resolve_forge_version(client: &reqwest::Client, mc: &str) -> Result<String, String> {
    let promos = get_json(
        client,
        "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
    )
    .await?;
    let p = &promos["promos"];
    p.get(format!("{mc}-recommended"))
        .and_then(|v| v.as_str())
        .or_else(|| p.get(format!("{mc}-latest")).and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Нет сборки Forge под Minecraft {mc}"))
}

/// Префикс версии NeoForge по версии игры: 1.20.4 → "20.4.", 1.21 → "21.0.".
fn neoforge_prefix(mc: &str) -> Result<String, String> {
    let p: Vec<&str> = mc.split('.').collect();
    let major = p.get(1).ok_or("Неверная версия Minecraft")?;
    let minor = p.get(2).copied().unwrap_or("0");
    Ok(format!("{major}.{minor}."))
}

/// Последняя версия NeoForge под версию игры (из maven-metadata).
async fn resolve_neoforge_version(client: &reqwest::Client, mc: &str) -> Result<String, String> {
    let xml = client
        .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let prefix = neoforge_prefix(mc)?;
    // maven-metadata перечисляет версии по возрастанию — берём последнюю подходящую.
    xml.split("<version>")
        .skip(1)
        .filter_map(|s| s.split("</version>").next())
        .filter(|v| v.starts_with(&prefix))
        .last()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Нет сборки NeoForge под Minecraft {mc}"))
}

/// Читает JSON-файл по имени из jar-архива.
fn read_json_from_jar(jar: &Path, name: &str) -> Result<Value, String> {
    let file = std::fs::File::open(jar).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entry = archive
        .by_name(name)
        .map_err(|_| format!("{name} не найден в установщике"))?;
    let mut s = String::new();
    std::io::Read::read_to_string(&mut entry, &mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

/// SEC-06: базовая проверка целостности скачанного установщика Forge/NeoForge.
/// Хеша установщика в metadata нет (известный пробел «доверие TLS»), поэтому
/// проверяем, что файл непустой и является валидным zip — jar обязан начинаться
/// с сигнатуры локального заголовка zip "PK\x03\x04". Так мы не отдадим java -jar
/// html-заглушку прокси или обрезанный файл.
fn verify_installer_zip(installer: &Path) -> Result<(), String> {
    let meta = std::fs::metadata(installer).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Err("Скачанный установщик Forge пуст".to_string());
    }
    let mut f = std::fs::File::open(installer).map_err(|e| e.to_string())?;
    let mut sig = [0u8; 4];
    std::io::Read::read_exact(&mut f, &mut sig).map_err(|e| e.to_string())?;
    // "PK\x03\x04" — сигнатура zip/jar.
    if sig != [0x50, 0x4B, 0x03, 0x04] {
        return Err("Установщик Forge повреждён или это не jar-архив".to_string());
    }
    Ok(())
}

/// Запускает установщик Forge в режиме клиента.
async fn run_installer(
    java: &Path,
    installer: &Path,
    root: &Path,
    app: &AppHandle,
) -> Result<(), String> {
    // Установщик требует launcher_profiles.json в целевой папке.
    let lp = root.join("launcher_profiles.json");
    if !lp.exists() {
        let _ = std::fs::write(&lp, "{\"profiles\":{}}");
    }
    emit(app, "forge", "Установка Forge (может занять минуту)…", 0, 1);

    let java = java.to_path_buf();
    let installer = installer.to_path_buf();
    let root = root.to_path_buf();
    let out = tokio::task::spawn_blocking(move || {
        // javaw.exe не отдаёт вывод — установщик запускаем консольной java.exe.
        let console = java.with_file_name(if cfg!(windows) { "java.exe" } else { "java" });
        let java = if console.exists() { console } else { java };
        let mut cmd = std::process::Command::new(&java);
        cmd.arg("-jar")
            .arg(&installer)
            .arg("--installClient")
            .arg(&root);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Не удалось запустить установщик Forge: {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let log = String::from_utf8_lossy(&out.stdout);
        let text = if err.trim().is_empty() { log } else { err };
        let snippet: String = text.chars().rev().take(500).collect::<String>().chars().rev().collect();
        return Err(format!("Установщик Forge завершился с ошибкой: {snippet}"));
    }
    Ok(())
}

/// Собирает профиль запуска из version.json Forge/NeoForge.
async fn build_profile(
    client: &reqwest::Client,
    vjson: &Value,
    libraries_dir: &Path,
    mc_version: &str,
) -> Result<LoaderProfile, String> {
    let main_class = vjson["mainClass"].as_str().unwrap_or("").to_string();

    // Библиотеки: установщик уже разложил их в libraries/. Догружаем только то,
    // у чего есть прямой url и чего нет на диске (обычные зависимости).
    let mut libraries: Vec<(String, PathBuf)> = Vec::new();
    if let Some(libs) = vjson["libraries"].as_array() {
        for lib in libs {
            let name = lib["name"].as_str().unwrap_or("");
            if name.is_empty() {
                continue;
            }
            let art = &lib["downloads"]["artifact"];
            let path = art["path"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| maven_path(name));
            let path = match path {
                Some(p) => p,
                None => continue,
            };
            let dest = libraries_dir.join(&path);
            if !dest.exists() {
                if let Some(url) = art["url"].as_str().filter(|u| !u.is_empty()) {
                    let _ = download_file(client, url, &dest).await;
                }
            }
            if dest.exists() {
                libraries.push((artifact_key(name), dest));
            }
        }
    }

    let libdir = libraries_dir.to_string_lossy().into_owned();
    let subst = |s: &str| -> String {
        s.replace("${library_directory}", &libdir)
            .replace("${classpath_separator}", sep())
            .replace("${version_name}", mc_version)
    };

    let mut jvm_args = Vec::new();
    let mut game_args = Vec::new();

    if let Some(jvm) = vjson["arguments"]["jvm"].as_array() {
        for a in jvm {
            if let Some(s) = a.as_str() {
                let s = subst(s);
                // SEC-06: version.json Forge/NeoForge приходит по сети. Отбрасываем
                // потенциально внедрённые опасные JVM-аргументы: -javaagent: (загрузка
                // произвольного агента в JVM) и -cp/-classpath (подмена classpath) —
                // classpath задаёт только сам лаунчер. Обычные флаги Forge
                // (-D..., --add-opens, --add-modules, -p и прочее) пропускаем.
                if s.starts_with("-javaagent:") || s == "-cp" || s == "-classpath" {
                    continue;
                }
                jvm_args.push(s);
            }
        }
    }
    if let Some(game) = vjson["arguments"]["game"].as_array() {
        for a in game {
            if let Some(s) = a.as_str() {
                game_args.push(subst(s));
            }
        }
    } else if let Some(mc_args) = vjson["minecraftArguments"].as_str() {
        // Легаси (1.12.2 и старее): берём только --tweakClass — остальные аргументы
        // launcher.rs уже добавляет сам (они совпадают с ванильными токенами).
        let toks: Vec<&str> = mc_args.split_whitespace().collect();
        let mut i = 0;
        while i < toks.len() {
            if toks[i] == "--tweakClass" && i + 1 < toks.len() {
                game_args.push("--tweakClass".into());
                game_args.push(toks[i + 1].to_string());
                i += 2;
            } else {
                i += 1;
            }
        }
    }

    Ok(LoaderProfile {
        main_class,
        jvm_args,
        game_args,
        libraries,
    })
}
