import Modal from "./Modal";
import { t } from "../i18n";

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmIcon = "fa-trash-can",
  danger = true,
  onConfirm,
  onClose,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmIcon?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (

    <Modal title={title ?? t("Подтверждение")} icon="fa-triangle-exclamation" onClose={onClose}>
      <div className="p-5">
        <p className="text-sm text-text">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            {t("Отмена")}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors ${
              danger
                ? "bg-[#ef4444] text-white hover:bg-[#dc2626] active:bg-[#b91c1c]"
                : "bg-accent text-bg hover:bg-accent-hover active:bg-accent-active"
            }`}
          >
            <i className={`fa-solid ${confirmIcon} text-xs`} />
            {confirmLabel ?? t("Удалить")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
