import { useCallback, useRef, useState } from "react";
import EmojiPicker, { rememberEmoji } from "./EmojiPicker";
import FloatingPanel from "../FloatingPanel";
import Twemoji from "./Twemoji";
import { t } from "../../i18n";
import Icon from "../Icon";

const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀"];

export default function ReactionPicker({
  current,
  onPick,
  mine = false,
}: {

  current: string;
  onPick: (emoji: string) => void;

  mine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setFull(false);
  }, []);

  const pick = (emoji: string) => {
    rememberEmoji(emoji);
    onPick(emoji);
    close();
  };

  return (
    <>
      <button
        ref={btn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          setFull(false);
        }}
        title={t("Реакция")}
        aria-expanded={open}
        className={`grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-muted transition ${
          open ? "bg-white/[0.04] text-accent opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        } hover:bg-white/[0.05] hover:text-accent`}
      >
        <Icon cls="fa-regular fa-face-smile text-[13px]" />
      </button>

      <FloatingPanel anchor={btn} open={open} onClose={close} side="top" align={mine ? "end" : "start"}>
        {full ? (
          <EmojiPicker onPick={pick} />
        ) : (
          <div className="flex items-center gap-0.5 rounded-full bg-popover px-1.5 py-1 shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
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
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              <Icon cls="fa-solid fa-plus text-[12px]" />
            </button>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}
