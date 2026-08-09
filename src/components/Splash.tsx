import { useEffect, useState } from "react";
import AcironLogo from "./AcironLogo";
import { buildInfo, getSettings, isTauri } from "../api";
import { t } from "../i18n";

const HARD_TIMEOUT_MS = 8000;

const READ_MS = 450;

const STEPS = 3;

const MIN_PCT = 10;

export default function Splash() {
  const [status, setStatus] = useState(t("Запуск"));
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let finished = false;
    let appReady = false;
    let checkDone = false;

    const handOver = async (): Promise<boolean> => {
      if (finished) return true;
      const { WebviewWindow, getCurrentWebviewWindow } = await import(
        "@tauri-apps/api/webviewWindow"
      );
      const main = await WebviewWindow.getByLabel("main");
      if (!main) return false;
      await main.show();
      await main.setFocus();
      finished = true;

      await getCurrentWebviewWindow().close();
      return true;
    };

    const done = () => {
      if (finished) return;
      void handOver().then((ok) => {
        if (ok) return;

        setFailed(true);
        setStatus(t("Не удалось открыть окно лаунчера"));
      });
    };

    const maybeDone = () => {
      if (checkDone && appReady) window.setTimeout(done, READ_MS);
    };

    const guard = window.setTimeout(done, HARD_TIMEOUT_MS);

    let unlisten: (() => void) | undefined;
    void (async () => {
      if (!isTauri) return;
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("app-ready", () => {
        appReady = true;
        setStep((s) => Math.max(s, 2));
        maybeDone();
      });
    })();

    void (async () => {
      try {
        if (!isTauri) {
          appReady = true;
          return;
        }
        setStatus(t("Проверка обновлений"));
        const info = await buildInfo();
        setStep((s) => Math.max(s, 1));

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
        setStatus(
          upd ? t("Найдено обновление v{version}", { version: upd.version }) : t("Актуальная версия")
        );
      } catch {

        setStatus(t("Не удалось проверить обновления"));
      } finally {
        checkDone = true;
        setStep(STEPS);
        maybeDone();
      }
    })();

    return () => {
      window.clearTimeout(guard);
      unlisten?.();
    };
  }, []);

  const pct = Math.round((Math.min(step, STEPS) / STEPS) * 100);

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-screen w-screen flex-col items-center justify-center gap-5 overflow-hidden rounded-[16px] border border-border bg-bg px-6"
    >
      {}
      <button
        onClick={() => void import("@tauri-apps/plugin-process").then(({ exit }) => exit(0))}
        title={t("Закрыть")}
        aria-label={t("Закрыть")}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-[#FF3535]/50 hover:text-white"
      >
        <i className="fa-solid fa-xmark text-xs" />
      </button>

      <AcironLogo size={88} className="logo-glow" />

      <div className="w-full">
        {}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-card">
          <div
            className={`relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out ${
              failed ? "bg-[#ef4444]" : "progress-shine progress-accent"
            }`}
            style={{ width: `${failed ? 100 : Math.max(pct, MIN_PCT)}%` }}
          />
        </div>
        <div
          className={`mt-2 text-center text-[11px] leading-tight ${
            failed ? "text-[#f87171]" : "text-muted"
          }`}
        >
          {status}
        </div>
      </div>
    </div>
  );
}
