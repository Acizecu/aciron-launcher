

use serde::Serialize;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const BUFFER_LINES: usize = 2000;

/// Как часто таймер сбрасывает накопленные строки во фронт.
/// ~60 мс — незаметно для глаза, но за это окно тысячи строк старта
/// схлопываются в одно IPC-событие вместо тысяч.
const FLUSH_INTERVAL: Duration = Duration::from_millis(60);
/// Порог по количеству строк: даже внутри окна не копим слишком много —
/// чтобы при экстремальном спаме батч не разрастался без границ.
const FLUSH_MAX_LINES: usize = 512;

/// Событие лога: пачка строк одной игры за один IPC-переход.
/// Раньше эмитилась одна `LogLine` на строку (шторм IPC + `game.clone()`
/// на каждую строку); теперь `game` клонируется один раз на пачку.
/// Фронт (`GameConsole.add`) уже принимает массив строк — маппится 1:1.
#[derive(Clone, Serialize)]
pub struct LogBatch {
    pub game: String,
    pub lines: Vec<String>,
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

/// Отдаёт накопленную пачку во фронт одним событием и очищает буфер.
/// `game` клонируется только при непустой пачке (максимум раз в FLUSH_INTERVAL).
fn flush(app: &AppHandle, game: &str, pending: &Mutex<Vec<String>>) {
    let batch = {
        let Ok(mut p) = pending.lock() else { return };
        if p.is_empty() {
            return;
        }
        std::mem::take(&mut *p)
    };
    let _ = app.emit(
        "game-log",
        LogBatch {
            game: game.to_string(),
            lines: batch,
        },
    );
}

/// Читает поток процесса: строка в файл, в буфер и (пачкой) событием во фронт.
///
/// Файл под мьютексом: stdout и stderr читают два потока, и без него строки
/// налезали бы друг на друга посреди записи.
///
/// Строки копятся в `pending` и уходят во фронт пачками: фоновый таймер
/// сбрасывает их раз в FLUSH_INTERVAL, а читающий поток — по достижении
/// FLUSH_MAX_LINES. Это убирает шторм IPC-событий (тысячи строк/сек при
/// старте Minecraft превращаются в единицы событий/сек) и клонов `game`.
/// Порядок строк внутри потока сохраняется — пачка эмитится в порядке чтения.
/// Файл и хвостовой буфер по-прежнему пишутся построчно, чтобы поведение
/// `game_log_tail` и логфайла осталось 1-в-1.
pub fn pump<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    game: String,
    stream: R,
    file: Arc<Mutex<Option<std::fs::File>>>,
) {
    let pending: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    // Сигнал таймеру завершиться после EOF, чтобы поток не висел вечно.
    let done = Arc::new(AtomicBool::new(false));

    // Фоновый таймер: периодический флаш непустой пачки. Гарантирует, что
    // строки уходят во фронт даже когда поток затих (читающий поток заблокирован
    // в read_until), а накопленный хвост уже не пуст.
    {
        let app = app.clone();
        let game = game.clone();
        let pending = pending.clone();
        let done = done.clone();
        std::thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                std::thread::sleep(FLUSH_INTERVAL);
                flush(&app, &game, &pending);
            }
            // Финальный флаш на случай строк, добавленных прямо перед завершением.
            flush(&app, &game, &pending);
        });
    }

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

            // Копим строку в пачку; если набралось много — сбрасываем сразу,
            // не дожидаясь таймера (быстрый бёрст не должен раздувать буфер).
            let should_flush = {
                if let Ok(mut p) = pending.lock() {
                    p.push(line);
                    p.len() >= FLUSH_MAX_LINES
                } else {
                    false
                }
            };
            if should_flush {
                flush(&app, &game, &pending);
            }
        }
        // EOF: финальный флаш хвоста и остановка таймера.
        flush(&app, &game, &pending);
        done.store(true, Ordering::Relaxed);
    });
}
