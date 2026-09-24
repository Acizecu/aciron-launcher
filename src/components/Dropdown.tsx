import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";
import Icon from "./Icon";

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
        className={`field flex h-10 w-full items-center gap-2.5 px-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "!border-accent" : ""
        }`}
      >
        {}
        {cur?.node ? (
          <span className="grid shrink-0 place-items-center">{cur.node}</span>
        ) : (
          cur?.icon && (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-bg text-accent">
              <Icon cls={`fa-solid ${cur.icon} text-[12px]`} />
            </span>
          )
        )}
        {}
        <span className="flex-1 truncate text-left">{cur?.label ?? placeholder ?? t("Выбрать")}</span>
        <Icon
          cls={`fa-solid fa-chevron-down text-[11.5px] text-muted transition-transform ${
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
              className="dropdown-in fixed z-[9999] overflow-y-auto rounded-[14px] bg-[color-mix(in_srgb,var(--color-bg)_93%,white)] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)]"
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
              {options.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}

                  style={{ ["--i" as string]: Math.min(i, 9) }}
                  className={`dropdown-item-in flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors ${
                    o.value === value ? "bg-white/[0.06] text-text" : "text-muted hover:bg-white/[0.05] hover:text-text"
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
                        <Icon cls={`fa-solid ${o.icon} text-[12px]`} />
                      </span>
                    )
                  )}
                  <span className="flex-1 truncate pr-2">{o.label}</span>
                  {o.value === value && <Icon cls="fa-solid fa-check text-[12.5px] text-accent" />}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
