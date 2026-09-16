

use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

const LOG_URL: &str = match option_env!("ACIRON_LOG_URL") {
    Some(u) => u,
    None => "",
};

const LOG_TOKEN: &str = match option_env!("ACIRON_PROXY_TOKEN") {
    Some(t) => t,
    None => "",
};

const HEAD_KEEP: usize = 512 * 1024;
const TAIL_KEEP: usize = 1536 * 1024;

#[derive(Serialize, Clone)]
pub struct SharedLog {
    pub id: String,
    pub url: String,

    pub expires_at: i64,
}

fn http() -> Option<reqwest::Client> {
    static C: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    C.get_or_init(|| {
        let mut h = reqwest::header::HeaderMap::new();
        if let Ok(v) = reqwest::header::HeaderValue::from_str(LOG_TOKEN) {
            h.insert("X-Aciron-Key", v);
        }
        reqwest::Client::builder()
            .user_agent(format!("AcironLauncher/{}", env!("CARGO_PKG_VERSION")))
            .default_headers(h)
            .connect_timeout(Duration::from_secs(8))

            .timeout(Duration::from_secs(60))
            .build()
            .ok()
    })
    .clone()
}

fn log_path(game_id: &str) -> PathBuf {
    let dir = match game_id.strip_prefix("build:") {
        Some(build_id) => crate::builds::build_dir(build_id),
        None => PathBuf::from(crate::settings::load_settings().game_dir),
    };
    dir.join("logs").join("aciron-latest.log")
}

fn clamp(text: &str) -> String {
    if text.len() <= HEAD_KEEP + TAIL_KEEP {
        return text.to_string();
    }
    let mut head = HEAD_KEEP;
    while head > 0 && !text.is_char_boundary(head) {
        head -= 1;
    }
    let mut tail = text.len() - TAIL_KEEP;
    while tail < text.len() && !text.is_char_boundary(tail) {
        tail += 1;
    }
    let skipped = tail - head;
    format!(
        "{}\n\n… {} KB skipped from the middle of the log …\n\n{}",
        &text[..head],
        skipped / 1024,
        &text[tail..]
    )
}

fn mask_after(text: &str, keys: &[&str]) -> String {

    let mut out = text.to_string();
    for key in keys {
        let mut result = String::with_capacity(out.len());
        let mut rest = out.as_str();
        loop {
            let Some(at) = find_ci_ascii(rest, key) else {
                result.push_str(rest);
                break;
            };
            let after = at + key.len();
            result.push_str(&rest[..after]);

            let b = rest.as_bytes();

            let mut i = after;
            while i < b.len() && matches!(b[i], b' ' | b'=' | b':' | b',' | b'"' | b'\'') {
                i += 1;
            }
            let value_start = i;

            while i < b.len()
                && !b[i].is_ascii_whitespace()
                && !matches!(b[i], b'"' | b',' | b']')
            {
                i += 1;
            }
            if i > value_start {

                result.push_str(&rest[after..value_start]);
                result.push_str("<redacted>");
            } else {

                result.push_str(&rest[after..i]);
            }
            rest = &rest[i..];
        }
        out = result;
    }
    out
}

fn find_ci_ascii(hay: &str, needle: &str) -> Option<usize> {
    let (h, n) = (hay.as_bytes(), needle.as_bytes());
    if n.is_empty() || n.len() > h.len() {
        return None;
    }
    (0..=h.len() - n.len())
        .find(|&i| h[i..i + n.len()].eq_ignore_ascii_case(n))
}

pub fn clean(raw: &str) -> String {

    let text = crate::crash::scrub_paths(&clamp(raw));
    mask_after(
        &text,
        &[
            "--accessToken",
            "accessToken",
            "access_token",
            "--session",
            "sessionId",
            "Bearer",
            "--clientToken",
            "aciron_token",
            "refresh_token",
        ],
    )
}

#[tauri::command]
pub fn log_share_available() -> bool {
    !LOG_URL.is_empty()
}

#[tauri::command]
pub fn log_share_size(game_id: String) -> (usize, usize) {
    match std::fs::read_to_string(log_path(&game_id)) {
        Ok(raw) => {
            let cleaned = clean(&raw);
            (cleaned.lines().count(), cleaned.len())
        }
        Err(_) => (0, 0),
    }
}

#[tauri::command]
pub async fn log_share(game_id: String) -> Result<SharedLog, String> {
    if LOG_URL.is_empty() {
        return Err("Log sharing is not configured in this build".into());
    }
    let path = log_path(&game_id);
    let raw = std::fs::read(&path).map_err(|_| {
        "Log not found. It appears after the game starts and is stored in the logs folder.".to_string()
    })?;
    if raw.is_empty() {
        return Err("The log is empty, nothing to share".into());
    }

    let text = clean(&String::from_utf8_lossy(&raw));

    let bi = crate::update::build_info();
    let (mc_version, loader) = match game_id.strip_prefix("build:") {
        Some(id) => crate::builds::get_build(id)
            .map(|b| (b.mc_version, b.loader))
            .unwrap_or_default(),
        None => (game_id.clone(), String::new()),
    };

    let cl = http().ok_or("Couldn't prepare the connection")?;
    let resp = cl
        .post(format!("{}/api/upload", LOG_URL.trim_end_matches('/')))
        .json(&serde_json::json!({
            "log": text,
            "meta": {
                "launcher": bi.version,
                "channel": bi.channel,
                "mc_version": mc_version,
                "loader": loader,
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "ram_mb": crate::settings::load_settings().ram_mb,
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Couldn't send the log: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("The log service returned an error: {}", resp.status()));
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Unexpected service response: {e}"))?;

    let id = v["id"].as_str().unwrap_or_default().to_string();
    if id.is_empty() {
        return Err("The service did not return a link".into());
    }
    Ok(SharedLog {
        url: v["url"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}/{id}", LOG_URL.trim_end_matches('/'))),
        id,
        expires_at: v["expires_at"].as_i64().unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_is_removed_with_its_value() {
        let got = mask_after("args [--accessToken, eyJhbGci.QUJD.sig, --uuid]", &["--accessToken"]);
        assert!(!got.contains("eyJhbGci"), "token is still there: {got}");
        assert!(got.contains("--accessToken"), "key name was lost: {got}");
        assert!(got.contains("--uuid"), "line tail was lost: {got}");
    }

    #[test]
    fn key_case_does_not_matter() {
        let got = mask_after("SESSIONID=abcdef123456", &["sessionId"]);
        assert!(!got.contains("abcdef"), "{got}");
    }

    #[test]
    fn key_without_value_keeps_line_intact() {

        let got = mask_after("no Bearer\nnext line", &["Bearer"]);
        assert_eq!(got, "no Bearer\nnext line");
    }

    #[test]
    fn several_occurrences_in_a_row() {
        let got = mask_after("accessToken=aaa11111 x accessToken=bbb22222", &["accessToken"]);
        assert!(!got.contains("aaa11111") && !got.contains("bbb22222"), "{got}");
        assert_eq!(got.matches("<redacted>").count(), 2, "{got}");
    }

    #[test]
    fn cyrillic_in_line_is_not_cut() {

        let got = mask_after("мод сломался accessToken=zzz99999 конец", &["accessToken"]);
        assert!(got.starts_with("мод сломался"), "{got}");
        assert!(got.ends_with("конец"), "{got}");
    }

    #[test]
    fn middle_is_cut_with_marker() {
        let big = "a".repeat(HEAD_KEEP + TAIL_KEEP + 100_000);
        let got = clamp(&big);
        assert!(got.len() < big.len());
        assert!(got.contains("skipped"), "no truncation marker");
    }

    #[test]
    fn short_log_is_left_alone() {
        let s = "two\nlines";
        assert_eq!(clamp(s), s);
    }

    #[test]
    fn truncation_does_not_split_a_character() {

        let big = "я".repeat(HEAD_KEEP + TAIL_KEEP);
        let _ = clamp(&big);
    }
}
