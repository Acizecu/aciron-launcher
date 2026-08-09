import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import InstallModal from "./InstallModal";
import { t } from "../i18n";
import {
  getInstalledVersions,
  addInstalledVersion,
  removeInstalledVersion,
  getBuilds,
  type InstalledVersion,
} from "../api";

export type Version = {
  id: string;
  name: string;
  tag: string;
  icon: string;

  launchId?: string;
  isBuild?: boolean;
};

const SELECTED_KEY = "aciron:version";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};
const loaderIcon: Record<string, string> = {
  fabric: "fa-scroll",
  forge: "fa-hammer",
  neoforge: "fa-fire",
  quilt: "fa-layer-group",
};

function toVersion(iv: InstalledVersion): Version {
  const tag =
    iv.type === "snapshot"
      ? "Snapshot"
      : iv.type === "old_beta"
      ? "Beta"
      : iv.type === "old_alpha"
      ? "Alpha"
      : "Release";
  return { id: iv.id, name: iv.id, tag, icon: "fa-cube", launchId: iv.id };
}

function Row({
  v,
  active,
  onClick,
  onRemove,
}: {
  v: Version;
  active: boolean;
  onClick: () => void;
  onRemove?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-card"
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
          active ? "bg-accent/15 text-accent" : "bg-bg text-muted"
        }`}
      >
        <i className={`fa-solid ${v.icon} text-sm`} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`truncate text-sm font-medium ${active ? "text-accent" : "text-text"}`}>
          {v.name}
        </div>
        <div className="text-[11px] text-muted">{v.tag}</div>
      </div>
      {active && (
        <i
          className={`fa-solid fa-circle-check text-accent transition-opacity ${
            onRemove ? "group-hover:opacity-0" : ""
          }`}
        />
      )}
      {onRemove && (
        <i
          onClick={onRemove}
          title={t("Удалить версию")}
          className={`fa-solid fa-trash-can p-1 text-muted opacity-0 transition-opacity hover:text-[#ef4444] group-hover:opacity-100 ${
            active ? "absolute right-3" : ""
          }`}
        />
      )}
    </button>
  );
}

export default function VersionMenu({
  onChange,
}: {
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [installModal, setInstallModal] = useState(false);
  const [installed, setInstalled] = useState<Version[]>([]);
  const [builds, setBuilds] = useState<Version[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_KEY)
  );
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const load = async () => {
    const [ivs, bs] = await Promise.all([getInstalledVersions(), getBuilds()]);
    const vlist = ivs.map(toVersion);
    const blist: Version[] = bs.map((b) => ({
      id: `build:${b.id}`,
      name: b.name,
      tag: `${b.mc_version} · ${loaderLabel[b.loader] ?? b.loader}`,
      icon: loaderIcon[b.loader] ?? "fa-cubes-stacked",
      launchId: b.mc_version,
      isBuild: true,
    }));
    setInstalled(vlist);
    setBuilds(blist);
    const all = [...vlist, ...blist];
    setSelectedId((prev) => (prev && all.some((v) => v.id === prev) ? prev : all[0]?.id ?? null));
  };

  useEffect(() => {
    load();

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const all = [...installed, ...builds];
  const selected = all.find((v) => v.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId) localStorage.setItem(SELECTED_KEY, selectedId);
    else localStorage.removeItem(SELECTED_KEY);

    onChange(selected?.id ?? null);
  }, [selectedId, selected, onChange]);

  const pick = (v: Version) => {
    setSelectedId(v.id);
    setOpen(false);
  };

  const installVersion = async (id: string, type = "release") => {
    await addInstalledVersion(id, type);
    await load();
    setSelectedId(id);
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeInstalledVersion(id);
    await load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-14 min-w-[180px] items-center gap-3 rounded-xl border px-3 transition-colors ${
          open ? "border-border bg-card" : "border-transparent bg-card hover:bg-border/50"
        }`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
          <i className={`fa-solid ${selected?.icon ?? "fa-cube"} text-sm`} />
        </span>
        <div className="flex-1 text-left leading-tight">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {selected?.isBuild ? t("Сборка") : t("Версия")}
          </div>
          <div className="truncate text-sm font-semibold text-text">
            {selected?.name ?? t("Нет версий")}
          </div>
        </div>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-panel shadow-xl shadow-black/40">
          <div className="max-h-72 overflow-y-auto">
            <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("Установленные версии")}
            </div>
            {installed.length === 0 && (
              <div className="px-3 py-3 text-center text-xs text-muted">
                {t("Пока ничего не установлено")}
              </div>
            )}
            {installed.map((v) => (
              <Row
                key={v.id}
                v={v}
                active={selectedId === v.id}
                onClick={() => pick(v)}
                onRemove={(e) => remove(e, v.id)}
              />
            ))}

            {builds.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Сборки")}
                </div>
                {builds.map((v) => (
                  <Row key={v.id} v={v} active={selectedId === v.id} onClick={() => pick(v)} />
                ))}
              </>
            )}
          </div>

          <div className="border-t border-border p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setInstallModal(true);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-card px-3 py-2 text-sm font-semibold text-accent transition-colors hover:bg-border/60"
            >
              <i className="fa-solid fa-download text-xs" />
              {t("Установить больше")}
            </button>
          </div>
        </div>
      )}

      {installModal && (
        <InstallModal
          onClose={() => setInstallModal(false)}
          onPick={(id, type) => installVersion(id, type)}
        />
      )}
    </div>
  );
}
