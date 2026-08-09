import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBuilds,
  deleteBuild,
  openBuildFolder,
  removeMod,
  toggleMod,
  setBuildImage,
  setBuildFavorite,
  addContentFiles,
  refreshBuildContent,
  matchLocalMods,
  importMrpack,
  importAcpack,
  modrinthInstall,
  checkBuildUpdates,
  pickFile,
  type Build,
  type ContentKind,
  type InstalledMod,
  type ModHit,
  type SourceId,
} from "../api";
import { coverFor } from "../covers";
import { CARD_FALL_MS, ROW_OUT_MS, cardInDelay } from "../anim";
import { useFlip } from "../hooks/useFlip";
import { useFileDrop } from "../hooks/useFileDrop";
import { useViewMode } from "../hooks/useViewMode";
import ViewToggle from "./ViewToggle";
import { t, useLang, ts } from "../i18n";
import ExportBuildModal from "./ExportBuildModal";
import CreateBuildModal from "./CreateBuildModal";
import ModsBrowser from "./ModsBrowser";
import ModDetail from "./ModDetail";
import ConfirmModal from "./ConfirmModal";
import BuildCover from "./BuildCover";
import BuildBanner from "./BuildBanner";
import BuildSettingsModal from "./BuildSettingsModal";
import ModpackBrowser from "./ModpackBrowser";
import GameConsole from "./builds/GameConsole";
import Pagination from "./Pagination";
import { useToast } from "../ToastContext";
import { useLauncherCtx } from "../LauncherContext";
import { useDownloadActive, startTask, endTask, wasCancelled } from "../downloadTask";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

const BUILDS_PER_PAGE = 8;

function orderBuilds(list: Build[]): Build[] {
  return [...list].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if ((b.last_played ?? 0) !== (a.last_played ?? 0))
      return (b.last_played ?? 0) - (a.last_played ?? 0);
    return (b.created ?? 0) - (a.created ?? 0);
  });
}

function fmtPlaytime(secs: number): string {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return t("{h}ч {m}м", { h, m });
  if (m > 0) return t("{m}м", { m });
  return t("<1м");
}

function modPageTarget(
  m: InstalledMod
): { hit: ModHit; source: SourceId; kind: ContentKind } | null {
  const pid = m.project_id;
  if (pid.startsWith("local:") || pid.startsWith("mrpack:")) return null;
  const source: SourceId = pid.startsWith("cf:") ? "curseforge" : "modrinth";
  const realId = pid.startsWith("cf:") ? pid.slice(3) : pid;
  const hit: ModHit = {
    project_id: realId,
    slug: "",
    title: m.name,
    description: "",
    icon_url: m.icon_url,
    downloads: 0,
    categories: [],
    author: "",
  };
  return { hit, source, kind: m.kind };
}

type DetailTab = ContentKind | "console";

const CONTENT_TABS: { id: ContentKind; label: string; icon: string; empty: string }[] = [
  { id: "mod", label: "Моды", icon: "fa-puzzle-piece", empty: "Список пока пуст.." },
  { id: "resourcepack", label: "Ресурспаки", icon: "fa-palette", empty: "Список пока пуст.." },
  { id: "shader", label: "Шейдеры", icon: "fa-wand-sparkles", empty: "Список пока пуст.." },
];

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-colors ${
        on ? "border-accent bg-accent text-bg" : "border-border bg-bg text-transparent"
      }`}
    >
      <i className="fa-solid fa-check text-[9px]" />
    </span>
  );
}

type View = "list" | "detail" | "browse";

type ModFilter = "all" | "on" | "off" | "outdated";

type ModRowProps = {
  m: InstalledMod;
  i: number;
  metaIcon: string;
  picked: boolean;
  hasUpdate: boolean;
  updating: boolean;
  leaving: boolean;
  onTogglePick: (projectId: string) => void;
  onOpen: (m: InstalledMod) => void;
  onUpdate: (projectId: string, name: string) => void;
  onToggle: (projectId: string) => void;
  onRemove: (m: InstalledMod) => void;

  tile?: boolean;
};

const ModRow = memo(function ModRow({
  m,
  i,
  metaIcon,
  picked,
  hasUpdate,
  updating,
  leaving,
  onTogglePick,
  onOpen,
  onUpdate,
  onToggle,
  onRemove,
  tile,
}: ModRowProps) {

  useLang();
  const manual = m.project_id.startsWith("local:");
  const target = modPageTarget(m);

  if (tile) {
    return (
      <div
        style={leaving ? undefined : cardInDelay(i)}
        className={`group relative flex flex-col rounded-[16px] border-1 p-3 transition-colors ${
          picked ? "border-accent bg-accent/8" : "border-[#232427]/65 bg-card hover:border-accent/40"
        } ${leaving ? "row-out" : "card-in"} ${m.enabled ? "" : "opacity-60"}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {}
          <div className="relative shrink-0">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-[12px] bg-bg">
              {m.icon_url ? (
                <img src={m.icon_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <i className={`fa-solid ${metaIcon} text-lg text-muted`} />
              )}
            </div>
            <button
              onClick={() => onTogglePick(m.project_id)}
              title={t("Выделить")}
              className={`absolute -left-1 -top-1 transition-opacity ${
                picked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <Check on={picked} />
            </button>
          </div>

          <button
            onClick={() => onOpen(m)}
            disabled={!target}
            title={target ? t("Открыть страницу") : t("Файл не опознан на Modrinth")}
            className={`min-w-0 flex-1 pr-8 text-left ${target ? "cursor-pointer" : "cursor-default"}`}
          >
            <div
              className={`truncate text-[15px] font-semibold leading-tight text-text ${
                target ? "group-hover:text-accent" : ""
              }`}
              title={m.name}
            >
              {m.name}
            </div>
            <div
              className="selectable mt-1 truncate text-[12px] text-[#818181]"
              title={m.filename}
            >
              {m.filename || "—"}
            </div>
          </button>

          <div className="absolute right-2 top-2 flex items-center gap-1">
            {hasUpdate && (
              <button
                onClick={() => onUpdate(m.project_id, m.name)}
                disabled={updating}
                title={t("Доступно обновление — скачать")}
                className="grid h-7 w-7 place-items-center rounded-[8px] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-60"
              >
                <i
                  className={`fa-solid ${updating ? "fa-spinner fa-spin" : "fa-download"} text-[11px]`}
                />
              </button>
            )}
            <button
              onClick={() => onRemove(m)}
              title={t("Удалить")}
              className="grid h-7 w-7 place-items-center rounded-[8px] text-muted opacity-0 transition hover:bg-[#FF3535]/50 hover:text-white group-hover:opacity-100"
            >
              <i className="fa-solid fa-trash-can text-[11px]" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {}
          {manual ? (
            <span className="rounded-full bg-bg px-2 py-1 text-[11px] leading-none text-muted">
              {t("вручную")}
            </span>
          ) : (
            <span />
          )}

          <button
            onClick={() => onToggle(m.project_id)}
            title={m.enabled ? t("Выключить") : t("Включить")}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              m.enabled ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                m.enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={leaving ? undefined : cardInDelay(i)}
      className={`group flex items-center gap-3 rounded-[16px] border-1 border-[#232427]/65 bg-card p-3 transition-colors hover:border-accent/40 ${
        leaving ? "row-out" : "card-in"
      } ${m.enabled ? "" : "opacity-60"}`}
    >
      {}
      <button onClick={() => onTogglePick(m.project_id)} title={t("Выделить")} className="shrink-0">
        <Check on={picked} />
      </button>

      <button
        onClick={() => onOpen(m)}
        disabled={!target}
        title={target ? t("Открыть страницу") : t("Файл не опознан на Modrinth")}
        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${
          target ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-bg">
          {m.icon_url ? (
            <img src={m.icon_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <i className={`fa-solid ${metaIcon} text-muted`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm font-medium text-text ${
                target ? "group-hover:text-accent" : ""
              }`}
              title={m.name}
            >
              {m.name}
            </span>
            {manual && (
              <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] text-muted">
                {t("вручную")}
              </span>
            )}
          </div>
          <div className="truncate text-[10px] text-[#818181]" title={m.filename}>
            {m.filename || "—"}
          </div>
        </div>
      </button>

      {}
      {hasUpdate && (
        <button
          onClick={() => onUpdate(m.project_id, m.name)}
          disabled={updating}
          title={t("Доступно обновление — скачать")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-60"
        >
          <i className={`fa-solid ${updating ? "fa-spinner fa-spin" : "fa-download"} text-xs`} />
        </button>
      )}

      {}
      <button
        onClick={() => onToggle(m.project_id)}
        title={m.enabled ? t("Выключить") : t("Включить")}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          m.enabled ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            m.enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>

      <button
        onClick={() => onRemove(m)}
        title={t("Удалить")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-muted opacity-0 transition hover:bg-[#FF3535]/50 hover:text-white group-hover:opacity-100"
      >
        <i className="fa-solid fa-trash-can text-xs" />
      </button>
    </div>
  );
});

export default function BuildsPage() {
  const { t } = useLang();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [exportModal, setExportModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  const rowView = useViewMode();
  const [createModal, setCreateModal] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [modSearch, setModSearch] = useState("");
  const [confirmDel, setConfirmDel] = useState<Build | null>(null);

  const [dyingId, setDyingId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [modPage, setModPage] = useState<{ hit: ModHit; source: SourceId; kind: ContentKind } | null>(
    null
  );
  const [tab, setTab] = useState<"mine" | "popular">("mine");
  const [contentTab, setContentTab] = useState<DetailTab>("mod");
  const [modFilter, setModFilter] = useState<ModFilter>("all");

  const [updates, setUpdates] = useState<string[]>([]);
  const [updatingMod, setUpdatingMod] = useState<Set<string>>(new Set());

  const updatingRef = useRef<Set<string>>(updatingMod);
  updatingRef.current = updatingMod;

  const [dyingMods, setDyingMods] = useState<string[]>([]);

  const [picked, setPicked] = useState<string[]>([]);

  const [confirmMods, setConfirmMods] = useState<InstalledMod[] | null>(null);
  const [browseKind, setBrowseKind] = useState<ContentKind>("mod");
  const [page, setPage] = useState(0);
  const toast = useToast();
  const { launch, stop, isRunning } = useLauncherCtx();
  const downloading = useDownloadActive();

  const [launching, setLaunching] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);

  const startLaunch = async (id: string, name: string) => {
    const target = `build:${id}`;
    if (launching.has(target)) return;
    setLaunching((p) => new Set(p).add(target));
    toast(t("Запуск «{name}»…", { name }), "success");
    try {
      await launch(target);
    } finally {
      setLaunching((p) => {
        const n = new Set(p);
        n.delete(target);
        return n;
      });
    }
  };

  const updateBuild = (updated: Build) =>
    setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));

  const refresh = async () => {
    const list = await getBuilds();
    setBuilds(list);
    setSelectedId((prev) => (prev && list.some((b) => b.id === prev) ? prev : null));
  };

  useEffect(() => {

    (async () => {
      await refresh();
      const w = window as unknown as { __acironOpenBuild?: string };
      if (w.__acironOpenBuild) {
        const id = w.__acironOpenBuild;
        w.__acironOpenBuild = undefined;
        openBuild(id);
      }
    })();

  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) openBuild(id);
    };
    window.addEventListener("aciron-open-build", onOpen);
    return () => window.removeEventListener("aciron-open-build", onOpen);

  }, []);

  useEffect(() => {
    const reset = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "builds") return;
      setView("list");
      setSelectedId(null);
      void refresh();
    };
    window.addEventListener("aciron-nav-reset", reset);
    return () => window.removeEventListener("aciron-nav-reset", reset);

  }, []);

  const ordered = useMemo(() => orderBuilds(builds), [builds]);

  useFlip(gridRef, ordered.map((b) => b.id).join());

  const selected = builds.find((b) => b.id === selectedId) ?? null;

  const toggleFavorite = async (b: Build) => {
    try {
      const updated = await setBuildFavorite(b.id, !b.favorite);
      setBuilds((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      toast(
        updated.favorite
          ? t("«{name}» закреплена", { name: b.name })
          : t("«{name}» откреплена", { name: b.name }),
        "info"
      );
    } catch (e) {
      toast(ts(String(e)), "error");
    }
  };

  const importFromPath = useCallback(
    async (path: string) => {
      const acpack = path.toLowerCase().endsWith(".acpack");
      if (!acpack && !path.toLowerCase().endsWith(".mrpack")) {
        toast(t("Это не файл сборки: нужен .acpack или .mrpack"), "error");
        return;
      }
      setImporting(true);
      window.dispatchEvent(
        new CustomEvent("aciron-task-start", {
          detail: {
            name: acpack ? t("Импорт .acpack") : t("Импорт .mrpack"),
            cancelLabel: t("Отменить импорт"),
          },
        })
      );
      try {

        const res = acpack ? await importAcpack(path) : null;
        const b = res ? res.build : await importMrpack(path);
        setBuilds(await getBuilds());
        toast(t("Сборка «{name}» импортирована", { name: b.name }), "success");
        if (res && res.missing.length) {
          toast(
            t("Не скачалось: {list}", { list: res.missing.join(", ") }),
            "warning"
          );
        }
      } catch (e) {

        if (!wasCancelled("legacy")) {
          window.dispatchEvent(new CustomEvent("aciron-task-end"));
          toast(ts(String(e)), "error");
        }
        setBuilds(await getBuilds());
      } finally {
        setImporting(false);
      }
    },
    [toast]
  );

  const importPack = async () => {
    if (importing) return;
    const f = await pickFile(t("Сборка Aciron или модпак Modrinth"), ["acpack", "mrpack"]);
    if (!f) return;
    await importFromPath(f);
  };

  useEffect(() => {
    const w = window as unknown as { __acironOpenPack?: string };
    if (w.__acironOpenPack) {
      const p = w.__acironOpenPack;
      w.__acironOpenPack = undefined;
      void importFromPath(p);
    }
    const onPack = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (!p) return;
      w.__acironOpenPack = undefined;
      void importFromPath(p);
    };
    window.addEventListener("aciron-open-pack", onPack);
    return () => window.removeEventListener("aciron-open-pack", onPack);
  }, [importFromPath]);

  const dropKind: ContentKind = contentTab === "console" ? "mod" : contentTab;
  const onFilesDropped = useCallback(
    async (paths: string[]) => {
      const packs = paths.filter((p) => /\.(acpack|mrpack)$/i.test(p));
      if (packs.length > 0) {
        for (const p of packs) await importFromPath(p);
        return;
      }
      if (view !== "detail" || !selectedId) {
        toast(t("Откройте сборку — тогда моды и паки можно бросать прямо в неё"), "info");
        return;
      }
      try {
        const [updated, added, skipped] = await addContentFiles(selectedId, paths, dropKind);
        setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));
        if (added > 0) {
          toast(
            added === 1 ? t("Файл добавлен в сборку") : t("Добавлено файлов: {n}", { n: added }),
            "success"
          );
        }
        if (skipped > 0 && added === 0) {
          toast(t("Ничего не добавили: подходят только .jar и .zip"), "error");
        } else if (skipped > 0) {
          toast(t("Пропущено: {n}", { n: skipped }), "info");
        }
      } catch (e) {
        toast(ts(String(e)), "error");
      }
    },
    [selectedId, view, dropKind, importFromPath, toast]
  );

  const dropping = useFileDrop(view !== "browse", onFilesDropped);

  const contentMods = contentTab === "console" ? null : contentTab;
  const all = useMemo(
    () => (selected && contentMods ? selected.mods.filter((m) => m.kind === contentMods) : []),
    [selected?.mods, contentMods]
  );
  const enabledCount = useMemo(() => all.filter((m) => m.enabled).length, [all]);
  const outdatedCount = useMemo(
    () => all.filter((m) => updates.includes(m.project_id)).length,
    [all, updates]
  );
  const items = useMemo(() => {
    const q = modSearch.trim().toLowerCase();
    return all
      .filter((m) =>
        modFilter === "on"
          ? m.enabled
          : modFilter === "off"
          ? !m.enabled
          : modFilter === "outdated"
          ? updates.includes(m.project_id)
          : true
      )
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q));
  }, [all, modFilter, modSearch, updates]);

  const openBuild = async (id: string) => {
    setSelectedId(id);
    setView("detail");
    setContentTab("mod");
    setModSearch("");
    setModFilter("all");
    setPicked([]);

    setUpdates([]);
    checkBuildUpdates(id)
      .then(setUpdates)
      .catch(() => {});

    try {
      const updated = await refreshBuildContent(id);
      setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));

      matchLocalMods(id)
        .then((enriched) =>
          setBuilds((list) => list.map((b) => (b.id === enriched.id ? enriched : b)))
        )
        .catch(() => {});
    } catch {

    }
  };

  const doRefresh = async () => {
    if (!selected) return;
    const updated = await refreshBuildContent(selected.id);
    setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));
    try {
      const enriched = await matchLocalMods(selected.id);
      setBuilds((list) => list.map((b) => (b.id === enriched.id ? enriched : b)));
    } catch {

    }
    toast(t("Список контента обновлён"), "info");
  };

  const confirmDelete = async () => {
    const b = confirmDel;
    if (!b) return;
    if (isRunning(`build:${b.id}`) || downloading) {
      toast(t("Нельзя удалить сборку, пока она запущена или идёт скачивание"), "error");
      return;
    }

    setDyingId(b.id);
    await deleteBuild(b.id);
    setTimeout(async () => {
      await refresh();
      setDyingId(null);
      toast(t("Сборка «{name}» удалена", { name: b.name }), "success");
    }, CARD_FALL_MS);
  };

  const removeMods = (mods: InstalledMod[]) => {
    if (!selected || mods.length === 0) return;
    const ids = mods.map((m) => m.project_id);
    setConfirmMods(null);
    setDyingMods(ids);
    setTimeout(async () => {
      let last: Build | null = null;
      try {
        for (const id of ids) last = await removeMod(selected.id, id);
        if (last) setBuilds((list) => list.map((b) => (b.id === last!.id ? last! : b)));
        toast(
          mods.length > 1
            ? t("Удалено: {n} шт.", { n: mods.length })
            : t("«{name}» удалён", { name: mods[0].name }),
          "success"
        );
      } catch (e) {
        toast(ts(String(e)), "error");
      }
      setDyingMods([]);
      setPicked((p) => p.filter((x) => !ids.includes(x)));
    }, ROW_OUT_MS);
  };

  const updateOneMod = useCallback(
    async (projectId: string, name: string) => {
      if (!selectedId || updatingRef.current.has(projectId)) return;
      setUpdatingMod((prev) => new Set(prev).add(projectId));
      startTask(`mod:${projectId}`, t("Обновление · {name}", { name }));
      try {
        const updated = await modrinthInstall(selectedId, projectId);
        if (wasCancelled(`mod:${projectId}`)) return;
        setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));
        setUpdates((u) => u.filter((id) => id !== projectId));
        endTask(`mod:${projectId}`, true);
        toast(t("«{name}» обновлён", { name }), "success");
      } catch (e) {
        endTask(`mod:${projectId}`, false);
        toast(ts(String(e)), "error");
      }
      setUpdatingMod((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    },
    [selectedId, toast]
  );

  const toggleOneMod = useCallback(
    async (projectId: string) => {
      if (!selectedId) return;
      const updated = await toggleMod(selectedId, projectId);
      setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));
      const m = updated.mods.find((x) => x.project_id === projectId);
      if (m)
        toast(
          t("Мод «{name}» {state}", {
            name: m.name,
            state: t(m.enabled ? "включён" : "выключен"),
          }),
          "info"
        );
    },
    [selectedId, toast]
  );

  const togglePicked = useCallback(
    (projectId: string) =>
      setPicked((p) =>
        p.includes(projectId) ? p.filter((x) => x !== projectId) : [...p, projectId]
      ),
    []
  );
  const openModPage = useCallback(
    (m: InstalledMod) => {
      const target = modPageTarget(m);
      if (target) setModPage(target);
    },
    []
  );
  const confirmRemoveOne = useCallback((m: InstalledMod) => setConfirmMods([m]), []);

  const onInstalled = (updated: Build) =>
    setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));

  const changeCover = async () => {
    if (!selected) return;
    const f = await pickFile(t("Изображение"), ["png", "jpg", "jpeg", "webp", "gif"]);
    if (!f) return;
    const updated = await setBuildImage(selected.id, f);
    setBuilds((list) => list.map((b) => (b.id === updated.id ? updated : b)));
    toast(t("Обложка обновлена"), "success");
  };

  const goBrowse = (query = "", kind: ContentKind = "mod") => {
    setBrowseQuery(query);
    setBrowseKind(kind);
    setView("browse");
  };

  if (view === "detail" && selected && modPage) {
    return (
      <ModDetail
        build={selected}
        hit={modPage.hit}
        kind={modPage.kind}
        source={modPage.source}
        onBack={() => setModPage(null)}
        onInstalled={onInstalled}
      />
    );
  }

  if (view === "browse" && selected) {
    return (
      <ModsBrowser
        build={selected}
        initialQuery={browseQuery}
        initialKind={browseKind}
        onBack={() => setView("detail")}
        onInstalled={onInstalled}
      />
    );
  }

  if (view === "detail" && selected) {
    return (
      <div className="relative flex h-full min-h-0 flex-col px-8 py-6">
        {}
        {dropping && (
          <div className="drop-overlay pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-[20px] border-2 border-dashed border-accent/70 bg-bg/70">
            <div className="text-center">
              <i className="fa-solid fa-download mb-3 block text-3xl text-accent" />
              <div className="text-sm font-semibold text-text">
                {t("Отпустите — разложим по папкам")}
              </div>
              <div className="mt-1 text-[12px] text-muted">
                {t(
                  "Моды (.jar) уйдут в mods, архивы — в ресурспаки или шейдеры, .acpack станет сборкой"
                )}
              </div>
            </div>
          </div>
        )}
        {}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex w-full items-center gap-4">
          <button
            onClick={changeCover}
            title={t("Изменить обложку")}
            className="group relative h-[72px] w-[72px] shrink-0"
          >
            <BuildCover build={selected} className="h-[72px] w-[72px]" rounded="rounded-[16px]" />
            <span className="absolute inset-0 grid place-items-center rounded-[16px] bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              <i className="fa-solid fa-camera text-sm text-white" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            {}
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="truncate text-[30px] font-light leading-none text-text">
                {selected.name}
              </h1>
              <button
                onClick={() => toggleFavorite(selected)}
                title={selected.favorite ? t("Открепить") : t("Закрепить")}
                className={`shrink-0 transition-colors ${
                  selected.favorite ? "text-accent" : "text-muted hover:text-accent"
                }`}
              >
                <i
                  className={`${selected.favorite ? "fa-solid" : "fa-regular"} fa-star text-[18px]`}
                />
              </button>
            </div>
            <div className="mt-2 truncate text-[12px] text-[#818181]">
              {loaderLabel[selected.loader] ?? selected.loader} · {selected.mc_version} ·{" "}
              {selected.mods.length} {t("элементов")}
              {selected.playtime_secs > 0 && ` · ${fmtPlaytime(selected.playtime_secs)}`}
            </div>
          </div>
          {}
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={doRefresh}
              title={t("Обновить список (подхватить ручные файлы)")}
              className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-arrows-rotate text-sm" />
            </button>
            <button
              onClick={() => setExportModal(true)}
              title={t("Экспорт сборки")}
              className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-file-export text-sm" />
            </button>
            <button
              onClick={() => setSettingsModal(true)}
              title={t("Настройка сборки")}
              className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-gear text-sm" />
            </button>
            <button
              onClick={() => openBuildFolder(selected.id)}
              title={t("Открыть папку сборки")}
              className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-folder-open text-sm" />
            </button>
          </div>

          {isRunning(`build:${selected.id}`) ? (
            <button
              onClick={() => stop(`build:${selected.id}`)}
              className="h-11 shrink-0 rounded-[8px] bg-[#ef4444] px-7 text-sm font-semibold text-white transition-colors hover:bg-[#dc2626]"
            >
              {t("Закрыть")}
            </button>
          ) : (
            <button
              onClick={() => startLaunch(selected.id, selected.name)}
              disabled={launching.has(`build:${selected.id}`)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-[8px] bg-accent px-7 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i
                className={`fa-solid ${
                  launching.has(`build:${selected.id}`) ? "fa-spinner fa-spin" : "fa-play"
                } text-xs`}
              />
              {t("Играть")}
            </button>
          )}
          </div>
        </div>

        {settingsModal && (
          <BuildSettingsModal
            build={selected}
            onClose={() => setSettingsModal(false)}
            onUpdated={updateBuild}
          />
        )}

        {exportModal && (
          <ExportBuildModal build={selected} onClose={() => setExportModal(false)} />
        )}

        {}
        {confirmMods && (
          <ConfirmModal
            title={confirmMods.length > 1 ? t("Удалить выбранное") : t("Удалить файл")}
            message={
              confirmMods.length > 1
                ? t("Удалить {n} шт. из сборки? Файлы будут стёрты с диска.", {
                    n: confirmMods.length,
                  })
                : t("Удалить «{name}» из сборки? Файл будет стёрт с диска.", {
                    name: confirmMods[0].name,
                  })
            }
            confirmLabel={t("Удалить")}
            confirmIcon="fa-trash-can"
            onConfirm={() => removeMods(confirmMods)}
            onClose={() => setConfirmMods(null)}
          />
        )}

        {}
        <div className="mb-4 flex items-baseline gap-4">
          {CONTENT_TABS.map((ct) => {
            const count = selected.mods.filter((m) => m.kind === ct.id).length;
            const active = contentTab === ct.id;
            return (
              <button
                key={ct.id}
                onClick={() => {
                  setContentTab(ct.id);
                  setModFilter("all");
                  setPicked([]);
                }}
                className={`flex items-baseline gap-1.5 text-[20px] font-light leading-none transition-colors ${
                  active ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                <div className="flex items-center gap-[5px]">
                  {t(ct.label)}
                  {count > 0 && (
                    <span
                      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10px] font-semibold leading-none ${
                        active ? "bg-accent/15 text-accent" : "bg-card text-muted"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {}
          <button
            onClick={() => setContentTab("console")}
            className={`flex items-baseline gap-1.5 text-[20px] font-light leading-none transition-colors ${
              contentTab === "console" ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            <span className="flex items-center gap-[6px]">
              {t("Консоль")}
              {isRunning(`build:${selected.id}`) && (
                <span className="h-2 w-2 rounded-full bg-[#4ade80]" title={t("Игра запущена")} />
              )}
            </span>
          </button>
        </div>

        {contentTab === "console" && (
          <GameConsole
            gameId={`build:${selected.id}`}
            running={isRunning(`build:${selected.id}`)}
          />
        )}

        {contentTab !== "console" && (() => {
          const meta = CONTENT_TABS.find((c) => c.id === contentTab)!;

          const on = enabledCount;

          if (all.length === 0) {
            return (
              <div className="grid min-h-0 flex-1 place-items-center text-center">
                <div className="max-w-xs">
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-card text-xl text-accent">
                    <i className={`fa-solid ${meta.icon}`} />
                  </div>
                  <p className="mb-4 text-sm text-muted">{t(meta.empty)}</p>
                  <button
                    onClick={() => goBrowse("", contentTab)}
                    className="mx-auto flex h-10 items-center gap-2 rounded-[8px] bg-accent px-5 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
                  >
                    <i className="fa-solid fa-plus text-xs" />
                    {t("Добавить")} · {t(meta.label).toLowerCase()}
                  </button>
                </div>
              </div>
            );
          }

          const outdated = outdatedCount;

          const FILTERS: { id: ModFilter; label: string; count: number }[] = [
            { id: "all", label: "Все", count: all.length },
            { id: "on", label: "Включённые", count: on },
            { id: "off", label: "Выключенные", count: all.length - on },
            { id: "outdated", label: "Есть обновление", count: outdated },
          ];

          return (
            <div className="flex min-h-0 flex-1 gap-5">
              {}
              <aside className="flex w-[180px] shrink-0 flex-col">
                <div className="space-y-1">
                  {FILTERS.map((f) => {
                    const active = modFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setModFilter(f.id)}
                        className={`flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm transition-colors ${
                          active ? "bg-card text-text" : "text-muted hover:text-text"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{t(f.label)}</span>
                        <span
                          className={`shrink-0 text-[11px] ${active ? "text-accent" : "text-muted"}`}
                        >
                          {f.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setView("list")}
                  className="mt-auto flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm text-muted transition-colors hover:text-text"
                >
                  <i className="fa-solid fa-arrow-left text-xs" />
                  {t("Все сборки")}
                </button>
              </aside>

              {}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
                    <i className="fa-solid fa-magnifying-glass text-xs text-muted" />
                    <input
                      className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                      placeholder={`${t("Поиск")} · ${t(meta.label).toLowerCase()}`}
                      value={modSearch}
                      onChange={(e) => setModSearch(e.target.value)}
                    />
                    {modSearch && (
                      <button
                        onClick={() => setModSearch("")}
                        title={t("Очистить")}
                        className="shrink-0 text-muted transition-colors hover:text-text"
                      >
                        <i className="fa-solid fa-xmark text-xs" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => goBrowse(modSearch, contentTab)}
                    className="flex h-10 shrink-0 items-center gap-2 rounded-[8px] bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
                  >
                    <i className="fa-solid fa-plus text-xs" />
                    {t("Добавить")}
                  </button>
                </div>

                {}
                <div className="mb-2 flex items-center gap-3 px-1">
                  <button
                    onClick={() => {
                      const ids = items.map((m) => m.project_id);
                      const allPicked = ids.length > 0 && ids.every((id) => picked.includes(id));
                      setPicked(allPicked ? [] : ids);
                    }}
                    className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-text"
                  >
                    <Check
                      on={items.length > 0 && items.every((m) => picked.includes(m.project_id))}
                    />
                    {t("Выделить все")}
                  </button>
                  {picked.length > 0 && (
                    <>
                      <span className="text-[12px] text-[#818181]">{t("выбрано")} {picked.length}</span>
                      <button
                        onClick={() => setConfirmMods(items.filter((m) => picked.includes(m.project_id)))}
                        className="flex h-8 items-center gap-2 rounded-[8px] bg-[#ef4444] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#dc2626]"
                      >
                        <i className="fa-solid fa-trash-can text-xs" />
                        {t("Удалить")}
                      </button>
                    </>
                  )}
                  <ViewToggle className="ml-auto" />
                </div>

                {}
                {}
                <div
                  className={`min-h-0 flex-1 overflow-y-auto py-1 pr-1 pb-4 ${
                    rowView === "grid"
                      ? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-2.5"
                      : "space-y-2"
                  }`}
                >
                  {items.length === 0 && (
                    <div className="rounded-[16px] bg-card p-4 text-center text-xs text-muted">
                      {t("Ничего не нашлось")}
                    </div>
                  )}
                  {items.map((m, i) => (
                    <ModRow
                      key={m.project_id}
                      m={m}
                      i={i}
                      metaIcon={meta.icon}
                      picked={picked.includes(m.project_id)}
                      hasUpdate={updates.includes(m.project_id)}
                      updating={updatingMod.has(m.project_id)}
                      leaving={dyingMods.includes(m.project_id)}
                      onTogglePick={togglePicked}
                      onOpen={openModPage}
                      onUpdate={updateOneMod}
                      onToggle={toggleOneMod}
                      onRemove={confirmRemoveOne}
                      tile={rowView === "grid"}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col px-8 py-6">
      {}
      {dropping && (
        <div className="drop-overlay pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-[20px] border-2 border-dashed border-accent/70 bg-bg/70">
          <div className="text-center">
            <i className="fa-solid fa-file-arrow-down mb-3 block text-3xl text-accent" />
            <div className="text-sm font-semibold text-text">
              {t("Отпустите — импортируем сборку")}
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {t("Подойдут .acpack и .mrpack")}
            </div>
          </div>
        </div>
      )}
      {}
      <div className="flex justify-between">
        <h1 className="mb-5 text-[30px] font-light leading-none text-text">
          {t("Сборки")}
        </h1>
        {tab === "mine" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={importPack}
              disabled={importing}
              title={t("Импортировать сборку .acpack или модпак .mrpack")}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("Импорт")}
              <i className={`fa-solid ${importing ? "fa-spinner fa-spin" : "fa-file-zipper"}`} />
            </button>
            <button
              onClick={() => setCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
            >
              <i className="fa-solid fa-plus" />
              {t("Создать сборку")}
            </button>
          </div>
        )}
      </div>
      <div className="mb-5 flex items-baseline gap-4">
        {(
          [
            { id: "mine", label: "Мои сборки" },
            { id: "popular", label: "Популярные" },
          ] as const
        ).map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`text-[20px] font-light leading-none transition-colors ${
              tab === x.id ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {tab === "popular" ? (
        <ModpackBrowser
          onInstalled={() => {
            refresh();
            setTab("mine");
          }}
        />
      ) : (
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {builds.length === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-card text-2xl text-muted">
                <i className="fa-solid fa-cubes-stacked" />
              </div>
              <h2 className="font-semibold text-text">{t("Сборок пока нет")}</h2>
              <p className="mt-1 text-sm text-muted">
                {t("Создайте сборку, выберите ядро и добавьте моды с Modrinth")}
              </p>
            </div>
          </div>
        ) : (
          <>
          {builds.length > 0 && (() => {
            const totalPages = Math.ceil(ordered.length / BUILDS_PER_PAGE);
            const safePage = Math.min(page, Math.max(0, totalPages - 1));
            const pageBuilds = ordered.slice(
              safePage * BUILDS_PER_PAGE,
              safePage * BUILDS_PER_PAGE + BUILDS_PER_PAGE
            );
            return (
              <>
                {}
                <div
                  ref={gridRef}
                  className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]"
                >
                  {pageBuilds.map((b, i) => {
                    const running = isRunning(`build:${b.id}`);
                    const art = coverFor(`build:${b.id}`, b.mc_version);
                    const isDying = dyingId === b.id;
                    return (
                      <div
                        key={b.id}
                        data-flip-id={b.id}
                        onClick={() => !isDying && openBuild(b.id)}
                        style={isDying ? undefined : cardInDelay(i)}
                        className={`group relative h-[150px] w-full max-w-[285px] cursor-pointer overflow-hidden rounded-[16px] border-1 border-[#232427]/65 bg-card ${
                          isDying ? "card-fall" : "card-in"
                        }`}
                      >
                        {}
                        {b.banner ? (
                          <BuildBanner build={b} className="absolute inset-0 h-full w-full" />
                        ) : b.image ? (
                          <BuildCover
                            build={b}
                            className="absolute inset-0 h-full w-full"
                            rounded="rounded-none"
                          />
                        ) : art ? (
                          <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-card to-bg" />
                        )}
                        <div className="absolute inset-0 bg-[var(--veil)]" />

                        {}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleFavorite(b);
                          }}
                          title={b.favorite ? t("Открепить") : t("Закрепить")}
                          className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg transition ${
                            b.favorite
                              ? "text-accent opacity-100"
                              : "text-[var(--veil-text-dim)] opacity-0 hover:text-accent group-hover:opacity-100"
                          }`}
                        >
                          <i
                            className={`${b.favorite ? "fa-solid" : "fa-regular"} fa-star text-sm`}
                          />
                        </button>

                        {}
                        <div className="absolute right-2 top-2 flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (running || downloading) return;
                              setConfirmDel(b);
                            }}
                            disabled={running || downloading}
                            title={running ? t("Сборка запущена") : t("Удалить сборку")}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--veil-btn)] text-[var(--veil-text-dim)] opacity-0 transition hover:bg-[#FF3535]/50 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed"
                          >
                            <i className="fa-solid fa-trash-can text-xs" />
                          </button>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-medium text-[var(--veil-text)]">
                              {b.name}
                            </div>
                            <div className="truncate text-[10px] text-[var(--veil-text-dim)]">
                              {b.mc_version} · {loaderLabel[b.loader] ?? b.loader} · {b.mods.length} {t("модов")}
                              {b.playtime_secs > 0 && ` · ${fmtPlaytime(b.playtime_secs)}`}
                            </div>
                          </div>
                          {running ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                stop(`build:${b.id}`);
                              }}
                              className="h-9 shrink-0 rounded-[8px] bg-[#ef4444] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#dc2626]"
                            >
                              {t("Закрыть")}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startLaunch(b.id, b.name);
                              }}
                              disabled={launching.has(`build:${b.id}`)}
                              title={t("Запустить сборку")}
                              className="h-9 shrink-0 rounded-[8px] bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {launching.has(`build:${b.id}`) ? (
                                <i className="fa-solid fa-spinner fa-spin" />
                              ) : (
                                t("Играть")
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {}
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              </>
            );
          })()}
          </>
        )}
      </div>
      )}

      {createModal && (
        <CreateBuildModal
          onClose={() => setCreateModal(false)}
          onCreated={() => {
            refresh();
            toast(t("Сборка создана"), "success");
          }}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          title={t("Удалить сборку")}
          message={t(
            "Удалить сборку «{name}» вместе со всеми модами? Это действие нельзя отменить.",
            { name: confirmDel.name }
          )}
          onConfirm={confirmDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {confirmMods && (
        <ConfirmModal
          title={confirmMods.length > 1 ? t("Удалить выбранное") : t("Удалить файл")}
          message={
            confirmMods.length > 1
              ? t("Удалить {n} шт. из сборки? Файлы будут стёрты с диска.", {
                  n: confirmMods.length,
                })
              : t("Удалить «{name}» из сборки? Файл будет стёрт с диска.", {
                  name: confirmMods[0].name,
                })
          }
          confirmLabel={t("Удалить")}
          confirmIcon="fa-trash-can"
          onConfirm={() => removeMods(confirmMods)}
          onClose={() => setConfirmMods(null)}
        />
      )}
    </div>
  );
}
