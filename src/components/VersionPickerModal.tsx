import { useState } from "react";
import Modal from "./Modal";
import VersionList from "./VersionList";
import { installModpackContent, type ModHit, type ModVersion, type SourceId } from "../api";
import { useToast } from "../ToastContext";
import { t, ts } from "../i18n";

export default function VersionPickerModal({
  pack,
  source = "modrinth",
  onClose,
  onInstalled,
}: {
  pack: ModHit;
  source?: SourceId;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const pick = async (v: ModVersion) => {
    if (busy) return;
    setBusy(v.id);

    window.dispatchEvent(
      new CustomEvent("aciron-task-start", { detail: { name: pack.title } })
    );
    try {
      await installModpackContent(source, pack.project_id, v.id);
      toast(
        t("Сборка «{title}» ({version}) установлена", {
          title: pack.title,
          version: v.version_number,
        }),
        "success"
      );
      onInstalled();
      onClose();
    } catch (e) {
      window.dispatchEvent(new CustomEvent("aciron-task-end"));
      toast(ts(String(e)), "error");
      setBusy(null);
    }
  };

  return (
    <Modal
      title={t("Версии сборки — {title}", { title: pack.title })}
      icon="fa-layer-group"
      onClose={onClose}
    >
      <div className="max-h-[60vh] overflow-y-auto p-4">
        <p className="mb-3 text-xs text-muted">
          {t("Выберите версию — она установится как отдельная сборка.")}
        </p>
        <VersionList
          source={source}
          projectId={pack.project_id}
          actionLabel={t("Скачать")}
          showFilters
          busyId={busy}
          onPick={pick}
        />
      </div>
    </Modal>
  );
}
