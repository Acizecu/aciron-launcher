import Modal from "./Modal";
import { t } from "../i18n";
import Icon from "./Icon";

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
      <div className="pt-1">
        <p className="text-[14px] leading-relaxed text-text2">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            {t("Отмена")}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`btn ${danger ? "btn-danger" : "btn-accent"}`}
          >
            <Icon cls={`fa-solid ${confirmIcon} text-[15px]`} />
            {confirmLabel ?? t("Удалить")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
