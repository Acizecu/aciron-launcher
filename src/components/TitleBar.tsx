import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type BuildInfo,
  type Settings,
  buildInfo,
  getSettings,
  saveSettings,
  isTauri,
} from "../api";
import { APP_STAGE } from "../config";
import { useMaximized } from "../windowState";
import Modal from "./Modal";
import { LANGS, setLang, t, useLang, type Lang } from "../i18n";
import { useClickOutside } from "../hooks/useClickOutside";
import { LangFlag } from "./FlagIcons";

const appWindow = (() => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
})();

function LangPicker() {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  useClickOutside(box, () => setOpen(false));

  const pick = (id: Lang) => {
    setLang(id);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${cur.label} — ${t("сменить язык")}`}
        className={`flex h-6 items-center gap-1.5 rounded-md px-1.5 transition-colors ${
          open ? "bg-card" : "opacity-70 hover:opacity-100"
        }`}
      >
        <LangFlag lang={cur.id} size={18} />
        <i
          className={`fa-solid fa-chevron-down text-[8px] text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 pt-1.5">
          <div className="dropdown-in w-[150px] overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-xl shadow-black/50">
            {LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => pick(l.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ${
                  l.id === lang
                    ? "bg-accent/12 text-accent"
                    : "text-muted hover:bg-card hover:text-text"
                }`}
              >
                <LangFlag lang={l.id} size={18} />
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                {l.id === lang && <i className="fa-solid fa-check text-[9px]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type UpState = "idle" | "downloading" | "installing";

const DEFER_SECS = 24 * 60 * 60;

export default function TitleBar() {

  const [update, setUpdate] = useState<any>(null);
  const [state, setState] = useState<UpState>("idle");
  const [pct, setPct] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [bi, setBi] = useState<BuildInfo | null>(null);

  const maximized = useMaximized();

  const toggleMaximize = () => appWindow?.toggleMaximize().catch(() => {});

  useEffect(() => {
    if (!isTauri) return;
    let alive = true;
    (async () => {
      try {
        const info = await buildInfo();
        if (!alive) return;
        setBi(info);

        if (!info.updater_enabled) return;

        const s: Settings = await getSettings();
        if (!alive || !s.auto_update_check) return;
        if (s.dev_mode_disable_updates) return;

        const { check } = await import("@tauri-apps/plugin-updater");
        const upd = await check();
        if (!alive || !upd) return;

        const now = Math.floor(Date.now() / 1000);
        if (upd.version === s.skipped_update_version) return;
        if (s.defer_update_until && now < s.defer_update_until) return;

        setUpdate(upd);
      } catch (e) {
        console.error("[update] check failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runUpdate = async () => {
    if (!update || state !== "idle") return;
    setConfirmOpen(false);
    try {
      let total = 0;
      let got = 0;
      setState("downloading");
      setPct(0);
      await update.downloadAndInstall((ev: any) => {
        switch (ev.event) {
          case "Started":
            total = ev.data?.contentLength ?? 0;
            break;
          case "Progress":
            got += ev.data?.chunkLength ?? 0;
            if (total > 0) setPct(Math.min(100, Math.round((got / total) * 100)));
            break;
          case "Finished":
            setPct(100);
            setState("installing");
            break;
        }
      });

      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error("[update] install failed:", e);
      setState("idle");
      setPct(0);
    }
  };

  const deferUpdate = async () => {
    setConfirmOpen(false);
    try {
      const s = await getSettings();
      const now = Math.floor(Date.now() / 1000);
      await saveSettings({ ...s, defer_update_until: now + DEFER_SECS });
    } catch (e) {
      console.error("[update] defer failed:", e);
    }
    setUpdate(null);
  };

  const skipVersion = async () => {
    setConfirmOpen(false);
    try {
      const s = await getSettings();
      await saveSettings({ ...s, skipped_update_version: update?.version ?? "" });
    } catch (e) {
      console.error("[update] skip failed:", e);
    }
    setUpdate(null);
  };

  const busy = state !== "idle";
  const label =
    state === "downloading"
      ? `${pct}%`
      : state === "installing"
      ? t("Установка…")
      : `v${update?.version ?? ""}`;

  const isLocal = !bi || bi.channel === "local" || bi.dirty;
  const versionText = bi ? `v${bi.version}` : "";

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-9 shrink-0 items-center bg-bg"
    >
      <span
        data-tauri-drag-region
        className="pointer-events-none absolute inset-0 flex items-center mx-3 text-[13px] font-small tracking-wide text-text"
      >
        <div className="flex gap-1">
          <span className="text-gradient font-semibold">Aciron</span>
          <p className="text-muted">Launcher</p>
        </div>
      </span>

      {}
      <div className="ml-auto flex h-full items-center">
        {}
        {update && !isLocal && (
          <button
            onClick={() => (busy ? undefined : setConfirmOpen(true))}
            disabled={busy}
            title={
              busy
                ? t("Обновление устанавливается…")
                : t("Доступно обновление v{version}", { version: update.version })
            }
            className="mr-1 flex h-6 items-center gap-1.5 rounded-md bg-[#22c55e] px-2 text-xs font-bold text-black transition-colors hover:bg-[#16a34a] disabled:opacity-80"
          >
            <i
              className={`fa-solid ${
                busy ? "fa-spinner fa-spin" : "fa-download"
              } text-[11px]`}
            />
            {label}
          </button>
        )}

        {}
        <div className="mx-3 flex items-center gap-2">
          {}
          <LangPicker />
          {isLocal ? (
            <span
              title={t("Локальная сборка из исходников — автообновление отключено")}
              className="text-sm font-light text-amber-400 opacity-80"
            >
              {versionText}
              {bi?.dirty ? "+dirty" : "+local"} · LOCAL
            </span>
          ) : (
            <p className="text-sm font-light text-muted opacity-45">
              {}
              {versionText}
              {bi?.channel === "dev" ? " Dev" : APP_STAGE ? ` ${APP_STAGE}` : ""}
            </p>
          )}
        </div>
        {}
        <div className="flex h-full items-center">
        <button
          onClick={() => appWindow?.minimize()}
          aria-label={t("Свернуть")}
          className="grid h-9 w-9 place-items-center text-[#676767] transition-colors hover:bg-ctrl-hover rounded-md hover:text-text"
        >
          <svg width="15" height="2" viewBox="0 0 15 2" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1H14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          onClick={toggleMaximize}
          aria-label={maximized ? t("Восстановить") : t("Развернуть")}
          title={maximized ? t("Восстановить") : t("Развернуть")}
          className="grid h-9 w-9 place-items-center text-[#676767] transition-colors hover:bg-ctrl-hover rounded-md hover:text-text"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 1H4C2.34315 1 1 2.34315 1 4V11C1 12.6569 2.34315 14 4 14H11C12.6569 14 14 12.6569 14 11V4C14 2.34315 12.6569 1 11 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>

        </button>
        <button
          onClick={() => appWindow?.close()}
          aria-label={t("Закрыть")}
          className="grid h-9 w-9 place-items-center text-[#676767] transition-colors hover:bg-[#FF3535]/50 rounded-md hover:text-[#CDCDCD]"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1L14 14M1 14L14 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        </div>
      </div>

      {confirmOpen && update && (
        <Modal
          title={t("Доступно обновление")}
          subtitle={t("Версия v{version}", { version: update.version })}
          icon="fa-download"
          onClose={() => setConfirmOpen(false)}
        >
          <div className="pt-1">
            <p className="text-sm leading-relaxed text-text">
              {t("Обновление перезапустит лаунчер. Убедитесь, что игра не запущена.")}
            </p>
            {typeof update.body === "string" && update.body.trim() && (
              <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-card px-3 py-2 text-xs text-muted">
                {update.body}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={skipVersion}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {t("Не спрашивать про эту версию")}
              </button>
              <button
                onClick={deferUpdate}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent/50"
              >
                {t("Отложить")}
              </button>
              <button
                onClick={runUpdate}
                className="flex items-center gap-2 rounded-lg bg-[#22c55e] px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#16a34a]"
              >
                <i className="fa-solid fa-download" />
                {t("Обновить")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
