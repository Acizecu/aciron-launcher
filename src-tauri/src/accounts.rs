use crate::launcher::offline_uuid;
use crate::settings::data_root;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub uuid: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub skin_url: String,

    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub refresh_token: String,

    #[serde(default)]
    pub aciron_token: String,

    #[serde(default)]
    pub aciron_name: String,

    #[serde(default)]
    pub licensed: bool,

    #[serde(default)]
    pub token_expires: u64,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct Store {
    #[serde(default)]
    accounts: Vec<Account>,
    #[serde(default)]
    active: String,
}

fn store_file() -> PathBuf {
    data_root().join("accounts.json")
}

/// Поля-токены, которые шифруются на диске (DPAPI). В памяти всегда в открытом
/// виде — шифрование/расшифровка происходят ровно на границе load/save.
fn map_token_fields(store: &mut Store, f: impl Fn(&str) -> String) {
    for a in &mut store.accounts {
        a.access_token = f(&a.access_token);
        a.refresh_token = f(&a.refresh_token);
        a.aciron_token = f(&a.aciron_token);
    }
}

fn load() -> Store {
    match std::fs::read_to_string(store_file()) {
        Ok(txt) => {
            let mut store: Store = serde_json::from_str(&txt).unwrap_or_default();
            map_token_fields(&mut store, crate::secret::decrypt);
            store
        }
        Err(_) => Store::default(),
    }
}

fn save(store: &Store) -> Result<(), String> {
    let file = store_file();
    if let Some(p) = file.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    // Шифруем токены перед сериализацией; в памяти store остаётся открытым.
    let mut enc = store.clone();
    map_token_fields(&mut enc, crate::secret::encrypt);
    let txt = serde_json::to_string_pretty(&enc).map_err(|e| e.to_string())?;
    std::fs::write(file, txt).map_err(|e| e.to_string())
}

pub fn gen_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{:x}", md5::compute(n.to_string()))
}

pub fn active_account() -> Option<Account> {
    let s = load();
    s.accounts
        .iter()
        .find(|a| a.id == s.active)
        .cloned()
        .or_else(|| s.accounts.first().cloned())
}

pub fn save_account(acc: Account) -> Account {
    let mut store = load();
    store
        .accounts
        .retain(|a| !(a.kind == acc.kind && (a.uuid == acc.uuid || a.username == acc.username)));
    store.active = acc.id.clone();
    store.accounts.push(acc.clone());
    let _ = save(&store);
    acc
}

pub fn update_tokens(
    id: &str,
    access_token: &str,
    refresh_token: &str,
    uuid: &str,
    username: &str,
    token_expires: u64,
) {
    let mut store = load();
    if let Some(a) = store.accounts.iter_mut().find(|a| a.id == id) {
        a.access_token = access_token.to_string();
        if !refresh_token.is_empty() {
            a.refresh_token = refresh_token.to_string();
        }
        a.uuid = uuid.to_string();
        a.username = username.to_string();
        a.token_expires = token_expires;
    }
    let _ = save(&store);
}

pub fn get_account(id: &str) -> Option<Account> {
    load().accounts.into_iter().find(|a| a.id == id)
}

pub fn with_account<F: FnOnce(&mut Account)>(id: &str, f: F) -> Option<Account> {
    let mut store = load();
    let acc = store.accounts.iter_mut().find(|a| a.id == id)?;
    f(acc);
    let updated = acc.clone();
    let _ = save(&store);
    Some(updated)
}

#[tauri::command]
pub fn get_accounts() -> serde_json::Value {
    let s = load();
    json!({ "accounts": s.accounts, "active": s.active })
}

#[tauri::command]
pub fn add_offline_account(username: String) -> Result<Account, String> {
    let username = username.trim().to_string();

    let valid = (3..=16).contains(&username.chars().count())
        && username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !valid {
        return Err("Ник: 3–16 символов, только латиница, цифры и _".into());
    }
    let mut store = load();
    let acc = Account {
        id: gen_id(),
        uuid: offline_uuid(&username),
        username,
        kind: "offline".into(),
        access_token: "0".into(),
        skin_url: String::new(),
        refresh_token: String::new(),
        aciron_token: String::new(),
        aciron_name: String::new(),
        licensed: false,
        token_expires: 0,
    };
    store.active = acc.id.clone();
    store.accounts.push(acc.clone());
    save(&store)?;
    Ok(acc)
}

#[tauri::command]
pub fn remove_account(id: String) -> Result<(), String> {
    let mut store = load();
    store.accounts.retain(|a| a.id != id);
    if store.active == id {
        store.active = store.accounts.first().map(|a| a.id.clone()).unwrap_or_default();
    }
    save(&store)
}

#[tauri::command]
pub fn set_active_account(id: String) -> Result<(), String> {
    let mut store = load();
    if store.accounts.iter().any(|a| a.id == id) {
        store.active = id;
    }
    save(&store)
}
