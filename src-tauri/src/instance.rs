

use std::fs::File;
use std::sync::OnceLock;

pub const MAX_INSTANCES: usize = 2;

static SLOT: OnceLock<usize> = OnceLock::new();

static GUARD: OnceLock<File> = OnceLock::new();

pub fn slot() -> usize {
    *SLOT.get().unwrap_or(&1)
}

pub fn data_suffix() -> Option<String> {
    match slot() {
        1 => None,
        n => Some(format!("instance{n}")),
    }
}

#[cfg(windows)]
fn open_exclusive(path: &std::path::Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;

    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .share_mode(0)
        .open(path)
}

#[cfg(not(windows))]
fn open_exclusive(path: &std::path::Path) -> std::io::Result<File> {

    std::fs::OpenOptions::new().write(true).create(true).truncate(false).open(path)
}

#[cfg(windows)]
fn isolate_webview_storage(dir: &std::path::Path) {
    let store = dir.join("webview");
    let _ = std::fs::create_dir_all(&store);
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &store);
}

#[cfg(not(windows))]
fn isolate_webview_storage(_dir: &std::path::Path) {}

pub fn acquire() -> Option<usize> {
    let dir = crate::settings::launcher_root();
    let _ = std::fs::create_dir_all(&dir);
    for n in 1..=MAX_INSTANCES {
        let path = dir.join(format!(".instance-{n}.lock"));
        if let Ok(f) = open_exclusive(&path) {
            let _ = SLOT.set(n);
            let _ = GUARD.set(f);

            if n > 1 {
                isolate_webview_storage(&crate::settings::data_root());
            }
            return Some(n);
        }
    }
    None
}
