

const PREFIX: &str = "dpapi:";
#[cfg(target_os = "macos")]
const KC_PREFIX: &str = "kc:";

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
    #[cfg(target_os = "macos")]
    {
        if let Some(bytes) = keychain::seal(plain.as_bytes()) {
            use base64::Engine;
            return format!(
                "{KC_PREFIX}{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            );
        }
        plain.to_string()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        plain.to_string()
    }
}

pub fn decrypt(stored: &str) -> String {
    if stored.is_empty() {
        return String::new();
    }
    #[cfg(target_os = "macos")]
    if let Some(b64) = stored.strip_prefix(KC_PREFIX) {
        use base64::Engine;
        return base64::engine::general_purpose::STANDARD
            .decode(b64)
            .ok()
            .and_then(|bytes| keychain::open(&bytes))
            .map(|plain| String::from_utf8_lossy(&plain).into_owned())
            .unwrap_or_default();
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

        let _ = b64;
        String::new()
    }
}

#[cfg(target_os = "macos")]
mod keychain {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};
    use security_framework::passwords::{get_generic_password, set_generic_password};
    use std::sync::OnceLock;

    const SERVICE: &str = "Aciron Launcher";
    const ACCOUNT: &str = "token-key";

    const NOT_FOUND: i32 = -25300;
    const NONCE_LEN: usize = 12;

    fn key() -> Option<&'static [u8; 32]> {
        static KEY: OnceLock<Option<[u8; 32]>> = OnceLock::new();
        KEY.get_or_init(load_or_create).as_ref()
    }

    fn load_or_create() -> Option<[u8; 32]> {
        match get_generic_password(SERVICE, ACCOUNT) {
            Ok(bytes) => bytes.try_into().ok(),
            Err(e) if e.code() == NOT_FOUND => {
                let key: [u8; 32] = rand::random();
                set_generic_password(SERVICE, ACCOUNT, &key).ok()?;
                Some(key)
            }

            Err(_) => None,
        }
    }

    pub fn seal(plain: &[u8]) -> Option<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(key()?).ok()?;
        let nonce: [u8; NONCE_LEN] = rand::random();
        let mut out = nonce.to_vec();
        out.extend(cipher.encrypt(Nonce::from_slice(&nonce), plain).ok()?);
        Some(out)
    }

    pub fn open(data: &[u8]) -> Option<Vec<u8>> {
        if data.len() <= NONCE_LEN {
            return None;
        }
        let (nonce, sealed) = data.split_at(NONCE_LEN);
        let cipher = Aes256Gcm::new_from_slice(key()?).ok()?;
        cipher.decrypt(Nonce::from_slice(nonce), sealed).ok()
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
