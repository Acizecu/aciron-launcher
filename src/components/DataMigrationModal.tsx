import { useState } from "react";
import Modal from "./Modal";
import { migrateData } from "../api";
import { t } from "../i18n";
import Icon from "./Icon";

export default function DataMigrationModal() {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    window.dispatchEvent(
      new CustomEvent("aciron-task-start", { detail: { name: t("Перенос данных") } })
    );
    try {
      await migrateData();
    } catch {
      window.dispatchEvent(new CustomEvent("aciron-task-end"));
    }

    setTimeout(async () => {
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch {
        window.location.reload();
      }
    }, 800);
  };

  return (
    <Modal title={t("Перенос данных Aciron")} icon="fa-database" dismissible={false} onClose={() => {}}>
      <div className="pt-1">
        <div className="mb-3 flex items-start gap-2 rounded-[12px] border border-accent/25 bg-accent/10 px-3 py-2.5 text-sm text-accent">
          <Icon cls="fa-solid fa-circle-info mt-0.5" />
          <span>
            {t(
              "Ваши данные (аккаунты, сборки, настройки) находятся в старом расположении. Они будут перенесены в папку лаунчера — так их не потеряет удаление старой папки."
            )}
          </span>
        </div>
        <p className="text-[12.5px] text-muted">
          {t("Перенос занимает мгновение. После него окно перезагрузится автоматически.")}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={run}
            disabled={busy}
            className="btn btn-accent"
          >
            {busy ? (
              <>
                <Icon cls="fa-solid fa-spinner fa-spin" />
                {t("Перенос…")}
              </>
            ) : (
              <>
                <Icon cls="fa-solid fa-truck-fast" />
                {t("Перенести")}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
