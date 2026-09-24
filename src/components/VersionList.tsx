import { useEffect, useMemo, useState } from "react";
import { contentVersions, type ModVersion, type SourceId } from "../api";
import Dropdown from "./Dropdown";
import LoadingDots from "./LoadingDots";
import { dtf, t } from "../i18n";
import Icon from "./Icon";

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
        <Icon cls="fa-solid fa-spinner fa-spin mr-2" />
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
          <span className="ml-auto text-[12px] text-muted">{t("{n} версий", { n: filtered.length })}</span>
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
              className="flex items-center gap-3 rounded-[14px] border border-line bg-white/[0.04] px-3.5 py-2.5"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px]"
                style={{ background: `color-mix(in srgb, ${meta.color} 16%, transparent)`, color: meta.color }}
              >
                <Icon cls="fa-solid fa-file-zipper text-[12.5px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text">
                    {v.version_number || v.name}
                  </span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-medium"
                    style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                  >
                    {t(meta.label)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted">
                  {[
                    gv.slice(0, 4).join(", ") + (gv.length > 4 ? "…" : ""),
                    v.loaders?.length > 0 ? v.loaders.map((l) => l[0].toUpperCase() + l.slice(1)).join(", ") : "",
                    v.date_published ? dtf().format(new Date(v.date_published)) : "",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
              <button
                onClick={() => !isCurrent && !isBusy && onPick(v)}
                disabled={isCurrent || isBusy}
                className={`flex shrink-0 items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  isCurrent
                    ? "cursor-default bg-bg text-text"
                    : "btn-accent disabled:opacity-60"
                }`}
              >
                <Icon cls={`fa-solid ${isBusy ? "fa-spinner fa-spin" : isCurrent ? "fa-check" : "fa-download"}`} />
                {isBusy ? "…" : isCurrent ? t("Текущая") : t(actionLabel)}
              </button>
            </div>
          );
        })
      )}

      {!showAll && filtered.length > 40 && (
        <button
          onClick={() => setShowAll(true)}
          className="btn btn-sm btn-ghost w-full"
        >
          {t("Показать все ({n})", { n: filtered.length })}
        </button>
      )}
    </div>
  );
}
