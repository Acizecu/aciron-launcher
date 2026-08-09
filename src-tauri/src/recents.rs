use crate::settings;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recent {

    pub id: String,

    pub kind: String,

    pub name: String,

    pub mc_version: String,

    pub last_played: u64,

    #[serde(default)]
    pub playtime_secs: u64,
}

fn store_file() -> PathBuf {
    settings::data_root().join("recents.json")
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn load() -> Vec<Recent> {
    match std::fs::read_to_string(store_file()) {
        Ok(txt) => serde_json::from_str(&txt).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save(list: &[Recent]) {

    if let Ok(txt) = serde_json::to_string_pretty(list) {
        let _ = crate::atomic::write(&store_file(), &txt);
    }
}

pub fn touch(id: &str, kind: &str, name: &str, mc_version: &str) {
    let mut list = load();
    match list.iter_mut().find(|r| r.id == id) {
        Some(r) => {
            r.name = name.to_string();
            r.mc_version = mc_version.to_string();
            r.last_played = now();
        }
        None => list.push(Recent {
            id: id.to_string(),
            kind: kind.to_string(),
            name: name.to_string(),
            mc_version: mc_version.to_string(),
            last_played: now(),
            playtime_secs: 0,
        }),
    }
    save(&list);
}

pub fn add_playtime(id: &str, secs: u64) {
    let mut list = load();
    if let Some(r) = list.iter_mut().find(|r| r.id == id) {
        r.playtime_secs += secs;
        save(&list);
    }
}

#[tauri::command]
pub fn get_recents() -> Vec<Recent> {
    let mut list = load();
    list.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    list.truncate(12);
    list
}

#[tauri::command]
pub fn remove_recent(id: String) {
    let mut list = load();
    list.retain(|r| r.id != id);
    save(&list);
}
