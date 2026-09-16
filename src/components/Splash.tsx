import { useEffect, useState } from "react";
import AcironLogo from "./AcironLogo";
import LoadingDots from "./LoadingDots";
import { buildInfo, getSettings, isTauri, startedMinimized } from "../api";
import { t } from "../i18n";

const HARD_TIMEOUT_MS = 6000;

const READ_MS = 550;

type Phase = "checking" | "downloading" | "installing";

export default function Splash() {
  const [status, setStatus] = useState(t("Проверка обновлений"));
  const [phase, setPhase] = useState<Phase>("checking");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let finished = false;
    let guard = 0;

    const done = async () => {
      if (finished) return;
      finished = true;
      try {
        const { getAllWebviewWindows, getCurrentWebviewWindow } = await import(
          "@tauri-apps/api/webviewWindow"
        );
        const all = await getAllWebviewWindows();
        const main = all.find((w) => w.label === "main");

        if (main && !(await startedMinimized())) {
          await main.show();
          await main.setFocus();
        }
        await getCurrentWebviewWindow().close();
      } catch (e) {

        console.error("[splash] не удалось передать управление главному окну:", e);
      }
    };

    guard = window.setTimeout(() => void done(), HARD_TIMEOUT_MS);

    void (async () => {
      try {
        if (!isTauri) return;
        const info = await buildInfo();

        if (!info.updater_enabled) {
          setStatus(t("Локальная сборка"));
          return;
        }

        const s = await getSettings();
        if (!s.auto_update_check || s.dev_mode_disable_updates) {
          setStatus(t("Проверка обновлений отключена"));
          return;
        }

        const { check } = await import("@tauri-apps/plugin-updater");
        const upd = await check();
        if (!upd) {
          setStatus(t("Актуальная версия"));
          return;
        }

        const now = Math.floor(Date.now() / 1000);
        if (upd.version === s.skipped_update_version) {
          setStatus(t("Обновление пропущено"));
          return;
        }
        if (s.defer_update_until && now < s.defer_update_until) {
          setStatus(t("Обновление отложено"));
          return;
        }

        window.clearTimeout(guard);
        guard = 0;

        setPhase("downloading");
        setStatus(t("Загрузка v{version}", { version: upd.version }));
        let total = 0;
        let got = 0;
        await upd.downloadAndInstall((ev) => {
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
              setPhase("installing");
              setStatus(t("Установка"));
              break;
          }
        });

        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
        return;
      } catch {

        setPhase("checking");
        setStatus(t("Не удалось обновиться"));
      } finally {
        if (!finished) window.setTimeout(() => void done(), READ_MS);
      }
    })();

    return () => {
      if (guard) window.clearTimeout(guard);
    };
  }, []);

  const busy = phase === "downloading" || phase === "installing";

  return (
    <div
      data-tauri-drag-region
      className="flex h-screen w-screen flex-col items-center justify-center gap-5 overflow-hidden border border-border bg-bg px-5"
    >
      <AcironLogo size={92} className="logo-glow" />

      <div className="flex w-full flex-col items-center gap-2 text-center">
        <span className="flex items-center text-[12px] text-muted">
          {status}
          {}
          {!busy && <LoadingDots className="ml-0.5" />}
        </span>

        {busy && (
          <>
            <div className="h-1 w-full overflow-hidden rounded-full bg-card">
              {}
              <div
                className={
                  phase === "installing"
                    ? "splash-pulse h-full w-full bg-accent"
                    : "h-full bg-accent transition-[width] duration-200 ease-out"
                }
                style={phase === "installing" ? undefined : { width: `${pct}%` }}
              />
            </div>
            {phase === "downloading" && (
              <span className="text-[11px] tabular-nums text-muted">{pct}%</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
