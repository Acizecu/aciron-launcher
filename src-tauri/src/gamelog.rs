

use serde::Serialize;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

const BUFFER_LINES: usize = 2000;

#[derive(Clone, Serialize)]
pub struct LogLine {

    pub game: String,
    pub text: String,
}

type Buffers = std::collections::HashMap<String, VecDeque<String>>;

fn buffers() -> &'static Mutex<Buffers> {
    static B: OnceLock<Mutex<Buffers>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(Buffers::new()))
}

fn push_line(game: &str, line: &str) {
    if let Ok(mut map) = buffers().lock() {
        let buf = map.entry(game.to_string()).or_default();
        if buf.len() >= BUFFER_LINES {
            buf.pop_front();
        }
        buf.push_back(line.to_string());
    }
}

/// Накопленный хвост лога — чтобы консоль, открытая позже, не была пустой.
#[tauri::command]
pub fn game_log_tail(game: String) -> Vec<String> {
    buffers()
        .lock()
        .ok()
        .and_then(|m| m.get(&game).map(|b| b.iter().cloned().collect()))
        .unwrap_or_default()
}

/// Забывает лог игры (при её закрытии буфер больше не нужен).
pub fn clear(game: &str) {
    if let Ok(mut m) = buffers().lock() {
        m.remove(game);
    }
}

/// Читает поток процесса: строка в файл, в буфер и событием во фронт.
///
/// Файл под мьютексом: stdout и stderr читают два потока, и без него строки
/// налезали бы друг на друга посреди записи.
pub fn pump<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    game: String,
    stream: R,
    file: Arc<Mutex<Option<std::fs::File>>>,
) {
    std::thread::spawn(move || {

        let mut reader = BufReader::new(stream);
        let mut raw = Vec::new();
        loop {
            raw.clear();
            match reader.read_until(b'\n', &mut raw) {
                Ok(0) => break,
                Ok(_) => {}
                Err(_) => break,
            }
            let line = String::from_utf8_lossy(&raw).trim_end().to_string();

            if let Ok(mut f) = file.lock() {
                if let Some(f) = f.as_mut() {
                    let _ = writeln!(f, "{line}");
                }
            }
            push_line(&game, &line);
            let _ = app.emit(
                "game-log",
                LogLine {
                    game: game.clone(),
                    text: line,
                },
            );
        }
    });
}
