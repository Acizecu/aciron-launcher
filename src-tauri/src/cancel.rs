use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

fn set() -> &'static Mutex<HashSet<String>> {
    static S: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashSet::new()))
}

#[tauri::command]
pub fn cancel_download(id: String) {
    set().lock().map(|mut s| s.insert(id)).ok();
}

pub fn is_cancelled(id: &str) -> bool {
    set().lock().map(|s| s.contains(id)).unwrap_or(false)
}

pub fn reset(id: &str) {
    set().lock().map(|mut s| s.remove(id)).ok();
}

pub const CANCELLED: &str = "Download cancelled";
