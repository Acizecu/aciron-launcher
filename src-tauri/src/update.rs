use serde::Serialize;

#[cfg(windows)]
pub fn remember_install_dir(app: &tauri::AppHandle) {

    if cfg!(debug_assertions) {
        return;
    }

    if crate::instance::slot() > 1 {
        return;
    }

    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else {
        return;
    };

    if !dir.join("uninstall.exe").exists() {
        return;
    }

    if !crate::settings::dir_is_writable(dir) {
        return;
    }

    let cfg = app.config();
    let product = cfg.product_name.clone().unwrap_or_else(|| "Aciron Launcher".into());

    let publisher = cfg
        .bundle
        .publisher
        .clone()
        .or_else(|| cfg.identifier.split('.').nth(1).map(String::from))
        .unwrap_or_else(|| "aciron".into());

    write_hkcu_default(&format!("Software\\{publisher}\\{product}"), dir);
}

#[cfg(not(windows))]
pub fn remember_install_dir(_app: &tauri::AppHandle) {}

#[cfg(windows)]
fn write_hkcu_default(subkey: &str, value: &std::path::Path) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    let wide = |s: &std::ffi::OsStr| -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    };
    let key_w = wide(std::ffi::OsStr::new(subkey));
    let val_w = wide(value.as_os_str());

    unsafe {
        let mut hkey: HKEY = std::ptr::null_mut();
        let rc = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            key_w.as_ptr(),
            0,
            std::ptr::null_mut(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut hkey,
            std::ptr::null_mut(),
        );
        if rc != ERROR_SUCCESS {
            return;
        }

        RegSetValueExW(
            hkey,
            std::ptr::null(),
            0,
            REG_SZ,
            val_w.as_ptr() as *const u8,
            (val_w.len() * 2) as u32,
        );
        RegCloseKey(hkey);
    }
}

#[derive(Serialize)]
pub struct BuildInfo {
    pub channel: String,
    pub version: String,
    pub git_sha: String,
    pub dirty: bool,
    pub updater_enabled: bool,
}

#[tauri::command]
pub fn build_info() -> BuildInfo {

    let channel = option_env!("ACIRON_BUILD_CHANNEL").unwrap_or("local").to_string();
    let git_sha = option_env!("ACIRON_GIT_SHA").unwrap_or("").to_string();
    let dirty = option_env!("ACIRON_GIT_DIRTY") == Some("1");
    let updater_enabled = channel != "local";
    BuildInfo {
        channel,
        version: env!("CARGO_PKG_VERSION").to_string(),
        git_sha,
        dirty,
        updater_enabled,
    }
}
