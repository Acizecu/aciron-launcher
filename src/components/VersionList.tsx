import { useEffect, useMemo, useState } from "react";
import { contentVersions, type ModVersion, type SourceId } from "../api";
import Dropdown from "./Dropdown";
import LoadingDots from "./LoadingDots";
import { dtf, t } from "../i18n";

const typeMeta: Record<string, { label: string; color: string }> = {
  release: { label: "Релиз", color: "#4ade80" },
  beta: { label: "Beta", color: "#fbbf24" },
  alpha: { label: "Alpha", color: "#f87171" },
};

function cmpMc(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export default function VersionList({
  source = "modrinth",
  projectId,
  currentVersionId,
  actionLabel = "Установить",
  showFilters = false,
  busyId,
  onPick,
}: {
  source?: SourceId;
  projectId: string;
  currentVersionId?: string;
  actionLabel?: string;
  showFilters?: boolean;
  busyId?: string | null;
  onPick: (v: ModVersion) => void;
}) {
  const [versions, setVersions] = useState<ModVersion[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [mcFilter, setMcFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    setVersions(null);
    setShowAll(false);
    setMcFilter("");
    setTypeFilter("");
    contentVersions(source, projectId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [source, projectId]);

  const mcOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of versions ?? []) for (const g of v.game_versions ?? []) set.add(g);
    return [...set].sort(cmpMc);
  }, [versions]);

  const filtered = useMemo(() => {
    return (versions ?? []).filter(
      (v) =>
        (!mcFilter || (v.game_versions ?? []).includes(mcFilter)) &&
        (!typeFilter || v.version_type === typeFilter)
    );
  }, [versions, mcFilter, typeFilter]);

  if (versions === null) {
    return (
      <div className="p-8 text-center text-sm text-muted">
        <i className="fa-solid fa-spinner fa-spin mr-2" />
        {t("Загрузка версий")}
        <LoadingDots className="ml-1" />
      </div>
    );
  }

  const shown = showAll ? filtered : filtered.slice(0, 40);

  return (
    <div className="space-y-2">
      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Dropdown
            value={mcFilter}
            onChange={setMcFilter}
            options={[{ value: "", label: t("Все версии MC") }, ...mcOptions.map((v) => ({ value: v, label: v }))]}
            className="w-40"
          />
          <Dropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "", label: t("Все типы") },
              { value: "release", label: t("Релиз"), icon: "fa-circle-check" },
              { value: "beta", label: "Beta", icon: "fa-flask" },
              { value: "alpha", label: "Alpha", icon: "fa-triangle-exclamation" },
            ]}
            className="w-40"
          />
          <span className="ml-auto text-[11px] text-muted">{t("{n} версий", { n: filtered.length })}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted">{t("Версий не найдено.")}</div>
      ) : (
        shown.map((v) => {
          const meta = typeMeta[v.version_type] ?? { label: v.version_type, color: "var(--color-muted)" };
          const isCurrent = !!currentVersionId && v.id === currentVersionId;
          const isBusy = busyId === v.id;
          const gv = v.game_versions ?? [];
          return (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{ background: `color-mix(in srgb, ${meta.color} 16%, transparent)`, color: meta.color }}
              >
                <i className="fa-solid fa-file-zipper text-xs" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text">
                    {v.version_number || v.name}
                  </span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                  >
                    {t(meta.label)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                  <span>
                    {gv.slice(0, 4).join(", ")}
                    {gv.length > 4 ? "…" : ""}
                  </span>
                  {v.loaders?.length > 0 && <span className="capitalize">· {v.loaders.join(", ")}</span>}
                  {v.date_published && (
                    <span>· {dtf().format(new Date(v.date_published))}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => !isCurrent && !isBusy && onPick(v)}
                disabled={isCurrent || isBusy}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  isCurrent
                    ? "cursor-default bg-bg text-text"
                    : "bg-accent text-bg hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
                }`}
              >
                <i className={`fa-solid ${isBusy ? "fa-spinner fa-spin" : isCurrent ? "fa-check" : "fa-download"}`} />
                {isBusy ? "…" : isCurrent ? t("Текущая") : t(actionLabel)}
              </button>
            </div>
          );
        })
      )}

      {!showAll && filtered.length > 40 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-lg border border-border py-2 text-xs text-muted transition-colors hover:text-text"
        >
          {t("Показать все ({n})", { n: filtered.length })}
        </button>
      )}
    </div>
  );
}
