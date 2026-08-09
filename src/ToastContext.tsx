import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEV } from "./config";
import { t as tr } from "./i18n";

export type ToastType = "success" | "error" | "info" | "warning";
type Toast = { id: number; message: string; type: ToastType; leaving?: boolean };

const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});

const SHOW_MS = 3800;
const OUT_MS = 260;

const STYLES: Record<ToastType, { icon: string; color: string }> = {
  success: { icon: "fa-circle-check", color: "#22c55e" },
  error: { icon: "fa-circle-exclamation", color: "#ef4444" },
  warning: { icon: "fa-triangle-exclamation", color: "#eab308" },
  info: { icon: "fa-circle-info", color: "var(--color-accent)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const drop = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), OUT_MS);
  }, []);

  const push = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => drop(id), SHOW_MS);
    },
    [drop]
  );

  useEffect(() => {
    if (!DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F9") return;
      e.preventDefault();
      push("Сборка «SkyBlock» установлена", "success");
      setTimeout(() => push("Проверьте подключение к интернету", "warning"), 250);
      setTimeout(() => push("Не удалось скачать мод: файл недоступен", "error"), 500);
      setTimeout(() => push("Список контента обновлён", "info"), 750);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [push]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-[380px] max-w-[92vw] -translate-x-1/2 flex-col items-stretch gap-2">
        {toasts.map((t) => {
          const st = STYLES[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-[16px] border-1 border-[#232427]/65 bg-panel py-3 pl-4 pr-3 shadow-xl shadow-black/50 ${
                t.leaving ? "toast-out" : "animate-[float-in_.22s_ease]"
              }`}
            >
              {}
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: st.color }} />

              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                style={{ background: `color-mix(in srgb, ${st.color} 15%, transparent)`, color: st.color }}
              >
                <i className={`fa-solid ${st.icon} text-sm`} />
              </span>

              <span className="min-w-0 flex-1 break-words text-[13px] leading-snug text-text">
                {t.message}
              </span>

              <button
                onClick={() => drop(t.id)}
                title={tr("Закрыть")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:text-text"
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
