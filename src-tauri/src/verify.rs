

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

#[derive(Clone, Serialize, Deserialize)]
struct Fingerprint {
    size: u64,

    mtime_ms: u64,
    sha1: String,
}

#[derive(Default, Serialize, Deserialize)]
struct Cache {
    #[serde(default)]
    files: HashMap<String, Fingerprint>,
}

fn cache_path() -> PathBuf {
    let dir = crate::settings::data_root().join("cache");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("verified.json")
}

fn cache() -> &'static Mutex<Option<Cache>> {
    static C: OnceLock<Mutex<Option<Cache>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

/// Отложенная запись: за один запуск проверяются сотни файлов, и писать json
/// после каждого — хуже, чем то, от чего мы избавляемся. Ставим флаг, а на диск
/// сбрасываем один раз, вызовом flush().
fn dirty() -> &'static Mutex<bool> {
    static D: OnceLock<Mutex<bool>> = OnceLock::new();
    D.get_or_init(|| Mutex::new(false))
}

fn load_into(slot: &mut Option<Cache>) {
    if slot.is_none() {
        let loaded = std::fs::read(cache_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Cache>(&b).ok())
            .unwrap_or_default();
        *slot = Some(loaded);
    }
}

fn key(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn stamp(path: &Path) -> Option<(u64, u64)> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some((meta.len(), mtime))
}

pub fn is_verified(path: &Path, sha1: &str, size: Option<u64>) -> bool {
    let (len, mtime) = match stamp(path) {
        Some(s) => s,
        None => return false,
    };
    if let Some(expected) = size {
        if len != expected {
            return false;
        }
    }
    let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
    load_into(&mut guard);
    match guard.as_ref().and_then(|c| c.files.get(&key(path))) {
        Some(f) => f.size == len && f.mtime_ms == mtime && f.sha1.eq_ignore_ascii_case(sha1),
        None => false,
    }
}

pub fn remember(path: &Path, sha1: &str) {
    let (size, mtime_ms) = match stamp(path) {
        Some(s) => s,
        None => return,
    };
    let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
    load_into(&mut guard);
    if let Some(c) = guard.as_mut() {
        c.files.insert(
            key(path),
            Fingerprint {
                size,
                mtime_ms,
                sha1: sha1.to_ascii_lowercase(),
            },
        );
    }
    *dirty().lock().unwrap_or_else(|p| p.into_inner()) = true;
}

pub fn flush() {
    let mut d = dirty().lock().unwrap_or_else(|p| p.into_inner());
    if !*d {
        return;
    }
    let mut guard = cache().lock().unwrap_or_else(|p| p.into_inner());
    let mine = match guard.as_ref() {
        Some(c) => c,
        None => return,
    };
    let mut merged: Cache = std::fs::read(cache_path())
        .ok()
        .and_then(|b| serde_json::from_slice::<Cache>(&b).ok())
        .unwrap_or_default();
    for (k, v) in mine.files.iter() {
        merged.files.insert(k.clone(), v.clone());
    }

    merged.files.retain(|k, _| Path::new(k).exists());

    let path = cache_path();
    let tmp = path.with_extension("json.part");
    if serde_json::to_vec(&merged)
        .ok()
        .and_then(|b| std::fs::write(&tmp, b).ok())
        .is_some()
    {
        let _ = std::fs::rename(&tmp, &path);
    }
    *guard = Some(merged);
    *d = false;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn tmp_file(name: &str, body: &[u8]) -> PathBuf {
        let p = std::env::temp_dir().join(name);
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(body).unwrap();
        p
    }

    #[test]
    fn запоминает_и_замечает_изменение() {
        let path = tmp_file("aciron-verify-test.bin", b"aciron");
        let sha = "e2cd2a2f2a9ee1c7fbf1b18b1c3d0a97f8ce4a1e";

        assert!(!is_verified(&path, sha, None));

        remember(&path, sha);
        assert!(is_verified(&path, sha, None));

        assert!(!is_verified(&path, "0000000000000000000000000000000000000000", None));

        assert!(!is_verified(&path, sha, Some(999)));

        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&path, b"aciron-launcher").unwrap();
        assert!(!is_verified(&path, sha, None));

        let _ = std::fs::remove_file(&path);
    }
}
