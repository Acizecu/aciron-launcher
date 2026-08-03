//! Шифрование чувствительных полей (токенов) перед записью на диск.
//!
//! На Windows используется DPAPI (`CryptProtectData`): данные привязываются к
//! текущему пользователю ОС, расшифровать их сможет только он на этой машине.
//! На остальных платформах пока прозрачный проброс (TODO: Keychain / Secret
//! Service) — но интерфейс один и тот же, чтобы вызывающий код не ветвился.
//!
//! Формат хранения зашифрованного значения: `dpapi:<base64>`. Значение без этого
//! префикса считается ещё не зашифрованным (старый accounts.json) и на первом же
//! сохранении будет перешифровано — миграция происходит на лету.

const PREFIX: &str = "dpapi:";

/// Шифрует строку для хранения. Пустая строка остаётся пустой (чтобы работал
/// `skip_serializing_if = "String::is_empty"`). При любой ошибке возвращаем
/// исходное значение — лучше сохранить токен в открытом виде, чем потерять вход.
pub fn encrypt(plain: &str) -> String {
    if plain.is_empty() {
        return String::new();
    }
    #[cfg(windows)]
    {
        if let Some(bytes) = dpapi_protect(plain.as_bytes()) {
            use base64::Engine;
            return format!(
                "{PREFIX}{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            );
        }
        plain.to_string()
    }
    #[cfg(not(windows))]
    {
        plain.to_string()
    }
}

/// Расшифровывает значение из хранилища. Значение без префикса `dpapi:` считаем
/// старым незашифрованным и возвращаем как есть (миграция). Если расшифровать не
/// удалось (другой пользователь/машина, повреждение) — возвращаем пустую строку,
/// чтобы протухший токен просто привёл к повторному входу, а не к панике.
pub fn decrypt(stored: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    let Some(b64) = stored.strip_prefix(PREFIX) else {
        return stored.to_string();
    };
    #[cfg(windows)]
    {
        use base64::Engine;
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
            if let Some(plain) = dpapi_unprotect(&bytes) {
                return String::from_utf8_lossy(&plain).into_owned();
            }
        }
        String::new()
    }
    #[cfg(not(windows))]
    {
        // На платформах без шифрования префикса быть не должно, но не роняемся.
        let _ = b64;
        String::new()
    }
}

#[cfg(windows)]
fn dpapi_protect(data: &[u8]) -> Option<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};

    unsafe {
        let in_blob = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };
        // CRYPTPROTECT_UI_FORBIDDEN (0x1) — не показывать UI из фонового процесса.
        let ok = CryptProtectData(&in_blob, null(), null(), null(), null(), 0x1, &mut out_blob);
        if ok == 0 || out_blob.pbData.is_null() {
            return None;
        }
        let vec = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(out_blob.pbData as *mut core::ffi::c_void);
        Some(vec)
    }
}

#[cfg(windows)]
fn dpapi_unprotect(data: &[u8]) -> Option<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    unsafe {
        let in_blob = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };
        let ok = CryptUnprotectData(
            &in_blob,
            null_mut(),
            null(),
            null(),
            null(),
            0x1,
            &mut out_blob,
        );
        if ok == 0 || out_blob.pbData.is_null() {
            return None;
        }
        let vec = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(out_blob.pbData as *mut core::ffi::c_void);
        Some(vec)
    }
}
