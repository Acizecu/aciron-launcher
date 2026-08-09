import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

export type DropdownOption = { value: string; label: string; icon?: string; node?: ReactNode };

type Pos = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width: number;
  maxH: number;
  up: boolean;
};

export default function Dropdown({
  value,
  options,
  onChange,
  className = "",
  placeholder,
  disabled = false,
  align = "left",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const cur = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const wanted = Math.min(288, options.length * 40 + 8);
      const below = window.innerHeight - b.bottom - 8;
      const above = b.top - 8;

      const up = below < wanted && above > below;
      const maxH = Math.min(wanted, up ? above : below);
      setPos({
        ...(up ? { bottom: window.innerHeight - b.top + 6 } : { top: b.bottom + 6 }),
        ...(align === "right" ? { right: window.innerWidth - b.right } : { left: b.left }),
        width: b.width,
        maxH,
        up,
      });
    };
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, options.length, align]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-10 w-full items-center gap-2.5 rounded-xl border px-3 text-sm text-text transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "border-accent/60 bg-card" : "border-border bg-card hover:border-accent/40"
        }`}
      >
        {}
        {cur?.node ? (
          <span className="grid shrink-0 place-items-center">{cur.node}</span>
        ) : (
          cur?.icon && (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-bg text-accent">
              <i className={`fa-solid ${cur.icon} text-[11px]`} />
            </span>
          )
        )}
        {}
        <span className="flex-1 truncate text-left">{cur?.label ?? placeholder ?? t("Выбрать")}</span>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="dropdown-in fixed z-[9999] overflow-y-auto rounded-[14px] border-1 border-[#232427]/65 bg-panel p-1 shadow-xl shadow-black/50"
              style={(() => {

                const s = (window as unknown as { __acironScale?: number }).__acironScale || 1;
                return {
                  top: pos.top,
                  bottom: pos.bottom,
                  left: pos.left,
                  right: pos.right,
                  minWidth: pos.width / s,
                  maxHeight: pos.maxH / s,
                  transform: `scale(${s})`,
                  transformOrigin: `${pos.up ? "bottom" : "top"} ${align === "right" ? "right" : "left"}`,
                };
              })()}
            >
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors ${
                    o.value === value ? "bg-card text-accent" : "text-muted hover:bg-card hover:text-text"
                  }`}
                >
                  {o.node ? (
                    <span className="grid shrink-0 place-items-center">{o.node}</span>
                  ) : (
                    o.icon && (
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${
                          o.value === value ? "bg-accent/15 text-accent" : "bg-bg text-muted"
                        }`}
                      >
                        <i className={`fa-solid ${o.icon} text-[11px]`} />
                      </span>
                    )
                  )}
                  <span className="flex-1 truncate pr-2">{o.label}</span>
                  {o.value === value && <i className="fa-solid fa-check text-xs text-accent" />}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
