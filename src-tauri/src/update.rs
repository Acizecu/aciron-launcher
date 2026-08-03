use serde::Serialize;
use std::time::Duration;

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Запоминает в реестре папку, из которой запущен лаунчер.
///
/// Обновление ставится тем же NSIS-инсталлятором, что и первая установка, но
/// плагин обновлений запускает его пассивно (`/P /UPDATE`) и не передаёт `/D=`.
/// Установщик сам выбирает каталог: сначала берёт значение по умолчанию
/// (`%LOCALAPPDATA%\<ProductName>`), а затем в `RestorePreviousInstallLocation`
/// пробует перекрыть его значением по умолчанию ключа
/// `HKCU\Software\<Publisher>\<ProductName>`. Ключ пишет только сам NSIS —
/// поэтому у тех, кто ставился из .msi или переносил папку руками, обновление
/// уезжало в `%LOCALAPPDATA%` и выглядело как второй, пустой лаунчер (данные
/// лежат рядом с exe, см. settings::base_data_root).
///
/// Пишем этот ключ на каждом старте: где лаунчер работает сейчас, туда и
/// встанет следующее обновление.
#[cfg(windows)]
pub fn remember_install_dir(app: &tauri::AppHandle) {
    // В dev-сборке exe лежит в target/debug — такой путь установщику не нужен.
    if cfg!(debug_assertions) {
        return;
    }
    // Второе окно работает из того же каталога; писать ключ дважды незачем.
    if crate::instance::slot() > 1 {
        return;
    }

    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else {
        return;
    };
    // Рядом с exe обязан лежать uninstall.exe — его пишет только NSIS. Так мы
    // отличаем настоящую установку от запуска собранного бинарника прямо из
    // target\release: иначе следующее обновление уехало бы в папку сборки.
    if !dir.join("uninstall.exe").exists() {
        return;
    }
    // Program Files: установка из .msi. NSIS в режиме currentUser туда писать не
    // сможет, так что подсовывать ему этот путь нельзя — пусть ставится в
    // %LOCALAPPDATA% по умолчанию. Данные такой установки и так лежат не рядом
    // с exe, а в launcher_root(), и переезжают отдельной миграцией.
    if !crate::settings::dir_is_writable(dir) {
        return;
    }

    let cfg = app.config();
    let product = cfg.product_name.clone().unwrap_or_else(|| "Aciron Launcher".into());
    // Так же, как это делает сборщик Tauri: издатель — либо явный `publisher`,
    // либо средний сегмент идентификатора (com.aciron.launcher → aciron).
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

/// Пишет значение по умолчанию строкового ключа в HKEY_CURRENT_USER.
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
        // Длина в байтах вместе с завершающим нулём — этого требует REG_SZ.
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

const GITHUB_REPO: &str = "Acizecu/aciron-launcher";

#[derive(Serialize, Default)]
pub struct UpdateInfo {

    pub available: bool,

    pub current: String,

    pub latest: String,

    pub url: String,

    pub notes: String,
}

fn is_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches(['v', 'V'])
            .split(|c: char| c == '.' || c == '-' || c == '+')
            .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .map(|p| p.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let (va, vb) = (parse(a), parse(b));
    for i in 0..va.len().max(vb.len()) {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_update() -> UpdateInfo {
    let mut info = UpdateInfo {
        current: APP_VERSION.to_string(),
        latest: APP_VERSION.to_string(),
        ..Default::default()
    };

    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let client = match reqwest::Client::builder()
        .user_agent("AcironLauncher/0.1 (aciron.pro)")

        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(_) => return info,
    };

    let resp = match client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => r,
        _ => return info,
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return info,
    };

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches(['v', 'V']);
    if tag.is_empty() {
        return info;
    }

    info.latest = tag.to_string();
    info.notes = json
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    info.url = json
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|asset| {
                let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name.ends_with(".exe") || name.ends_with(".msi") {
                    asset
                        .get("browser_download_url")
                        .and_then(|u| u.as_str())
                        .map(String::from)
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            json.get("html_url")
                .and_then(|u| u.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| format!("https://github.com/{GITHUB_REPO}/releases/latest"));

    info.available = is_newer(tag, APP_VERSION);
    info
}
