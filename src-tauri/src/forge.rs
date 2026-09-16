

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

    pub missing: Vec<PathBuf>,
}

fn sep() -> &'static str {
    if cfg!(windows) {
        ";"
    } else {
        ":"
    }
}

pub async fn install(
    client: &reqwest::Client,
    kind: &str,
    mc_version: &str,
    root: &Path,
    libraries_dir: &Path,

    vanilla_dir: &Path,
    java: &Path,
    app: &AppHandle,

    pinned: Option<&str>,
) -> Result<LoaderProfile, String> {
    let pinned = pinned.filter(|s| !s.is_empty());
    let (version, url) = if kind == "neoforge" {
        let v = match pinned {
            Some(v) => v.to_string(),
            None => resolve_neoforge_version(client, mc_version).await?,
        };
        let u = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{v}/neoforge-{v}-installer.jar"
        );
        (v, u)
    } else {
        let v = match pinned {
            Some(v) => v.to_string(),
            None => resolve_forge_version(client, mc_version).await?,
        };
        let u = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{v}/forge-{mc}-{v}-installer.jar",
            mc = mc_version
        );
        (v, u)
    };

    if !version
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
    {
        return Err(format!("Invalid loader version: {version}"));
    }

    let installer = root.join("cache").join(format!("{kind}-{version}-installer.jar"));
    emit(app, "forge", "Downloading Forge installer", 0, 1);

    let installer_client = reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    download_file(&installer_client, &url, &installer)
        .await
        .map_err(|e| format!("Could not download the installer: {kind} {version} — {e}"))?;

    verify_installer_zip(&installer)?;

    let embedded = read_json_from_jar(&installer, "version.json")?;
    let id = embedded["id"]
        .as_str()
        .ok_or("The installer has no version.json with an id field")?
        .to_string();
    let forge_json = root.join("versions").join(&id).join(format!("{id}.json"));

    mirror_vanilla(root, vanilla_dir, mc_version);

    if !forge_json.exists() {
        run_installer(java, &installer, root, app).await?;
        if !forge_json.exists() {
            return Err(format!(
                "The installer did not create the version profile — check Java and your internet connection: {kind} {id}"
            ));
        }
    }
    emit(app, "forge", "Forge installed", 1, 1);

    let read_profile = |path: &Path| -> Result<Value, String> {
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())
    };

    let vjson = read_profile(&forge_json)?;
    let profile = build_profile(client, &vjson, libraries_dir, mc_version).await?;

    if profile.missing.is_empty() {
        return Ok(profile);
    }

    emit(app, "forge", "Fetching the remaining Forge files…", 0, 1);
    run_installer(java, &installer, root, app).await?;
    let profile = build_profile(client, &read_profile(&forge_json)?, libraries_dir, mc_version).await?;
    if let Some(p) = profile.missing.first() {
        return Err(format!(
            "The installer did not create a required file — delete the version folder and try again: {kind} · {} · versions/{id}",
            p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
        ));
    }
    Ok(profile)
}

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

pub(crate) async fn resolve_forge_version(
    client: &reqwest::Client,
    mc: &str,
) -> Result<String, String> {
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
        .ok_or_else(|| format!("There is no Forge build for this Minecraft version: {mc}"))
}

fn neoforge_prefix(mc: &str) -> Result<String, String> {
    let p: Vec<&str> = mc.split('.').collect();
    let major = p.get(1).ok_or("Invalid Minecraft version")?;
    let minor = p.get(2).copied().unwrap_or("0");
    Ok(format!("{major}.{minor}."))
}

pub(crate) async fn resolve_neoforge_version(
    client: &reqwest::Client,
    mc: &str,
) -> Result<String, String> {
    let xml = client
        .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let prefix = neoforge_prefix(mc)?;

    xml.split("<version>")
        .skip(1)
        .filter_map(|s| s.split("</version>").next())
        .filter(|v| v.starts_with(&prefix))
        .last()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("There is no NeoForge build for this Minecraft version: {mc}"))
}

fn read_json_from_jar(jar: &Path, name: &str) -> Result<Value, String> {
    let file = std::fs::File::open(jar).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entry = archive
        .by_name(name)
        .map_err(|_| format!("The installer is missing a required file: {name}"))?;
    let mut s = String::new();
    std::io::Read::read_to_string(&mut entry, &mut s).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn verify_installer_zip(installer: &Path) -> Result<(), String> {
    let meta = std::fs::metadata(installer).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Err("The downloaded Forge installer is empty".to_string());
    }
    let mut f = std::fs::File::open(installer).map_err(|e| e.to_string())?;
    let mut sig = [0u8; 4];
    std::io::Read::read_exact(&mut f, &mut sig).map_err(|e| e.to_string())?;

    if sig != [0x50, 0x4B, 0x03, 0x04] {
        return Err("The Forge installer is damaged, or it is not a jar archive".to_string());
    }
    Ok(())
}

async fn run_installer(
    java: &Path,
    installer: &Path,
    root: &Path,
    app: &AppHandle,
) -> Result<(), String> {

    let lp = root.join("launcher_profiles.json");
    if !lp.exists() {
        let _ = std::fs::write(&lp, "{\"profiles\":{}}");
    }
    emit(app, "forge", "Installing Forge (this may take a minute)…", 0, 1);

    let java = java.to_path_buf();
    let installer = installer.to_path_buf();
    let root = root.to_path_buf();
    let out = tokio::task::spawn_blocking(move || {

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
            cmd.creation_flags(0x08000000);
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Could not start the Forge installer: {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let log = String::from_utf8_lossy(&out.stdout);
        let text = if err.trim().is_empty() { log } else { err };
        let snippet: String = text.chars().rev().take(500).collect::<String>().chars().rev().collect();
        return Err(format!("The Forge installer failed: {snippet}"));
    }
    Ok(())
}

async fn build_profile(
    client: &reqwest::Client,
    vjson: &Value,
    libraries_dir: &Path,
    mc_version: &str,
) -> Result<LoaderProfile, String> {
    let main_class = vjson["mainClass"].as_str().unwrap_or("").to_string();

    let mut libraries: Vec<(String, PathBuf)> = Vec::new();
    let mut missing: Vec<PathBuf> = Vec::new();
    if let Some(libs) = vjson["libraries"].as_array() {

        let mut entries: Vec<(String, PathBuf)> = Vec::new();
        let mut to_download: Vec<(String, PathBuf)> = Vec::new();
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
                    to_download.push((url.to_string(), dest.clone()));
                }
            }
            entries.push((artifact_key(name), dest));
        }

        if !to_download.is_empty() {
            use futures::StreamExt;
            let fetch = |tasks: Vec<(String, PathBuf)>| {
                let client = client.clone();
                async move {
                    futures::stream::iter(tasks.into_iter().map(|(url, dest)| {
                        let client = client.clone();
                        async move {
                            match download_file(&client, &url, &dest).await {
                                Ok(()) => None,
                                Err(_) => Some((url, dest)),
                            }
                        }
                    }))
                    .buffer_unordered(16)
                    .filter_map(|r| async move { r })
                    .collect::<Vec<_>>()
                    .await
                }
            };
            let failed = fetch(to_download).await;
            if !failed.is_empty() {
                let _ = fetch(failed).await;
            }
        }

        for (key, dest) in entries {
            if dest.exists() {
                libraries.push((key, dest));
            } else {
                missing.push(dest);
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
        missing,
    })
}
