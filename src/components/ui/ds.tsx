import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon";

export function PageHeader({
  title,
  lead,
  aside,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;

  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-text">{title}</h1>
          {lead && <p className="mt-1.5 max-w-[60ch] text-[14px] text-text2">{lead}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

export function Section({
  title,
  lead,
  aside,
  split,
  tone,
  first,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  split?: boolean;
  tone?: "danger";

  first?: boolean;
  children: ReactNode;
}) {
  const heading = (
    <h2
      className="text-[16px] font-semibold tracking-[-0.01em] text-text"
      style={tone === "danger" ? { color: "var(--color-danger)" } : undefined}
    >
      {title}
    </h2>
  );
  const line = first ? "" : "border-t border-line pt-6";

  if (split) {
    return (
      <section className={`grid gap-x-10 gap-y-4 xl:grid-cols-[220px_1fr] ${line} ${first ? "" : "mt-6"}`}>
        <div>
          {heading}
          {lead && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{lead}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </section>
    );
  }

  return (
    <section className={`${line} ${first ? "" : "mt-6"}`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          {heading}
          {lead && <p className="mt-1 text-[13px] text-muted">{lead}</p>}
        </div>
        {aside && <div className="shrink-0 text-[13px] text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Row({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[14px] font-medium text-text">{title}</div>
        {hint && <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

export function Notice({ text, ok, tone }: { text: ReactNode; ok?: boolean; tone?: "info" }) {
  if (!text) return null;
  const color = tone === "info" ? "var(--color-muted)" : ok ? "var(--color-ok)" : "var(--color-danger)";
  return (
    <p role={ok || tone ? "status" : "alert"} className="flex items-center gap-2 text-[13px]" style={{ color }}>
      <span className="dot shrink-0" style={{ background: tone === "info" ? "var(--color-accent)" : "currentColor" }} />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  size = "md",
  className = "",
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const index = options.findIndex((o) => o.id === value);
  const n = options.length;
  return (
    <div
      role="radiogroup"
      className={`relative flex rounded-full bg-white/[0.05] p-1 ${className}`}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-raised shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_4px_14px_rgba(0,0,0,0.35)] transition-[transform,opacity] duration-[420ms] ease-[var(--ease-out-quint)]"
        style={{
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${Math.max(index, 0) * 100}%)`,
          opacity: index < 0 ? 0 : 1,
        }}
      />
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`relative z-10 flex-1 cursor-pointer whitespace-nowrap rounded-full font-semibold transition-colors duration-300 disabled:cursor-default ${
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-2 text-[13px]"
            } ${active ? "text-text" : "text-muted hover:text-text"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  on,
  onClick,
  disabled,
  label,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="relative h-[26px] w-[44px] shrink-0 cursor-pointer rounded-full transition-colors duration-300 disabled:cursor-default disabled:opacity-60"
      style={{ background: on ? "var(--color-accent)" : "color-mix(in srgb, var(--color-text) 14%, transparent)" }}
    >
      <span
        className="absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[var(--ease-out-quint)]"
        style={{ transform: on ? "translateX(18px)" : "none" }}
      />
    </button>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex items-center gap-6 border-b border-line">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px flex items-center gap-1.5 pb-3 text-[14px] font-medium transition-colors ${
              active ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="tag">{t.count}</span>
            )}
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent transition-[opacity,transform] duration-300 ease-[var(--ease-out-quint)] ${
                active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function RailNav<T extends string>({
  items,
  value,
  onChange,
  itemHeight = 40,
  gap = 4,
}: {
  items: { id: T; label: ReactNode; icon?: string; count?: number; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  itemHeight?: number;
  gap?: number;
}) {
  const index = items.findIndex((i) => i.id === value);
  return (
    <nav className="relative flex flex-col" style={{ gap }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 rounded-[14px] bg-white/[0.05] transition-[transform,opacity] duration-500 ease-[var(--ease-out-quint)]"
        style={{
          height: itemHeight,
          transform: `translateY(${Math.max(index, 0) * (itemHeight + gap)}px)`,
          opacity: index < 0 ? 0 : 1,
        }}
      >
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />
      </span>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center gap-3 rounded-[14px] px-3.5 text-left text-[14px] transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? "text-text" : "text-text2 hover:text-text"
            }`}
            style={{ height: itemHeight }}
          >
            {item.icon && <RailIcon icon={item.icon} active={active} />}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className={`shrink-0 text-[12px] tabular-nums ${active ? "text-accent" : "text-muted"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function RailIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <Icon
      cls={`fa-solid ${icon} text-[17px] transition-colors duration-300 ${active ? "text-accent" : "text-muted"}`}
    />
  );
}

export function SaveBar({
  open,
  text,
  saving,
  onCancel,
  onSave,
  cancelLabel,
  saveLabel,
  savingLabel,
}: {
  open: boolean;
  text: ReactNode;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  cancelLabel: string;
  saveLabel: string;
  savingLabel: string;
}) {
  return createPortal(
    <div
      aria-hidden={!open}
      className="pointer-events-none fixed inset-x-3 bottom-6 z-40 flex justify-center pl-14 transition-[transform,opacity] duration-500 ease-[var(--ease-out-quint)]"
      style={{ transform: open ? "none" : "translateY(24px)", opacity: open ? 1 : 0 }}
    >
      <div
        className="flex w-full max-w-[560px] items-center gap-3 rounded-full bg-popover/95 py-2 pl-5 pr-2 shadow-[0_18px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        <span className="dot bg-accent" />
        <span className="min-w-0 flex-1 truncate text-[14px] text-text">{text}</span>
        <button
          className="btn btn-sm btn-ghost rounded-full"
          disabled={saving}
          onClick={onCancel}
          tabIndex={open ? 0 : -1}
        >
          {cancelLabel}
        </button>
        <button
          className="btn btn-sm btn-accent rounded-full"
          disabled={saving}
          onClick={onSave}
          tabIndex={open ? 0 : -1}
        >
          {saving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
