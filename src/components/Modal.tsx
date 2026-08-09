import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../i18n";

const CLOSE_MS = 180;

const REVIVE_MS = 80;

export default function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  width = "max-w-md",

  bare = false,
  dismissible = true,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  bare?: boolean;

  dismissible?: boolean;
}) {

  const [closing, setClosing] = useState(false);
  const timers = useRef<number[]>([]);

  const close = useCallback(() => {
    if (closing || !dismissible) return;
    setClosing(true);
    timers.current.push(
      window.setTimeout(() => {

        try {
          onClose();
        } catch (e) {
          console.error("[modal] onClose failed:", e);
        }
        timers.current.push(window.setTimeout(() => setClosing(false), REVIVE_MS));
      }, CLOSE_MS)
    );
  }, [closing, dismissible, onClose]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
      timers.current = [];
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (

    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6 ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] ${
          closing ? "modal-backdrop-out" : "modal-backdrop"
        }`}
        onClick={close}
      />

      <div
        className={`relative flex max-h-[84vh] w-full ${width} flex-col overflow-hidden rounded-[20px] border-1 border-[#232427]/65 bg-panel shadow-2xl shadow-black/60 ${
          closing ? "modal-panel-out" : "modal-panel"
        }`}
      >
        {}
        {dismissible && (
          <button
            onClick={close}
            aria-label={t("Закрыть")}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-[10px] bg-card text-muted transition-colors hover:bg-[#FF3535]/50 hover:text-white"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}

        <div className="flex items-center gap-3 px-6 pb-4 pt-6 pr-16">
          {icon && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-card text-accent">
              <i className={`fa-solid ${icon}`} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[22px] font-light leading-none text-text">{title}</h3>
            {subtitle && (
              <p className="mt-1.5 truncate text-[12px] font-light text-[#818181]">{subtitle}</p>
            )}
          </div>
        </div>

        {}
        <div
          className={`relative min-h-0 flex-1 overflow-y-auto font-light ${
            bare ? "" : "px-6 pb-6"
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
