import { useState } from "react";
import Modal from "./Modal";
import { migrateData } from "../api";
import { t } from "../i18n";

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

    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <Modal title={t("Перенос данных Aciron")} icon="fa-database" dismissible={false} onClose={() => {}}>
      <div className="p-5">
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2.5 text-sm text-accent">
          <i className="fa-solid fa-circle-info mt-0.5" />
          <span>
            {t(
              "Ваши данные (аккаунты, сборки, настройки) находятся в старом расположении. Они будут перенесены в папку лаунчера — так их не потеряет удаление старой папки."
            )}
          </span>
        </div>
        <p className="text-xs text-muted">
          {t("Перенос занимает мгновение. После него окно перезагрузится автоматически.")}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            onClick={run}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" />
                {t("Перенос…")}
              </>
            ) : (
              <>
                <i className="fa-solid fa-truck-fast" />
                {t("Перенести")}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
