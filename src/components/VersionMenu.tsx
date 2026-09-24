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
import Icon from "./Icon";

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
      className={`group relative flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors ${
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-colors ${
          active ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted"
        }`}
      >
        <Icon cls={`fa-solid ${v.icon} text-[16px]`} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[14px] font-medium text-text">{v.name}</div>
        <div className="mt-0.5 text-[12px] text-muted">{v.tag}</div>
      </div>
      {active && (
        <Icon
          cls={`fa-solid fa-check text-[16px] text-accent transition-opacity ${
            onRemove ? "group-hover:opacity-0" : ""
          }`}
        />
      )}
      {onRemove && (
        <Icon
          onClick={onRemove}
          title={t("Удалить версию")}
          cls={`fa-solid fa-trash-can p-1 text-[15px] text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 ${
            active ? "absolute right-2.5" : ""
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
      tag: `${b.mc_version}, ${loaderLabel[b.loader] ?? b.loader}`,
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
        className={`flex h-14 items-center gap-3 rounded-[16px] px-2.5 pr-3.5 transition-colors duration-300 min-w-[190px] ${open ? "bg-white/[0.08]" : "bg-white/[0.04] hover:bg-white/[0.07]"}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent/12 text-accent">
          <Icon cls={`fa-solid ${selected?.icon ?? "fa-cube"} text-[18px]`} />
        </span>
        <div className="flex-1 text-left leading-tight">
          <div className="text-[12px] text-muted">
            {selected?.isBuild ? t("Сборка") : t("Версия")}
          </div>
          <div className="mt-0.5 truncate text-[14.5px] font-semibold text-text">
            {selected?.name ?? t("Нет версий")}
          </div>
        </div>
        <Icon
          cls={`fa-solid fa-chevron-down text-[14px] text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="dock-pop absolute bottom-full mb-3 overflow-hidden rounded-[20px] bg-popover p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] left-0 w-80">
          <div className="max-h-72 overflow-y-auto">
            <div className="px-2.5 pb-1.5 pt-1.5 text-[12.5px] text-muted">
              {t("Установленные версии")}
            </div>
            {installed.length === 0 && (
              <div className="px-3 py-4 text-center text-[13px] text-muted">
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
                <div className="px-2.5 pb-1.5 pt-3 text-[12.5px] text-muted">
                  {t("Сборки")}
                </div>
                {builds.map((v) => (
                  <Row key={v.id} v={v} active={selectedId === v.id} onClick={() => pick(v)} />
                ))}
              </>
            )}
          </div>

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setInstallModal(true);
              }}
              className="btn btn-sm btn-secondary w-full"
            >
              <Icon cls="fa-solid fa-download text-[14px]" />
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
