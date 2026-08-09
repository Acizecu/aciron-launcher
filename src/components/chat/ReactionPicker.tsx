import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker from "./EmojiPicker";
import Twemoji from "./Twemoji";
import { t } from "../../i18n";

const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"];

export default function ReactionPicker({
  current,
  onPick,
}: {

  current: string;
  onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      setPos({ left: b.left, top: b.top });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setFull(false);
  };

  const pick = (emoji: string) => {
    onPick(emoji);
    close();
  };

  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((v) => !v)}
        title={t("Реакция")}
        className={`grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-muted transition ${
          open ? "bg-card text-accent opacity-100" : "opacity-0 group-hover:opacity-100"
        } hover:bg-card hover:text-accent`}
      >
        <i className="fa-regular fa-face-smile text-[13px]" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={close} />
            {}
            <div
              className="fixed z-[9999]"
              style={(() => {
                const s = (window as unknown as { __acironScale?: number }).__acironScale || 1;
                return {
                  left: pos.left,
                  top: pos.top,
                  transform: `scale(${s})`,
                  transformOrigin: "bottom left",
                };
              })()}
            >
              {full ? (
                <div className="relative">
                  <EmojiPicker onPick={pick} onClose={close} />
                </div>
              ) : (
                <div className="dropdown-in absolute bottom-0 left-0 mb-1 flex items-center gap-0.5 rounded-full border border-border bg-panel px-1.5 py-1 shadow-xl shadow-black/50">
                  {QUICK.map((e) => (
                    <button
                      key={e}
                      onClick={() => pick(e)}
                      className={`grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-125 ${
                        e === current ? "bg-accent/20" : ""
                      }`}
                    >
                      <Twemoji text={e} />
                    </button>
                  ))}
                  <button
                    onClick={() => setFull(true)}
                    title={t("Ещё эмодзи")}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-card hover:text-text"
                  >
                    <i className="fa-solid fa-plus text-[11px]" />
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
