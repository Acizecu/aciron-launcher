
import type { ReactNode } from "react";
import { t } from "../../i18n";

export const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent";

export const iconBtnCls =
  "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted transition-colors hover:border-accent/50 hover:text-accent";

export function Field({
  label,
  hint,
  children,
  column,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  column?: boolean;
}) {
  return (
    <div className={`px-4 py-3.5 ${column ? "" : "flex items-center gap-4"}`}>
      {label && (
        <div className={`min-w-0 ${column ? "mb-2" : "flex-1"}`}>
          <div className="text-sm font-medium text-text">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
        </div>
      )}
      <div className={column ? "" : "shrink-0"}>{children}</div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-panel/40">
      {children}
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        value ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          value ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function PathRow({
  value,
  onPick,
  onOpen,
}: {
  value: string;
  onPick: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex gap-2">
      <input className={inputCls} value={value} readOnly />
      <button className={iconBtnCls} title={t("Выбрать папку")} onClick={onPick}>
        <i className="fa-solid fa-folder-open text-sm" />
      </button>
      <button className={iconBtnCls} title={t("Открыть папку")} onClick={onOpen}>
        <i className="fa-solid fa-up-right-from-square text-sm" />
      </button>
    </div>
  );
}
