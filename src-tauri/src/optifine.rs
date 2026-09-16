

use std::path::Path;
use std::time::Duration;

const SITE: &str = "https://optifine.net";

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AcironLauncher";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

fn slice_after<'a>(hay: &'a str, needle: &str, stops: &[char]) -> Option<&'a str> {
    let start = hay.find(needle)? + needle.len();
    let rest = &hay[start..];
    let end = rest.find(|c| stops.contains(&c)).unwrap_or(rest.len());
    Some(&rest[..end])
}

async fn latest_file(cl: &reqwest::Client, mc: &str) -> Result<String, String> {
    let html = cl
        .get(format!("{SITE}/downloads"))
        .send()
        .await
        .map_err(|_| "The OptiFine site is not responding".to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let needle = format!("adloadx?f=OptiFine_{mc}_");
    let tail = slice_after(&html, &needle, &['"', '\'', '&'])
        .ok_or_else(|| format!("OptiFine has no build for this game version: {mc}"))?;
    let name = format!("OptiFine_{mc}_{tail}");
    if !name.ends_with(".jar") {
        return Err("Couldn't read the OptiFine page".into());
    }
    Ok(name)
}

async fn resolve_url(cl: &reqwest::Client, file: &str) -> Result<(String, String), String> {
    let referer = format!("{SITE}/adloadx?f={file}");
    let html = cl
        .get(&referer)
        .send()
        .await
        .map_err(|_| "The OptiFine site is not responding".to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let query = slice_after(&html, "downloadx?f=", &['"', '\''])
        .ok_or("The OptiFine page has no file link")?

        .replace("&amp;", "&");
    Ok((format!("{SITE}/downloadx?f={query}"), referer))
}

pub async fn install(mc: &str, dir: &Path) -> Result<String, String> {
    let cl = client()?;
    let file = latest_file(&cl, mc).await?;
    let (url, referer) = resolve_url(&cl, &file).await?;

    let bytes = cl
        .get(&url)

        .header(reqwest::header::REFERER, referer)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    if bytes.len() < 1024 || &bytes[..2] != b"PK" {
        return Err("OptiFine did not return a file, install it manually from optifine.net".into());
    }

    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&file), &bytes).map_err(|e| e.to_string())?;
    Ok(file)
}

#[tauri::command]
pub async fn install_optifine(build_id: String) -> Result<crate::builds::Build, String> {
    let build = crate::builds::get_build(&build_id).ok_or("Instance not found")?;
    if build.loader != "forge" {
        return Err("OptiFine can only be installed with Forge".into());
    }
    let dir = crate::builds::mods_dir(&build_id);
    install(&build.mc_version, &dir).await?;
    crate::builds::refresh_build_content(build_id)
}
