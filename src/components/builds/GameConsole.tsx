import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gameLogTail, isTauri } from "../../api";
import LoadingDots from "../LoadingDots";
import { useLang } from "../../i18n";

export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

const LEVEL_STYLE: Record<LogLevel, string> = {
  error: "text-[#f87171]",
  warn: "text-[#fbbf24]",
  info: "text-text/85",
  debug: "text-muted",
  trace: "text-[#f87171]/70",
};

const LEVEL_BAR: Record<LogLevel, string> = {
  error: "bg-[#f87171]",
  warn: "bg-[#fbbf24]",
  info: "bg-transparent",
  debug: "bg-transparent",
  trace: "bg-[#f87171]/40",
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
  const { t } = useLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);

  const scroller = useRef<HTMLDivElement | null>(null);
  const counter = useRef(0);

  const add = (texts: string[]) =>
    setRows((prev) => {
      const next = [...prev];
      for (const line of texts)
        next.push({ n: counter.current++, text: line, level: levelOf(line) });

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
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-border/60 bg-card/35">
      {}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/50 bg-card/50 px-3 py-2">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                on ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {t(f.label)}
            </button>
          );
        })}

        {}
        {(counts.errors > 0 || counts.warns > 0) && (
          <span
            className="flex items-center gap-2 text-[11px] tabular-nums"
            title={t("Ошибок и предупреждений за сессию")}
          >
            {counts.errors > 0 && (
              <span className="flex items-center gap-1 text-[#f87171]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f87171]" />
                {counts.errors}
              </span>
            )}
            {counts.warns > 0 && (
              <span className="flex items-center gap-1 text-[#fbbf24]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" />
                {counts.warns}
              </span>
            )}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-7 items-center gap-1.5 rounded-lg bg-bg/60 px-2">
            <i className="fa-solid fa-magnifying-glass text-[10px] text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Поиск")}
              className="w-28 bg-transparent text-[11px] text-text outline-none placeholder:text-muted"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-muted transition-colors hover:text-text"
              >
                <i className="fa-solid fa-xmark text-[10px]" />
              </button>
            )}
          </div>
          <button
            onClick={() => setFollow((v) => !v)}
            title={
              follow
                ? t("Не прокручивать за новыми строками")
                : t("Прокручивать за новыми строками")
            }
            className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
              follow ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
            }`}
          >
            <i className="fa-solid fa-angles-down text-[11px]" />
          </button>
          <button
            onClick={copyAll}
            title={t("Скопировать показанное")}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:text-text"
          >
            <i className={`fa-solid ${copied ? "fa-check text-accent" : "fa-copy"} text-[11px]`} />
          </button>
        </div>
      </div>

      {}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;

          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="min-h-0 flex-1 overflow-auto bg-bg/45 py-1.5 font-mono text-[11px] leading-[1.55]"
      >
        {shown.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-[11px] text-muted">
            {rows.length === 0 ? (
              running ? (
                <span className="inline-flex items-center">
                  {t("Игра запускается")}
                  <LoadingDots className="ml-1" />
                </span>
              ) : (
                <span className="flex flex-col items-center gap-2">
                  <i className="fa-solid fa-terminal text-lg opacity-40" />
                  {t("Запустите игру, чтобы увидеть её вывод")}
                </span>
              )
            ) : (
              <span>{t("Под фильтр ничего не подходит")}</span>
            )}
          </div>
        ) : (
          shown.map((r) => (
            <div
              key={r.n}
              className={`group flex gap-2 px-2 transition-colors hover:bg-card/50 ${
                LEVEL_STYLE[r.level]
              }`}
            >
              <span className={`mt-[3px] w-[2px] shrink-0 rounded-full ${LEVEL_BAR[r.level]}`} />
              {}
              <span className="selectable min-w-0 flex-1 whitespace-pre-wrap break-all">
                {r.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
