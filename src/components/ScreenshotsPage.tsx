import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import {
  cachedScreenshotThumb,
  isTauri,
  screenshotDelete,
  screenshotFull,
  screenshotOpen,
  screenshotReveal,
  screenshotsList,
  screenshotThumb,
  type Screenshot,
} from "../api";
import { dtf, t, useLang } from "../i18n";
import { useToast } from "../ToastContext";
import ConfirmModal from "./ConfirmModal";
import Icon from "./Icon";

const PAGE = 90;
const key = (s: Screenshot) => `${s.instanceId}/${s.file}`;

function instanceLabel(s: Screenshot): string {
  return s.instanceId === "vanilla" ? t("Обычные версии") : s.instanceName || t("Сборка");
}

function Thumb({ shot, onOpen }: { shot: Screenshot; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement | null>(null);
  const [src, setSrc] = useState<string | null | undefined>(() => cachedScreenshotThumb(shot));

  useEffect(() => {
    if (src !== undefined) return;
    const el = box.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        void screenshotThumb(shot).then((v) => alive && setSrc(v));
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [shot, src]);

  return (
    <button
      ref={box}
      onClick={onOpen}
      title={shot.file}
      className="group relative aspect-video overflow-hidden rounded-[14px] bg-raised ring-1 ring-line transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.35)] focus-visible:ring-accent"
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted">
          <Icon cls={src === null ? "fa-regular fa-image text-xl" : "fa-solid fa-spinner fa-spin"} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-6 text-left text-[11.5px] text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
        {dtf({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(shot.takenAt)}
      </span>
    </button>
  );
}

function Viewer({
  shots,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  shots: Screenshot[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: (s: Screenshot) => void;
}) {
  const shot = shots[index];
  const [src, setSrc] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setSrc(cachedScreenshotThumb(shot) ?? null);
    screenshotFull(shot)
      .then((v) => alive && setSrc(v))
      .catch(() => alive && toast(t("Снимок не найден — возможно, его удалили"), "error"));
    return () => {
      alive = false;
    };
  }, [shot, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < shots.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, shots.length, onIndex, onClose]);

  const act = (f: () => Promise<void>) => void f().catch((e) => toast(String(e), "error"));

  return createPortal(

    <div className="fixed inset-0 z-40 flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center gap-3 px-5 py-3 text-white/85" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-white">{instanceLabel(shot)}</div>
          <div className="text-[12px] text-white/60">
            {dtf({ day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
              shot.takenAt
            )}
            {" · "}
            {index + 1} / {shots.length}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost text-white/85" onClick={() => act(() => screenshotOpen(shot))}>
          <Icon cls="fa-solid fa-up-right-from-square" /> {t("Открыть")}
        </button>
        <button className="btn btn-sm btn-ghost text-white/85" onClick={() => act(() => screenshotReveal(shot))}>
          <Icon cls="fa-solid fa-folder-open" /> {t("В папке")}
        </button>
        <button className="btn btn-sm btn-ghost text-white/85" onClick={() => onDelete(shot)}>
          <Icon cls="fa-solid fa-trash-can" /> {t("Удалить")}
        </button>
        <button className="btn btn-sm btn-ghost btn-icon text-white/85" onClick={onClose} title={t("Закрыть")}>
          <Icon cls="fa-solid fa-xmark text-[16px]" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-[10px] object-contain shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          />
        ) : (
          <Icon cls="fa-solid fa-spinner fa-spin text-2xl text-white/70" />
        )}
        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            title={t("Назад")}
            className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <Icon cls="fa-solid fa-chevron-left" />
          </button>
        )}
        {index < shots.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            title={t("Дальше")}
            className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <Icon cls="fa-solid fa-chevron-right" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function ScreenshotsPage() {
  useLang();
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [query, setQuery] = useState("");
  const [instance, setInstance] = useState<string>("all");
  const [grouped, setGrouped] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [view, setView] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Screenshot | null>(null);
  const toast = useToast();
  const sentinel = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => setShots(await screenshotsList()), []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => !document.hidden && void load(), 60_000);
    let un: (() => void) | undefined;
    let alive = true;
    if (isTauri) {

      void listen("game-exited", () => void load()).then((f) => (alive ? (un = f) : f()));
    }
    return () => {
      alive = false;
      window.clearInterval(timer);
      un?.();
    };
  }, [load]);

  const instances = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const s of shots ?? []) {
      const cur = m.get(s.instanceId) ?? { label: instanceLabel(s), count: 0 };
      cur.count++;
      m.set(s.instanceId, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [shots]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shots ?? []).filter((s) => {
      if (instance !== "all" && s.instanceId !== instance) return false;
      if (!q) return true;
      const date = dtf({ day: "numeric", month: "long", year: "numeric" }).format(s.takenAt).toLowerCase();
      return s.file.toLowerCase().includes(q) || instanceLabel(s).toLowerCase().includes(q) || date.includes(q);
    });
  }, [shots, query, instance]);

  useEffect(() => setLimit(PAGE), [query, instance, grouped]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    if (!grouped) return [{ id: "all", label: "", items: visible }];
    const m = new Map<string, { id: string; label: string; items: Screenshot[] }>();
    for (const s of visible) {
      if (!m.has(s.instanceId)) m.set(s.instanceId, { id: s.instanceId, label: instanceLabel(s), items: [] });
      m.get(s.instanceId)!.items.push(s);
    }
    return [...m.values()];
  }, [visible, grouped]);

  const indexOf = (s: Screenshot) => filtered.findIndex((x) => key(x) === key(s));

  const remove = async (s: Screenshot) => {
    try {
      await screenshotDelete(s);
      setShots((list) => (list ?? []).filter((x) => key(x) !== key(s)));
      setView((v) => {
        if (v === null) return null;
        const left = filtered.length - 1;
        return left <= 0 ? null : Math.min(v, left - 1);
      });
      toast(t("Снимок удалён"), "info");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-text">{t("Скриншоты")}</h1>
        {shots && <span className="text-[13px] text-muted">{shots.length}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGrouped((g) => !g)}
            title={grouped ? t("Показать общей лентой") : t("Сгруппировать по сборкам")}
            className={`btn btn-sm ${grouped ? "btn-secondary" : "btn-ghost"}`}
          >
            <Icon cls="fa-solid fa-layer-group" /> {t("По сборкам")}
          </button>
          <div className="field-wrap flex h-10 w-[240px] items-center gap-2 px-3.5">
            <Icon cls="fa-solid fa-magnifying-glass text-[12.5px] text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Поиск по сборке, дате, файлу")}
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
        </div>
      </div>

      {instances.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setInstance("all")}
            className={`tag cursor-pointer ${instance === "all" ? "tag-ok" : ""}`}
          >
            {t("Все")} · {shots?.length ?? 0}
          </button>
          {instances.map(([id, v]) => (
            <button
              key={id}
              onClick={() => setInstance(id)}
              className={`tag cursor-pointer ${instance === id ? "tag-ok" : ""}`}
            >
              {v.label} · {v.count}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
        {shots === null ? (
          <div className="grid h-full place-items-center text-muted">
            <Icon cls="fa-solid fa-spinner fa-spin" />
          </div>
        ) : shots.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div className="max-w-xs">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-[18px] bg-white/[0.04] text-xl text-accent">
                <Icon cls="fa-solid fa-camera" />
              </div>
              <p className="text-sm text-muted">
                {t("Скриншотов пока нет. В игре нажмите F2 — снимок появится здесь.")}
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted">{t("Ничего не нашлось")}</div>
        ) : (
          groups.map((g) => (
            <section key={g.id} className="mb-6">
              {grouped && (
                <h2 className="mb-2.5 flex items-center gap-2 text-[14px] font-medium text-text2">
                  <Icon cls={g.id === "vanilla" ? "fa-solid fa-cube" : "fa-solid fa-cubes"} />
                  {g.label}
                </h2>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {g.items.map((s) => (
                  <Thumb key={key(s)} shot={s} onOpen={() => setView(indexOf(s))} />
                ))}
              </div>
            </section>
          ))
        )}
        {filtered.length > limit && <div ref={sentinel} className="h-8" />}
      </div>

      {view !== null && filtered[view] && (
        <Viewer
          shots={filtered}
          index={view}
          onIndex={setView}
          onClose={() => setView(null)}
          onDelete={(s) => setConfirm(s)}
        />
      )}
      {confirm && (
        <ConfirmModal
          title={t("Удалить снимок?")}
          message={t("Файл {file} будет удалён с диска.", { file: confirm.file })}
          onConfirm={() => void remove(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
