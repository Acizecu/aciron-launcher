import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gameLogTail, isTauri } from "../../api";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const LEVEL_STYLE: Record<LogLevel, string> = {
  error: "text-[#f87171]",
  warn: "text-[#fbbf24]",
  info: "text-text",
  debug: "text-muted",
  trace: "text-[#f87171]/70",
};

const FILTERS: { id: LogLevel | "all"; label: string }[] = [
  { id: "all", label: "Всё" },
  { id: "error", label: "Ошибки" },
  { id: "warn", label: "Предупреждения" },
  { id: "info", label: "Информация" },
  { id: "debug", label: "Отладка" },
];

export function levelOf(line: string): LogLevel {

  if (/^\s+(at\s|\.\.\.\s)/.test(line) || /^Caused by:/.test(line)) return "trace";

  const m = line.match(/\[[^\]]*\/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]/i);
  if (m) {
    const tag = m[1].toUpperCase();
    if (tag === "ERROR" || tag === "FATAL") return "error";
    if (tag === "WARN") return "warn";
    if (tag === "DEBUG" || tag === "TRACE") return "debug";
    return "info";
  }

  if (/^[\w.$]+(Exception|Error)\b/.test(line)) return "error";
  return "info";
}

type Row = { n: number; text: string; level: LogLevel };

export default function GameConsole({ gameId, running }: { gameId: string; running: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);

  const scroller = useRef<HTMLDivElement | null>(null);
  const counter = useRef(0);

  const add = (texts: string[]) =>
    setRows((prev) => {
      const next = [...prev];
      for (const t of texts) next.push({ n: counter.current++, text: t, level: levelOf(t) });

      return next.length > 5000 ? next.slice(next.length - 5000) : next;
    });

  useEffect(() => {
    setRows([]);
    counter.current = 0;
    let dead = false;
    let off: (() => void) | undefined;

    void gameLogTail(gameId)
      .then((lines) => !dead && add(lines))
      .catch(() => {});

    if (isTauri) {
      void (async () => {
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen<{ game: string; lines: string[] }>("game-log", (e) => {
          if (e.payload.game === gameId) add(e.payload.lines);
        });
        if (dead) un();
        else off = un;
      })();
    }
    return () => {
      dead = true;
      off?.();
    };

  }, [gameId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {

      if (filter !== "all") {
        const ok = r.level === filter || (filter === "error" && r.level === "trace");
        if (!ok) return false;
      }
      return !q || r.text.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  useLayoutEffect(() => {
    if (!follow) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, follow]);

  const counts = useMemo(() => {
    let errors = 0;
    let warns = 0;
    for (const r of rows) {
      if (r.level === "error") errors++;
      else if (r.level === "warn") warns++;
    }
    return { errors, warns };
  }, [rows]);

  const copyAll = () => {
    void navigator.clipboard.writeText(shown.map((r) => r.text).join("\n"));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-bg">
      {}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${running ? "bg-[#4ade80]" : "bg-muted"}`}
          title={running ? "Игра запущена" : "Игра не запущена"}
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
                filter === f.id ? "bg-accent text-bg" : "text-muted hover:text-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по логу"
          className="ml-auto h-7 w-40 rounded-lg border border-border bg-card px-2 text-[11px] text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />

        <span className="text-[11px] text-muted" title="Ошибок и предупреждений за сессию">
          <span className="text-[#f87171]">{counts.errors}</span>
          {" / "}
          <span className="text-[#fbbf24]">{counts.warns}</span>
        </span>

        <button
          onClick={() => setFollow((v) => !v)}
          title={follow ? "Не прокручивать за новыми строками" : "Прокручивать за новыми строками"}
          className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
            follow ? "text-accent" : "text-muted hover:text-text"
          }`}
        >
          <i className="fa-solid fa-angles-down text-[11px]" />
        </button>
        <button
          onClick={copyAll}
          title="Скопировать показанное"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
        >
          <i className="fa-solid fa-copy text-[11px]" />
        </button>
      </div>

      {}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;

          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-[1.45]"
      >
        {shown.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-muted">
            <span>
              {rows.length === 0
                ? running
                  ? "Игра запускается — строки появятся здесь"
                  : "Запустите игру, чтобы увидеть её вывод"
                : "Под фильтр ничего не подходит"}
            </span>
          </div>
        ) : (
          shown.map((r) => (
            <div key={r.n} className={`whitespace-pre-wrap break-all ${LEVEL_STYLE[r.level]}`}>
              {r.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
