
import { t } from "../i18n";
export default function Pagination({
  page,
  totalPages,
  onChange,
  className = "",
}: {

  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const start = Math.max(0, Math.min(page - 2, totalPages - 5));
  const win: number[] = [];
  for (let i = start; i < Math.min(totalPages, start + 5); i++) win.push(i);

  const arrow = "grid h-9 w-9 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted";

  return (
    <div className={`flex items-center justify-center gap-1.5 pt-5 ${className}`}>
      <button
        disabled={page === 0}
        onClick={() => onChange(Math.max(0, page - 1))}
        title={t("Предыдущая страница")}
        className={arrow}
      >
        <i className="fa-solid fa-chevron-left text-xs" />
      </button>

      {win[0] > 0 && <span className="px-1 text-xs text-muted">…</span>}
      {win.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`h-9 min-w-9 rounded-[8px] px-2.5 text-sm font-medium transition-colors ${
            p === page ? "bg-accent text-bg" : "bg-card text-muted hover:text-text"
          }`}
        >
          {p + 1}
        </button>
      ))}
      {win[win.length - 1] < totalPages - 1 && <span className="px-1 text-xs text-muted">…</span>}

      <button
        disabled={page >= totalPages - 1}
        onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
        title={t("Следующая страница")}
        className={arrow}
      >
        <i className="fa-solid fa-chevron-right text-xs" />
      </button>
    </div>
  );
}
