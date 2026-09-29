

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const VANILLA: &str = "vanilla";
const THUMB_WIDTH: u32 = 360;
const THUMB_CACHE_LIMIT: usize = 4000;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Shot {

    pub instance_id: String,
    pub instance_name: String,
    pub mc_version: String,
    pub file: String,
    pub size: u64,

    pub taken_at: u64,
}

struct Instance {
    id: String,
    name: String,
    mc_version: String,
    dir: PathBuf,
}

fn instances() -> Vec<Instance> {
    let settings = crate::settings::load_settings();
    let mut out = vec![Instance {
        id: VANILLA.into(),
        name: String::new(),
        mc_version: String::new(),
        dir: PathBuf::from(&settings.game_dir),
    }];
    for b in crate::builds::load_builds() {
        out.push(Instance {
            dir: crate::builds::build_dir(&b.id),
            id: format!("build:{}", b.id),
            name: b.name,
            mc_version: b.mc_version,
        });
    }
    out
}

fn is_image(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg")
}

#[tauri::command]
pub async fn screenshots_list() -> Vec<Shot> {
    tokio::task::spawn_blocking(|| {
        let mut out = Vec::new();
        for inst in instances() {
            let dir = inst.dir.join("screenshots");
            let Ok(rd) = std::fs::read_dir(&dir) else { continue };
            for entry in rd.flatten() {
                let Ok(meta) = entry.metadata() else { continue };
                if !meta.is_file() {
                    continue;
                }
                let file = entry.file_name().to_string_lossy().to_string();
                if !is_image(&file) {
                    continue;
                }
                let taken_at = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                out.push(Shot {
                    instance_id: inst.id.clone(),
                    instance_name: inst.name.clone(),
                    mc_version: inst.mc_version.clone(),
                    file,
                    size: meta.len(),
                    taken_at,
                });
            }
        }
        out.sort_by(|a, b| b.taken_at.cmp(&a.taken_at));
        out
    })
    .await
    .unwrap_or_default()
}

fn resolve(instance_id: &str, file: &str) -> Result<PathBuf, String> {
    if file.is_empty()
        || file.contains(['/', '\\', ':'])
        || file.contains("..")
        || !is_image(file)
    {
        return Err("Bad screenshot name".into());
    }
    let inst = instances()
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or("Instance not found")?;
    let base = inst.dir.join("screenshots");
    let base = base.canonicalize().map_err(|_| "Screenshot not found".to_string())?;
    let path = base
        .join(file)
        .canonicalize()
        .map_err(|_| "Screenshot not found".to_string())?;
    if !path.starts_with(&base) || !path.is_file() {
        return Err("Screenshot not found".into());
    }
    Ok(path)
}

fn thumbs_dir() -> PathBuf {
    crate::settings::data_root().join("cache").join("screenshot-thumbs")
}

fn thumb_key(path: &Path) -> String {
    use sha1::{Digest, Sha1};
    let meta = std::fs::metadata(path).ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = meta
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut h = Sha1::new();
    h.update(path.to_string_lossy().as_bytes());
    h.update(size.to_le_bytes());
    h.update(mtime.to_le_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

#[tauri::command]
pub async fn screenshot_thumbnail(instance_id: String, file: String) -> Result<Option<String>, String> {
    let path = resolve(&instance_id, &file)?;
    tokio::task::spawn_blocking(move || {
        let dir = thumbs_dir();
        let cached = dir.join(format!("{}.png", thumb_key(&path)));
        if let Ok(bytes) = std::fs::read(&cached) {
            return Ok(Some(data_url("image/png", &bytes)));
        }
        if !path.to_string_lossy().to_ascii_lowercase().ends_with(".png") {
            return Ok(None);
        }
        let img = match image::open(&path) {
            Ok(i) => i,
            Err(_) => return Ok(None),
        };
        let thumb = if img.width() > THUMB_WIDTH {
            let h = (img.height() as u64 * THUMB_WIDTH as u64 / img.width().max(1) as u64) as u32;
            img.thumbnail(THUMB_WIDTH, h.max(1))
        } else {
            img
        };
        let mut buf = std::io::Cursor::new(Vec::new());
        thumb
            .write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        let bytes = buf.into_inner();
        let _ = std::fs::create_dir_all(&dir);

        let tmp = cached.with_extension("part");
        if std::fs::write(&tmp, &bytes).is_ok() {
            let _ = std::fs::rename(&tmp, &cached);
        }
        prune_cache(&dir);
        Ok(Some(data_url("image/png", &bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn prune_cache(dir: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = rd
        .flatten()
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    if files.len() <= THUMB_CACHE_LIMIT {
        return;
    }
    files.sort_by_key(|(t, _)| *t);
    let extra = files.len() - THUMB_CACHE_LIMIT;
    for (_, p) in files.into_iter().take(extra) {
        let _ = std::fs::remove_file(p);
    }
}

#[tauri::command]
pub async fn screenshot_full(instance_id: String, file: String) -> Result<String, String> {
    let path = resolve(&instance_id, &file)?;
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let mime = if file.to_ascii_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" };
    Ok(data_url(mime, &bytes))
}

#[tauri::command]
pub fn screenshot_open(instance_id: String, file: String) -> Result<(), String> {
    let path = resolve(&instance_id, &file)?;
    #[cfg(windows)]
    {

        std::process::Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" })
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn screenshot_reveal(instance_id: String, file: String) -> Result<(), String> {
    let path = resolve(&instance_id, &file)?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        if let Some(dir) = path.parent() {
            crate::settings::open_folder(dir.to_string_lossy().to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn screenshot_delete(instance_id: String, file: String) -> Result<(), String> {
    let path = resolve(&instance_id, &file)?;
    let thumb = thumbs_dir().join(format!("{}.png", thumb_key(&path)));
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(thumb);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_names() {
        for bad in ["../x.png", "..\\x.png", "a/b.png", "c:\\x.png", "x.exe", ""] {
            assert!(resolve(VANILLA, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn accepts_only_images() {
        assert!(is_image("2026-09-29_12.00.00.png"));
        assert!(is_image("a.JPG"));
        assert!(!is_image("options.txt"));
    }
}
