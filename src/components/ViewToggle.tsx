import { setViewMode, useViewMode, type ViewMode } from "../hooks/useViewMode";
import { t } from "../i18n";

const MODES: { id: ViewMode; icon: string; label: string }[] = [
  { id: "list", icon: "fa-list", label: "Списком" },
  { id: "grid", icon: "fa-table-cells-large", label: "Плиткой" },
];

export default function ViewToggle({ className = "" }: { className?: string }) {
  const mode = useViewMode();
  return (
    <div className={`flex shrink-0 items-center gap-0.5 rounded-[10px] bg-bg p-0.5 ${className}`}>
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setViewMode(m.id)}
          title={t(m.label)}
          aria-pressed={mode === m.id}
          className={`grid h-7 w-8 place-items-center rounded-[8px] text-[12px] transition-colors ${
            mode === m.id ? "bg-card text-accent" : "text-muted hover:text-text"
          }`}
        >
          <i className={`fa-solid ${m.icon}`} />
        </button>
      ))}
    </div>
  );
}
