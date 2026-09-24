import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

export type ActionItem = {
  icon: string;
  label: string;
  onClick: () => void;

  danger?: boolean;
};

export default function ActionMenu({
  items,
  title,
  className = "",
  children,
}: {
  items: ActionItem[];
  title?: string;
  className?: string;

  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      setPos({ top: b.bottom + 6, right: window.innerWidth - b.right });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[12px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text ${
          open ? "bg-raised text-text" : ""
        } ${className}`}
      >
        {children ?? <Icon cls="fa-solid fa-ellipsis text-sm" />}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {}
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="dropdown-in fixed z-[9999] min-w-[210px] overflow-hidden rounded-[16px] bg-popover shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] p-1"
              style={(() => {
                const s = (window as unknown as { __acironScale?: number }).__acironScale || 1;
                return {
                  top: pos.top,
                  right: pos.right,
                  transform: `scale(${s})`,
                  transformOrigin: "top right",
                };
              })()}
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors ${
                    it.danger
                      ? "text-danger hover:bg-[#ef4444]/12"
                      : "text-muted hover:bg-white/[0.05] hover:text-text"
                  }`}
                >
                  <Icon cls={`fa-solid ${it.icon} w-4 shrink-0 text-center text-[12px]`} />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
