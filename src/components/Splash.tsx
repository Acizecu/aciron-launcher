import { useEffect, useState } from "react";
import AcironLogo from "./AcironLogo";
import LoadingDots from "./LoadingDots";
import { buildInfo, getSettings, isTauri } from "../api";
import { t } from "../i18n";

const HARD_TIMEOUT_MS = 6000;

const READ_MS = 550;

export default function Splash() {
  const [status, setStatus] = useState(t("Проверка обновлений"));

  useEffect(() => {
    let finished = false;

    const done = async () => {
      if (finished) return;
      finished = true;
      try {
        const { getAllWebviewWindows, getCurrentWebviewWindow } = await import(
          "@tauri-apps/api/webviewWindow"
        );
        const all = await getAllWebviewWindows();
        const main = all.find((w) => w.label === "main");
        if (main) {
          await main.show();
          await main.setFocus();
        }
        await getCurrentWebviewWindow().close();
      } catch (e) {

        console.error("[splash] не удалось передать управление главному окну:", e);
      }
    };

    const guard = window.setTimeout(() => void done(), HARD_TIMEOUT_MS);

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
        setStatus(
          upd ? t("Найдено обновление v{version}", { version: upd.version }) : t("Актуальная версия")
        );
      } catch {

        setStatus(t("Не удалось проверить обновления"));
      } finally {
        window.setTimeout(() => void done(), READ_MS);
      }
    })();

    return () => window.clearTimeout(guard);
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-screen w-screen flex-col items-center justify-center gap-5 overflow-hidden border border-border bg-bg px-5"
    >
      <AcironLogo size={92} className="logo-glow" />

      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="flex items-center text-[12px] text-muted">
          {status}
          <LoadingDots className="ml-0.5" />
        </span>
      </div>
    </div>
  );
}
