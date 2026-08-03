import { useEffect, useRef, useState } from "react";
import { isTauri } from "../api";
import { cancelTask, legacyProgress, useTasks, type DlTask } from "../downloadTask";

type Prog = { op?: string; stage: string; message: string; current: number; total: number };

function Ring({ pct, done, doneColor }: { pct: number; done: boolean; doneColor: string }) {
  const R = 20;
  const CIRC = 2 * Math.PI * R;
  return (
    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={R} fill="none" stroke="var(--color-border)" strokeWidth="3.5" />
      <circle
        cx="24"
        cy="24"
        r={R}
        fill="none"
        stroke={done ? doneColor : "var(--color-accent)"}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - pct / 100)}
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

function TaskLine({ t }: { t: DlTask }) {
  const failed = t.cancelled || (t.done && t.ok === false);
  const icon = failed
    ? "fa-xmark text-[#ef4444]"
    : t.done
    ? "fa-check text-[#22c55e]"
    : "fa-spinner fa-spin text-accent";
  return (
    <div className="flex items-center gap-2">
      <i className={`fa-solid text-[10px] ${icon}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-text">{t.name}</div>
        <div className="truncate text-[11px] text-muted">
          {t.done ? t.message : t.total > 1 ? `${t.current} / ${t.total} файлов` : t.message}
        </div>
      </div>
      {!t.done && (
        <button
          onClick={() => cancelTask(t.id)}
          title="Отменить загрузку"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-muted transition-colors hover:bg-[#FF3535]/50 hover:text-white"
        >
          <i className="fa-solid fa-xmark text-[10px]" />
        </button>
      )}
    </div>
  );
}

export default function DownloadOrb({ abovePlayBar = false }: { abovePlayBar?: boolean }) {
  const tasks = useTasks();

  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const endedCancelled = useRef(false);
  if (tasks.length > 0) endedCancelled.current = tasks.every((t) => t.cancelled);

  useEffect(() => {
    if (tasks.length > 0) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 260);
    return () => clearTimeout(t);
  }, [tasks.length, mounted]);

  useEffect(() => {
    if (!isTauri) return;
    let un: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<Prog>("launch-progress", (ev) => {
        const p = ev.payload;
        legacyProgress(p.op ?? "", p.stage, p.message, p.current, p.total);
      }).then((u) => (un = u));
    });
    return () => un?.();
  }, []);

  if (!mounted) return null;

  const active = tasks.filter((t) => !t.done);
  const allDone = active.length === 0;

  const cancelled = tasks.length > 0 ? tasks.every((t) => t.cancelled) : endedCancelled.current;
  // Ошибка (t.ok===false) тоже красит орб в красный и ставит крест, а не галочку.
  const anyError = tasks.some((t) => t.done && t.ok === false);
  const bad = cancelled || anyError;
  const okColor = bad ? "#ef4444" : "#22c55e";

  // Кольцо заполняют ТОЛЬКО реальные многофайловые загрузки (total > 1). Одношаговые
  // этапы обработки (установка Forge, проверка Java, распаковка natives) идут с total<=1
  // и НЕ двигают кольцо — вместо этого показывается спиннер + подпись этапа, чтобы орб
  // не «висел» полным кружком минуту на постобработке. Поэтапность.
  const withTotal = tasks.filter((t) => t.total > 1);
  const cur = withTotal.reduce((s, t) => s + t.current, 0);
  const total = withTotal.reduce((s, t) => s + t.total, 0);
  const pct = allDone ? 100 : total > 0 ? Math.min(100, Math.round((cur / total) * 100)) : 0;

  return (
    <div

      className={`group fixed right-5 z-[80] flex items-center ${
        abovePlayBar ? "bottom-24" : "bottom-5"
      } ${leaving ? "orb-out" : "orb-in"}`}
    >
      {}
      <div className="pointer-events-auto mr-2 max-w-0 overflow-hidden rounded-2xl bg-panel/95 opacity-0 shadow-xl shadow-black/50 backdrop-blur transition-all duration-300 group-hover:max-w-[300px] group-hover:opacity-100">
        <div className="w-[300px] space-y-2 px-4 py-3">
          {tasks.map((t) => (
            <TaskLine key={t.id} t={t} />
          ))}
        </div>
      </div>

      <div className="relative grid h-12 w-12 shrink-0 place-items-center">
        {}
        <span
          className={`pointer-events-none absolute -inset-1 rounded-full blur-lg transition-colors ${
            allDone ? (bad ? "bg-[#ef4444]/30" : "bg-[#22c55e]/30") : "animate-pulse bg-accent/30"
          }`}
        />
        <div className="relative grid h-12 w-12 place-items-center rounded-full border border-border bg-panel shadow-xl shadow-black/50">
          <Ring pct={pct} done={allDone} doneColor={okColor} />
          {}
          {!allDone && total === 0 && (
            <span className="absolute inset-[3px] animate-spin rounded-full border-2 border-transparent border-t-accent/70" />
          )}
          <i
            className={`fa-solid text-sm transition-transform ${
              allDone
                ? bad
                  ? "fa-xmark scale-110 text-[#ef4444]"
                  : "fa-check scale-110 text-[#22c55e]"
                : "fa-cube text-accent"
            }`}
          />
        </div>

        {}
        {tasks.length > 1 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-bg">
            {tasks.length}
          </span>
        )}
      </div>
    </div>
  );
}
