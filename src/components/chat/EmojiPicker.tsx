import { useEffect, useRef, useState } from "react";
import SET from "../../emoji-set.json";
import { twemojiUrl } from "../../twemoji";
import { t } from "../../i18n";

const CATS = Object.entries(SET as Record<string, string[]>);

export default function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      className="absolute bottom-full right-0 z-50 mb-2 w-[288px] overflow-hidden rounded-xl border border-border bg-panel shadow-lg"
    >
      <div className="flex gap-1 border-b border-border/70 px-2 py-1.5">
        {CATS.map(([name], i) => (
          <button
            key={name}
            onClick={() => setCat(i)}
            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
              i === cat ? "bg-card text-text" : "text-muted hover:text-text"
            }`}
          >
            {}
            {t(name)}
          </button>
        ))}
      </div>

      <div className="grid max-h-[184px] grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {CATS[cat][1].map((e) => {
          const url = twemojiUrl(e);
          return (
            <button
              key={e}
              onClick={() => onPick(e)}
              title={e}
              className="grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-card"
            >
              {url ? (
                <img src={url} alt={e} draggable={false} className="h-5 w-5" />
              ) : (
                <span className="text-base leading-none">{e}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
