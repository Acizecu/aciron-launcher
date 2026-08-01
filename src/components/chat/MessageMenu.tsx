import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  icon: string;
  label: string;
  onClick: () => void;

  danger?: boolean;
};

export default function MessageMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.min(x, window.innerWidth - r.width - pad),
      y: Math.min(y, window.innerHeight - r.height - pad),
    });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();

    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[80] min-w-[190px] overflow-hidden rounded-xl border border-border bg-panel py-1 shadow-xl"
    >
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => {
            it.onClick();
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-card ${
            it.danger ? "text-[#f87171]" : "text-text"
          }`}
        >
          <i className={`fa-solid ${it.icon} w-4 shrink-0 text-center text-xs opacity-80`} />
          {it.label}
        </button>
      ))}
    </div>
  );
}
