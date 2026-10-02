import { useEffect, useRef, useState } from "react";
import Modal from "../Modal";
import LoadingDots from "../LoadingDots";
import Icon from "../Icon";
import { MAX_MESSAGE } from "../../api";
import { t, useLang } from "../../i18n";

export default function ImageSendModal({
  preview,
  name,
  caption: initialCaption,
  replyTo,
  onSend,
  onClose,
}: {

  preview: string | null;
  name?: string;
  caption: string;

  replyTo?: string | null;
  onSend: (caption: string) => void;
  onClose: () => void;
}) {
  useLang();
  const [caption, setCaption] = useState(initialCaption);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const over = caption.length > MAX_MESSAGE;

  useEffect(() => {
    input.current?.focus();
  }, []);

  const send = () => {
    if (!preview || over) return;
    onSend(caption.trim());
  };

  return (
    <Modal
      title={t("Отправить картинку")}
      subtitle={name}
      onClose={onClose}
      width="max-w-[520px]"
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            {t("Отмена")}
          </button>
          <button onClick={send} disabled={!preview || over} className="btn btn-accent">
            <Icon cls="fa-solid fa-paper-plane text-[13px]" />
            {t("Отправить")}
          </button>
        </>
      }
    >
      <div className="chat-checker relative grid min-h-[160px] place-items-center overflow-hidden rounded-[14px] ring-1 ring-line">
        {preview ? (
          <img
            src={preview}
            alt=""
            draggable={false}
            onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="max-h-[46vh] w-auto max-w-full object-contain"
          />
        ) : (
          <LoadingDots />
        )}
        {size && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums text-white/85">
            {size.w}×{size.h}
          </span>
        )}
      </div>

      {replyTo && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <Icon cls="fa-solid fa-reply text-[11px] text-accent" />
          {t("Ответ для {name}", { name: replyTo })}
        </div>
      )}

      <input
        ref={input}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={t("Добавить подпись")}
        className="mt-3 h-11 w-full rounded-[14px] bg-raised px-3.5 text-[14px] text-text outline-none ring-1 ring-transparent transition-shadow placeholder:text-muted focus:ring-accent/40"
      />
      {over && (
        <div className="mt-2 text-[12px] text-danger">
          {t("Слишком длинное: {n} из {max}", { n: caption.length, max: MAX_MESSAGE })}
        </div>
      )}
    </Modal>
  );
}
