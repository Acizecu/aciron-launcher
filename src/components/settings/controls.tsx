
import type { ReactNode } from "react";
import { t } from "../../i18n";
import Icon from "../Icon";

export const inputCls =
  "field w-full px-3.5 py-2 text-sm";

export const iconBtnCls =
  "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[12px] border border-line-strong bg-white/[0.06] text-text2 transition-colors hover:bg-white/[0.1] hover:text-text";

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
    <div className={`py-3.5 first:pt-0 last:pb-0 ${column ? "" : "flex items-center gap-6"}`}>
      {label && (
        <div className={`min-w-0 ${column ? "mb-2.5" : "flex-1"}`}>
          <div className="text-[14px] font-medium text-text">{label}</div>
          {hint && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</div>}
        </div>
      )}
      <div className={column ? "" : "shrink-0"}>{children}</div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-300"
      style={{ background: value ? "var(--color-accent)" : "var(--color-line-strong)" }}
    >
      <span
        className="absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[var(--ease-out-quint)]"
        style={{ transform: value ? "translateX(18px)" : "none" }}
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
        <Icon cls="fa-solid fa-folder-open text-sm" />
      </button>
      <button className={iconBtnCls} title={t("Открыть папку")} onClick={onOpen}>
        <Icon cls="fa-solid fa-up-right-from-square text-sm" />
      </button>
    </div>
  );
}
