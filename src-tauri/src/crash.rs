

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const REPORT_URL: &str = match option_env!("ACIRON_REPORT_URL") {
    Some(u) => u,
    None => "",
};

const REPORT_TOKEN: &str = match option_env!("ACIRON_PROXY_TOKEN") {
    Some(t) => t,
    None => "",
};

const MAX_PER_DAY: u32 = 5;

const SAME_FP_COOLDOWN: u64 = 24 * 60 * 60;

const MIN_GAP: u64 = 60;

const QUEUE_LIMIT: usize = 20;

const MAX_AGE: u64 = 14 * 24 * 60 * 60;

const MAX_ATTEMPTS: u32 = 5;

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn queue_dir() -> PathBuf {
    crate::settings::data_root().join("crash-reports")
}

fn state_file() -> PathBuf {
    queue_dir().join("state.json")
}

#[derive(Default, Serialize, Deserialize)]
struct State {

    day: u64,
    sent_today: u32,

    last_sent: u64,

    seen: std::collections::HashMap<String, u64>,

    #[serde(default)]
    pending: std::collections::HashMap<String, u32>,
}

fn load_state() -> State {
    std::fs::read_to_string(state_file())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_state(s: &State) {
    if let Ok(txt) = serde_json::to_string(s) {
        let _ = crate::atomic::write(&state_file(), &txt);
    }
}

struct Secret {
    needle: String,
    tag: &'static str,
    /// Заменять только целое слово.
    ///
    /// Для путей это не нужно — они длинные и уникальны. А вот имя пользователя
    /// бывает коротким и обычным словом: у человека по имени Max сообщение
    /// «Maximum memory» превращалось в «<user>imum memory», у Ann «cannot» — в
    /// «c<user>ot». Отчёт становился нечитаемым ровно у тех, чей сбой он и
    /// должен объяснить, а отпечаток такого сбоя переставал совпадать с общим.
    whole_word: bool,
}

fn secrets() -> &'static Vec<Secret> {
    static S: OnceLock<Vec<Secret>> = OnceLock::new();
    S.get_or_init(|| {
        let mut v: Vec<Secret> = Vec::new();
        let mut push = |val: String, tag: &'static str, whole_word: bool| {
            if val.len() >= 3 {
                v.push(Secret { needle: val, tag, whole_word });
            }
        };
        if let Some(d) = dirs::home_dir() {
            push(d.to_string_lossy().into_owned(), "<home>", false);
        }
        for var in ["USERPROFILE", "LOCALAPPDATA", "APPDATA"] {
            if let Ok(val) = std::env::var(var) {
                push(val, "<home>", false);
            }
        }
        push(
            crate::settings::data_root().to_string_lossy().into_owned(),
            "<data>",
            false,
        );
        // Имя пользователя вычищаем последним: оно короткое и входит в пути,
        // которые мы уже заменили целиком.
        for var in ["USERNAME", "COMPUTERNAME"] {
            if let Ok(val) = std::env::var(var) {
                push(val, "<user>", true);
            }
        }
        v.sort_by_key(|s| std::cmp::Reverse(s.needle.len()));
        v
    })
}

/// Похожа ли последовательность на токен: длинная сплошная строка из
/// base64/hex-алфавита. Такие в тексте ошибки берутся только из заголовков и
/// ответов сервиса, и осмысленным словом не бывают.
fn looks_secret(word: &str) -> bool {
    word.len() >= 32
        && word
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '+' || c == '/' || c == '=')
        && word.chars().any(|c| c.is_ascii_digit())
}

/// Вычистка личного из свободного текста.
///
/// Это последний рубеж, а не единственный: отчёт и так собирается из белого
/// списка полей, и целиком ни `Settings`, ни `Account` в него не попадают
/// никогда. Но текст паники и стек JS приходят какими есть, и в них регулярно
/// оказывается путь с именем пользователя (`io::Error` от запуска java печатает
/// его целиком), иногда — почта из сообщения сервиса.
pub fn scrub(text: &str) -> String {
    let out = scrub_paths(text);

    // Почта и «похожее на секрет». Это самая грубая часть чистки: она вырезает
    // ЛЮБОЕ длинное сплошное слово из base64-алфавита. Для короткого текста
    // ошибки это ровно то, что надо, а для лога игры — перебор: там так
    // выглядят и хэши модов, и uuid. Лог поэтому чистится отдельно, см.
    // logshare.rs, и берёт только scrub_paths.
    out.split_inclusive(|c: char| c.is_whitespace())
        .map(|chunk| {
            let word = chunk.trim();
            let tail = &chunk[word.len()..];
            if word.contains('@') && word.contains('.') && !word.contains("://") {
                return format!("<email>{tail}");
            }
            if looks_secret(word.trim_matches(|c: char| !c.is_ascii_alphanumeric())) {
                return format!("<redacted>{tail}");
            }
            chunk.to_string()
        })
        .collect()
}

/// Только пути и имя пользователя — без вырезания «похожего на секрет».
///
/// Вынесено отдельно ради публикации лога игры (logshare.rs): путь с именем
/// человека убрать оттуда обязательно, а вот глушить каждое длинное слово
/// нельзя — лог перестанет читаться.
pub fn scrub_paths(text: &str) -> String {
    let mut out = text.to_string();

    // 1. Точные подстановки — надёжнее любой регулярки.
    for s in secrets() {
        if s.needle.is_empty() {
            continue;
        }
        out = replace_ci(&out, &s.needle, s.tag, s.whole_word);
        // Тот же путь мог прийти с прямыми слэшами или с удвоенными.
        let alt = s.needle.replace('\\', "/");
        if alt != s.needle {
            out = replace_ci(&out, &alt, s.tag, s.whole_word);
        }
        let dbl = s.needle.replace('\\', "\\\\");
        if dbl != s.needle {
            out = replace_ci(&out, &dbl, s.tag, s.whole_word);
        }
    }

    // 2. Добивка по остатку: путь вида C:\Users\<кто-то>\… мог прийти и от
    //    чужого процесса, чьё имя в наших переменных не значится.
    scrub_user_paths(&out)
}

/// Совпадают ли символы без учёта регистра.
///
/// Сравниваем посимвольно и НЕ строим `to_lowercase()`-копию всей строки. У
/// некоторых букв нижний регистр занимает другое число символов (немецкая ß →
/// «ss», турецкая İ → «i» с точкой), из-за чего индексы копии и оригинала
/// разъезжаются — а замена по таким индексам начинает резать текст не там, где
/// нашла. Имя пользователя Windows вполне может быть и немецким, и турецким.
fn ci_eq(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

/// Позиция подстроки без учёта регистра, в символах.
fn find_ci(hay: &[char], needle: &[char], from: usize) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }
    (from..=hay.len() - needle.len())
        .find(|&i| needle.iter().zip(&hay[i..]).all(|(n, h)| ci_eq(*n, *h)))
}

/// Граница слова: соседний символ не буква и не цифра.
///
/// Подчёркивание и дефис считаем частью слова — `vasya_pupkin` и `vasya-pc` это
/// одно имя, а не имя рядом с чем-то.
fn word_edge(c: Option<&char>) -> bool {
    match c {
        None => true,
        Some(c) => !c.is_alphanumeric() && *c != '_' && *c != '-',
    }
}

fn replace_ci(haystack: &str, needle: &str, tag: &str, whole_word: bool) -> String {
    let hay: Vec<char> = haystack.chars().collect();
    let ndl: Vec<char> = needle.chars().collect();
    let mut out = String::with_capacity(haystack.len());
    let mut i = 0usize;
    let mut from = 0usize;
    while let Some(at) = find_ci(&hay, &ndl, from) {
        let end = at + ndl.len();
        // Совпадение посреди слова пропускаем: см. Secret::whole_word.
        if whole_word
            && !(word_edge(at.checked_sub(1).and_then(|p| hay.get(p))) && word_edge(hay.get(end)))
        {
            from = at + 1;
            continue;
        }
        out.extend(&hay[i..at]);
        out.push_str(tag);
        i = end;
        from = end;
    }
    out.extend(&hay[i..]);
    out
}

/// `C:\Users\Вася\...` → `C:\Users\<user>\...`. Ловит и `/home/`, и `/Users/`.
fn scrub_user_paths(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let markers: [Vec<char>; 3] = [
        "\\users\\".chars().collect(),
        "/users/".chars().collect(),
        "/home/".chars().collect(),
    ];
    let mut out = String::with_capacity(text.len());

    let mut i = 0usize;
    'outer: while i < chars.len() {
        for m in &markers {
            if i + m.len() <= chars.len()
                && m.iter().zip(&chars[i..]).all(|(a, b)| ci_eq(*a, *b))
            {
                out.extend(&chars[i..i + m.len()]);
                i += m.len();

                let mut skipped = false;
                while i < chars.len()
                    && chars[i] != '\\'
                    && chars[i] != '/'
                    && !chars[i].is_whitespace()
                {
                    i += 1;
                    skipped = true;
                }
                if skipped {
                    out.push_str("<user>");
                }
                continue 'outer;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

// ---------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------

/// Всё, что уходит наружу. Полный список — здесь и больше нигде.
///
/// Чего в нём НЕТ и не будет: ника, uuid и токенов аккаунта, почты, путей к
/// папкам игры, списка друзей, переписки, адресов серверов, содержимого
/// settings.json.
#[derive(Serialize, Deserialize, Clone)]
pub struct Report {
    /// Что случилось: "panic" | "js" | "settings" | "command".
    pub kind: String,
    /// Отпечаток — одинаковые сбои схлопываются по нему.
    pub fingerprint: String,
    pub message: String,
    /// Бэктрейс или стек — уже вычищенный.
    pub details: String,
    /// Где именно (модуль, файл:строка) — для паники.
    pub location: String,

    pub version: String,
    pub channel: String,
    pub git_sha: String,
    pub dirty: bool,

    pub os: String,
    pub arch: String,
    pub ram_mb: u32,
    pub cores: u32,
    /// Только факт наличия Java. Путь к ней почти всегда содержит имя человека.
    pub java: bool,
    /// Язык интерфейса — это выбор, а не персональные данные.
    pub language: String,

    pub at: u64,
    /// Сколько раз этот же сбой повторился с прошлой отправки.
    pub repeats: u32,
    /// Сколько раз пробовали отправить.
    #[serde(default)]
    pub attempts: u32,
}

/// Отпечаток сбоя: одинаковые падения должны схлопнуться в одно сообщение, а не
/// залить канал. Числа, адреса и пути из текста выкидываем — иначе каждый
/// запуск давал бы новый отпечаток и схлопывать было бы нечего.
fn fingerprint(kind: &str, message: &str, location: &str) -> String {
    let norm: String = message
        .chars()
        .map(|c| if c.is_ascii_digit() { '#' } else { c })
        .collect();
    let mut h = Sha256::new();
    h.update(kind.as_bytes());
    h.update(env!("CARGO_PKG_VERSION").as_bytes());
    h.update(norm.as_bytes());
    h.update(location.as_bytes());
    format!("{:x}", h.finalize())[..16].to_string()
}

/// Версия Windows из реестра. GetVersionEx без манифеста врёт, а RtlGetVersion
/// потребовал бы новой фичи windows-sys; реестр уже подключён (update.rs) и
/// говорит правду.
#[cfg(windows)]
fn os_name() -> String {
    let cur = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    let product = reg_read(cur, "ProductName").unwrap_or_else(|| "Windows".into());
    let display = reg_read(cur, "DisplayVersion").unwrap_or_default();
    let build = reg_read(cur, "CurrentBuild").unwrap_or_default();
    let mut s = product;
    if !display.is_empty() {
        s.push(' ');
        s.push_str(&display);
    }
    if !build.is_empty() {
        s.push_str(" (");
        s.push_str(&build);
        s.push(')');
    }
    s
}

#[cfg(not(windows))]
fn os_name() -> String {
    std::env::consts::OS.to_string()
}

#[cfg(windows)]
fn reg_read(subkey: &str, name: &str) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
    };

    let wide = |s: &str| -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };
    unsafe {
        let mut hkey: HKEY = std::ptr::null_mut();
        if RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            wide(subkey).as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        ) != ERROR_SUCCESS
        {
            return None;
        }
        let name_w = wide(name);
        let mut buf = [0u16; 256];
        let mut len = (buf.len() * 2) as u32;
        let rc = RegQueryValueExW(
            hkey,
            name_w.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            buf.as_mut_ptr() as *mut u8,
            &mut len,
        );
        RegCloseKey(hkey);
        if rc != ERROR_SUCCESS {
            return None;
        }
        let chars = (len as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..chars.min(buf.len())]))
    }
}

/// Собрать отчёт. Всё, что может не получиться, не получается тихо: эта функция
/// вызывается в том числе из panic-хука, и падение внутри неё означало бы
/// падение процесса без единого следа.
fn build(kind: &str, message: &str, details: &str, location: &str) -> Report {
    let bi = crate::update::build_info();
    // Настройки читаем ОСТОРОЖНО: из panic-хука дергать load_settings нельзя —
    // она умеет искать java и создавать папки. Берём только язык, и только с
    // уже прогретого кэша, если он есть.
    let language = crate::settings::cached_language();

    let msg = scrub(message);
    let loc = scrub(location);
    Report {
        fingerprint: fingerprint(kind, &msg, &loc),
        kind: kind.to_string(),
        message: msg,
        details: scrub(details),
        location: loc,
        version: bi.version,
        channel: bi.channel,
        git_sha: bi.git_sha,
        dirty: bi.dirty,
        os: os_name(),
        arch: std::env::consts::ARCH.to_string(),
        ram_mb: crate::settings::total_ram_mb(),
        cores: std::thread::available_parallelism()
            .map(|n| n.get() as u32)
            .unwrap_or(0),
        java: crate::settings::java_present(),
        language,
        at: now(),
        repeats: 0,
        attempts: 0,
    }
}

/// Включена ли отправка — зеркало тумблера настроек.
///
/// Отдельным атомарным флагом, а не чтением настроек: `record` зовут в том числе
/// из panic-хука, а `load_settings` умеет искать Java и создавать папки —
/// делать такое в умирающем процессе нельзя. Значение выставляет
/// [`set_enabled`] при старте и при каждом сохранении настроек.
///
/// Начальное значение — как дефолт настройки: до первого чтения настроек
/// лаунчер ведёт себя так, будто отправка включена. Окно это микроскопическое,
/// и оно закрыто с другой стороны: [`flush`] проверяет флаг ещё раз, а
/// выключение тумблера стирает всю очередь.
static ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, std::sync::atomic::Ordering::Relaxed);
}

fn enabled() -> bool {
    ENABLED.load(std::sync::atomic::Ordering::Relaxed)
}

/// Положить отчёт в очередь на диске.
///
/// Именно на диск, а не сразу в сеть: паника случается за миллисекунды до того,
/// как процесс кончится, и HTTP-запрос завершиться не успеет. Отправкой
/// занимается [`flush`] при следующем запуске.
///
/// При выключенном тумблере не пишем НИЧЕГО. Копить «на случай, если включат»
/// нельзя: человек нажал «не отправлять», а накопленное за это время уехало бы
/// при первом же включении — то есть ровно то, от чего он отказался.
pub fn record(kind: &str, message: &str, details: &str, location: &str) {
    if REPORT_URL.is_empty() || !enabled() {
        return;
    }
    let dir = queue_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let rep = build(kind, message, details, location);

    // Тот же сбой уже лежит в очереди — не плодим файлы, растим счётчик.
    if let Some((path, mut existing)) = queued()
        .into_iter()
        .find(|(_, r)| r.fingerprint == rep.fingerprint)
    {
        existing.repeats += 1;
        existing.at = rep.at;
        if let Ok(txt) = serde_json::to_string(&existing) {
            let _ = crate::atomic::write(&path, &txt);
        }
        return;
    }

    trim_queue();
    let path = dir.join(format!("{}-{}.json", rep.at, rep.fingerprint));
    if let Ok(txt) = serde_json::to_string(&rep) {
        let _ = crate::atomic::write(&path, &txt);
    }
}

/// Что лежит в очереди, от старого к новому.
fn queued() -> Vec<(PathBuf, Report)> {
    let mut out: Vec<(PathBuf, Report)> = std::fs::read_dir(queue_dir())
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .filter(|p| p.file_name().and_then(|n| n.to_str()) != Some("state.json"))
        .filter_map(|p| {
            let txt = std::fs::read_to_string(&p).ok()?;
            let r: Report = serde_json::from_str(&txt).ok()?;
            Some((p, r))
        })
        .collect();
    out.sort_by_key(|(_, r)| r.at);
    out
}

/// Выбрасываем протухшее и лишнее, чтобы папка не росла бесконечно.
fn trim_queue() {
    let list = queued();
    let cutoff = now().saturating_sub(MAX_AGE);
    let mut alive: Vec<&(PathBuf, Report)> = Vec::new();
    for item in &list {
        if item.1.at < cutoff {
            let _ = std::fs::remove_file(&item.0);
        } else {
            alive.push(item);
        }
    }
    while alive.len() >= QUEUE_LIMIT {
        let old = alive.remove(0);
        let _ = std::fs::remove_file(&old.0);
    }
}

// ---------------------------------------------------------------------------
// Отправка
// ---------------------------------------------------------------------------

fn http() -> Option<reqwest::Client> {
    static C: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    C.get_or_init(|| {
        let mut h = reqwest::header::HeaderMap::new();
        if let Ok(v) = reqwest::header::HeaderValue::from_str(REPORT_TOKEN) {
            h.insert("X-Aciron-Key", v);
        }
        reqwest::Client::builder()
            .user_agent(format!("AcironLauncher/{}", env!("CARGO_PKG_VERSION")))
            .default_headers(h)
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(15))
            .build()
            .ok()
    })
    .clone()
}

async fn send_one(cl: &reqwest::Client, rep: &Report) -> Result<(), bool> {
    let resp = cl
        .post(REPORT_URL)
        .json(&json!(rep))
        // Приёмник кладёт это в Discord. Текст паники может содержать «@everyone»,
        // и упоминание оттуда разошлось бы по всему серверу.
        .send()
        .await
        // true — «попробовать ещё когда-нибудь», false — «выбросить».
        .map_err(|_| true)?;

    let code = resp.status().as_u16();
    if resp.status().is_success() {
        return Ok(());
    }
    // 4xx (кроме 429) — отчёт приёмнику не нравится и не понравится: выбрасываем,
    // иначе он будет крутиться в очереди вечно.
    Err(code == 429 || code >= 500)
}

/// Чем кончился разбор очереди. Двух чисел хватает, чтобы сказать человеку
/// правду: «ушло N» и «M таких сбоев мы уже присылали».
#[derive(Serialize, Default, Clone, Copy)]
pub struct FlushResult {
    pub sent: usize,
    /// Отброшено как повтор недавно отправленного.
    pub skipped: usize,
}

/// Разобрать очередь. Вызывается при запуске и по кнопке в настройках.
///
/// `manual` — человек нажал «Отправить» сам: тогда суточный лимит и пауза между
/// отправками не применяются (он и так знает, что делает), но проверка «этот
/// сбой уже отправляли» остаётся.
///
/// Тумблер проверяется в ОБОИХ случаях. Раньше ручная отправка его обходила — и
/// кнопка «Отправить» под выключенным тумблером слала наружу ровно то, от чего
/// человек отказался.
pub async fn flush(manual: bool) -> FlushResult {
    let mut res = FlushResult::default();
    if REPORT_URL.is_empty() || !enabled() {
        return res;
    }
    let Some(cl) = http() else { return res };

    let mut st = load_state();
    let today = now() / 86_400;
    if st.day != today {
        st.day = today;
        st.sent_today = 0;
    }

    for (path, mut rep) in queued() {
        if !manual {
            if st.sent_today >= MAX_PER_DAY {
                break;
            }
            if now().saturating_sub(st.last_sent) < MIN_GAP && st.last_sent > 0 {
                break;
            }
        }
        // Этот сбой уже отправляли недавно. Файл убираем, но счётчик повторов
        // запоминаем: иначе «упало ещё двадцать раз» терялось бы вместе с
        // файлом, а это самое ценное, что есть в повторе.
        if let Some(when) = st.seen.get(&rep.fingerprint) {
            if now().saturating_sub(*when) < SAME_FP_COOLDOWN {
                *st.pending.entry(rep.fingerprint.clone()).or_insert(0) += rep.repeats + 1;
                let _ = std::fs::remove_file(&path);
                res.skipped += 1;
                continue;
            }
        }
        // Повторы, накопленные с прошлой отправки, уезжают вместе с отчётом.
        if let Some(extra) = st.pending.remove(&rep.fingerprint) {
            rep.repeats += extra;
        }

        match send_one(&cl, &rep).await {
            Ok(()) => {
                let _ = std::fs::remove_file(&path);
                st.seen.insert(rep.fingerprint.clone(), now());
                st.last_sent = now();
                st.sent_today += 1;
                res.sent += 1;
            }
            Err(retry) => {
                rep.attempts += 1;
                if !retry || rep.attempts >= MAX_ATTEMPTS {
                    let _ = std::fs::remove_file(&path);
                } else if let Ok(txt) = serde_json::to_string(&rep) {
                    let _ = crate::atomic::write(&path, &txt);
                }
                // Сеть или приёмник не в порядке — остальные не полетят тем более.
                break;
            }
        }
    }

    // Список отпечатков не должен расти вечно.
    let cutoff = now().saturating_sub(SAME_FP_COOLDOWN * 7);
    st.seen.retain(|_, when| *when > cutoff);
    st.pending.retain(|fp, _| st.seen.contains_key(fp));
    save_state(&st);
    res
}

// ---------------------------------------------------------------------------
// Ловушки
// ---------------------------------------------------------------------------

/// Ставится ПЕРВОЙ строкой запуска — раньше, чем что-либо может упасть.
///
/// Внутри хука нельзя ни паниковать (второй раз — это abort), ни ходить в сеть,
/// ни делать что-то долгое: процесс, возможно, уже умирает. Только сформировать
/// строку и записать файл.
pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = match info.payload().downcast_ref::<&str>() {
            Some(s) => (*s).to_string(),
            None => info
                .payload()
                .downcast_ref::<String>()
                .cloned()
                .unwrap_or_else(|| "паника без сообщения".into()),
        };
        let loc = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();
        let bt = std::backtrace::Backtrace::force_capture().to_string();
        // Бэктрейс целиком бывает в сотни килобайт — хватает верхушки.
        let bt: String = bt.lines().take(60).collect::<Vec<_>>().join("\n");

        record("panic", &msg, &bt, &loc);
        // Прежний хук — чтобы в отладке паника по-прежнему печаталась.
        prev(info);
    }));
}

// ---------------------------------------------------------------------------
// Команды фронта
// ---------------------------------------------------------------------------

/// Ошибка из интерфейса: белый экран React, необработанное исключение, отказ
/// промиса. С той стороны сети нет — только текст.
#[tauri::command]
pub fn crash_report_js(message: String, stack: String, source: String) {
    record("js", &message, &stack, &source);
}

/// Сколько отчётов ждут отправки.
#[tauri::command]
pub fn crash_reports_pending() -> usize {
    queued().len()
}

/// Что именно уйдёт наружу — читаемым текстом.
///
/// Это не украшение. Пока показать нечего, «анонимно» остаётся словом, которое
/// человеку предлагают принять на веру.
#[tauri::command]
pub fn crash_report_preview() -> String {
    // Именно первый, а не последний: flush идёт по очереди с начала, и человек
    // должен увидеть тот отчёт, который уйдёт, а не какой-то другой.
    match queued().into_iter().next() {
        Some((_, r)) => serde_json::to_string_pretty(&r).unwrap_or_default(),
        None => {
            // Очередь пуста — показываем то, что ушло бы, случись сбой прямо
            // сейчас: окружение видно, а сбоя ещё нет.
            let mut sample = build(
                "panic",
                "пример: сюда попадёт текст ошибки",
                "пример: сюда попадёт место, где она случилась",
                "src/example.rs:1:1",
            );
            sample.fingerprint = "—".into();
            serde_json::to_string_pretty(&sample).unwrap_or_default()
        }
    }
}

/// Отправить накопленное вручную.
#[tauri::command]
pub async fn crash_reports_send() -> FlushResult {
    flush(true).await
}

/// Забыть всё накопленное.
#[tauri::command]
pub fn crash_reports_clear() {
    for (path, _) in queued() {
        let _ = std::fs::remove_file(path);
    }
}

/// Папка с отчётами — чтобы человек мог посмотреть файлы глазами.
#[tauri::command]
pub fn crash_reports_dir() -> String {
    queue_dir().to_string_lossy().into_owned()
}

/// Настроен ли приёмник в этой сборке. В локальной сборке из исходников его
/// нет, и показывать там тумблер незачем.
#[tauri::command]
pub fn crash_reports_available() -> bool {
    !REPORT_URL.is_empty()
}

/// Путь к очереди — нужен settings.rs, чтобы удалить её при выключении тумблера.
pub fn queue_path() -> PathBuf {
    queue_dir()
}

/// Удалить всё накопленное (вызывается при выключении тумблера).
pub fn purge(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn имя_пользователя_в_пути_вырезается() {
        let got = scrub_paths(r"не открылся C:\Users\Вася\AppData\file.txt");
        assert!(!got.contains("Вася"), "{got}");
        assert!(got.contains("<user>"), "{got}");
        assert!(got.contains("AppData"), "хвост пути потерялся: {got}");
    }

    #[test]
    fn регистр_и_прямые_слэши() {
        assert!(!scrub_paths(r"c:/users/Petya/x").contains("Petya"));
        assert!(!scrub_paths(r"C:\USERS\Petya\x").contains("Petya"));
        assert!(!scrub_paths("/home/petya/x").contains("petya"));
    }

    #[test]
    fn немецкая_буква_не_ломает_индексы() {
        // Ловушка, ради которой замена делается посимвольно: у ß нижний регистр
        // занимает ДВА символа, и индексы lowercase-копии разъезжаются с
        // оригиналом. Строка обязана остаться целой.
        let got = scrub_paths(r"C:\Users\GROSS\a  strasse  konец");
        assert!(got.contains("konец"), "хвост потерялся: {got}");
        assert!(!got.contains("GROSS"), "{got}");
    }

    #[test]
    fn почта_и_токен_вырезаются() {
        let got = scrub("вход не удался для vasya@example.com");
        assert!(!got.contains("vasya@example.com"), "{got}");
        let got = scrub("заголовок abcdefghijklmnop1234567890ABCDEFGH конец");
        assert!(got.contains("<redacted>"), "{got}");
        assert!(got.contains("конец"), "{got}");
    }

    #[test]
    fn обычный_текст_не_портится() {
        let s = "Игра закрылась с кодом 1";
        assert_eq!(scrub(s), s);
    }

    #[test]
    fn короткое_имя_не_режет_обычные_слова() {
        // Ловушка, ради которой заведён whole_word: при имени пользователя «Max»
        // строка «Maximum memory» превращалась в «<user>imum memory», а «cannot»
        // при имени «Ann» — в «c<user>ot». Отчёт становился нечитаемым ровно у
        // тех, чей сбой он и должен объяснить.
        assert_eq!(replace_ci("Maximum memory", "Max", "<user>", true), "Maximum memory");
        assert_eq!(replace_ci("cannot open", "ann", "<user>", true), "cannot open");
        // Отдельным словом — вырезаем.
        assert_eq!(replace_ci("user Max failed", "Max", "<user>", true), "user <user> failed");
        assert_eq!(replace_ci("Max/skins", "Max", "<user>", true), "<user>/skins");
    }

    #[test]
    fn для_путей_границы_слова_не_требуются() {
        // Путь длинный и уникальный: резать его надо где встретился.
        assert_eq!(
            replace_ci("xxC:/Users/a/byy", "C:/Users/a/b", "<home>", false),
            "xx<home>yy"
        );
    }

    #[test]
    fn отпечаток_не_зависит_от_чисел() {
        // Иначе каждый запуск давал бы новый отпечаток, и схлопывать одинаковые
        // сбои было бы нечего.
        let a = fingerprint("panic", "не найден файл 12345", "src/a.rs:10:1");
        let b = fingerprint("panic", "не найден файл 99999", "src/a.rs:10:1");
        assert_eq!(a, b);
        let c = fingerprint("panic", "другая ошибка", "src/a.rs:10:1");
        assert_ne!(a, c);
    }
}
