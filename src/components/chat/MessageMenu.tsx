import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon";
import Twemoji from "./Twemoji";
import { QUICK } from "./ReactionPicker";
import { rememberEmoji } from "./EmojiPicker";
import { uiScale } from "../../floating";
import { t } from "../../i18n";

export type MenuItem = {
  icon: string;
  label: string;
  onClick: () => void;

  danger?: boolean;
};

const QUICK_IN_MENU = 6;
const PAD = 8;

export default function MessageMenu({
  x,
  y,
  items,
  reaction,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];

  reaction?: { current: string; onPick: (emoji: string) => void };
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; ox: string; oy: string } | null>(null);
  const scale = uiScale();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;

    const w = el.offsetWidth * scale;
    const h = el.offsetHeight * scale;
    const left = x + w > window.innerWidth - PAD ? Math.max(PAD, x - w) : x;
    const top = y + h > window.innerHeight - PAD ? Math.max(PAD, y - h) : y;
    setPos({ x: left, y: top, ox: left < x ? "right" : "left", oy: top < y ? "bottom" : "top" });
  }, [x, y, scale]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const close = () => onClose();

    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const firstDanger = items.findIndex((it) => it.danger);

  return createPortal(
    <div
      ref={box}
      role="menu"

      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        left: pos?.x ?? x,
        top: pos?.y ?? y,
        visibility: pos ? "visible" : "hidden",
        transform: `scale(${scale})`,
        transformOrigin: pos ? `${pos.oy} ${pos.ox}` : "top left",
      }}
      className="msg-menu fixed z-[9999] w-[216px] rounded-[16px] bg-popover p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05]"
    >
      {reaction && (
        <div className="mb-1 flex items-center justify-between gap-0.5 rounded-[12px] bg-white/[0.03] p-1">
          {QUICK.slice(0, QUICK_IN_MENU).map((e) => (
            <button
              key={e}
              onClick={() => {
                rememberEmoji(e);
                reaction.onPick(e);
                onClose();
              }}
              title={e === reaction.current ? t("Убрать свою реакцию") : t("Реакция")}
              className={`grid h-8 w-8 place-items-center rounded-full transition-[transform,background-color] duration-150 hover:scale-[1.18] hover:bg-white/[0.06] ${
                e === reaction.current ? "bg-accent/20 ring-1 ring-accent/50" : ""
              }`}
            >
              <Twemoji text={e} />
            </button>
          ))}
        </div>
      )}

      {items.map((it, i) => (
        <div key={it.label}>
          {i === firstDanger && i > 0 && <div className="mx-2 my-1 h-px bg-line" />}
          <button
            role="menuitem"
            onClick={() => {
              it.onClick();
              onClose();
            }}
            className={`group flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] transition-colors ${
              it.danger
                ? "text-danger hover:bg-danger/[0.12]"
                : "text-text hover:bg-white/[0.06]"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] transition-colors ${
                it.danger
                  ? "bg-danger/[0.1]"
                  : "bg-white/[0.04] text-muted group-hover:bg-accent/15 group-hover:text-accent"
              }`}
            >
              <Icon cls={`fa-solid ${it.icon} text-[11.5px]`} />
            </span>
            <span className="truncate">{it.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
