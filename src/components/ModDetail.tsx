import { useEffect, useState } from "react";
import {
  contentProject,
  installContent,
  installContentVersion,
  openUrl,
  type Build,
  type ContentKind,
  type ModHit,
  type ModProject,
  type ModVersion,
  type SourceId,
} from "../api";
import { useToast } from "../ToastContext";
import VersionList from "./VersionList";
import Lightbox from "./Lightbox";
import { t, ts } from "../i18n";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function ModDetail({
  build,
  hit,

  kind: _kind = "mod",
  source = "modrinth",
  onBack,
  onInstalled,
}: {
  build: Build;
  hit: ModHit;
  kind?: ContentKind;
  source?: SourceId;
  onBack: () => void;
  onInstalled: (b: Build) => void;
}) {
  const [project, setProject] = useState<ModProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"about" | "versions">("about");
  const [verBusy, setVerBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    contentProject(source, hit.project_id).then(setProject).catch(() => {});
  }, [source, hit.project_id]);

  const installedMod = build.mods.find((m) => m.project_id === hit.project_id);
  const installed = !!installedMod;

  const installVersion = async (v: ModVersion) => {
    if (verBusy) return;
    setVerBusy(v.id);
    try {
      const updated = await installContentVersion(source, build.id, hit.project_id, v.id);
      onInstalled(updated);
      toast(
        t("«{title}» {version} установлен", { title: hit.title, version: v.version_number }),
        "success"
      );
    } catch (e) {
      toast(ts(String(e)), "error");
    } finally {
      setVerBusy(null);
    }
  };

  const install = async () => {
    if (installed || busy) return;
    setBusy(true);
    try {
      const updated = await installContent(source, build.id, hit.project_id);
      onInstalled(updated);
      toast(t("«{title}» установлен", { title: hit.title }), "success");
    } catch (e) {
      toast(ts(String(e)), "error");
    } finally {
      setBusy(false);
    }
  };
  const icon = project?.icon_url || hit.icon_url;
  const slug = project?.slug || hit.slug;
  const downloads = project?.downloads ?? hit.downloads;
  const gallery = project?.gallery ?? [];

  const siteLink =
    source === "curseforge"
      ? { label: "CurseForge", url: project?.website_url || `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(slug)}` }
      : { label: "Modrinth", url: `https://modrinth.com/mod/${slug}` };

  const links: { label: string; url?: string; icon: string }[] = [
    { label: siteLink.label, url: siteLink.url, icon: "fa-arrow-up-right-from-square" },
    { label: t("Исходники"), url: project?.source_url, icon: "fa-code" },
    { label: t("Проблемы"), url: project?.issues_url, icon: "fa-bug" },
    { label: "Wiki", url: project?.wiki_url, icon: "fa-book" },
    { label: "Discord", url: project?.discord_url, icon: "fa-discord" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-card">
          {icon ? (
            <img src={icon} alt="" className="h-full w-full object-cover" />
          ) : (
            <i className="fa-solid fa-cube text-2xl text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-light leading-none text-text">{hit.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#818181]">
            {hit.author && <span>{t("от {author}", { author: hit.author })}</span>}
            <span>
              <i className="fa-solid fa-download mr-1 text-[10px]" />
              {fmt(downloads)}
            </span>
            {project && (
              <span>
                <i className="fa-solid fa-heart mr-1 text-[10px]" />
                {fmt(project.followers)}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {hit.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {links.find((l) => l.url) && (
            <button
              onClick={() => openUrl(links.find((l) => l.url)!.url!)}
              title={t("Открыть страницу проекта")}
              className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-sm" />
            </button>
          )}
          <button
            onClick={install}
            disabled={installed || busy}
            className={`flex h-11 items-center gap-2 rounded-[8px] px-7 text-sm font-semibold transition-colors ${
              installed
                ? "cursor-default bg-card text-muted"
                : "bg-accent text-bg hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
            }`}
          >
            {busy && <i className="fa-solid fa-spinner fa-spin text-xs" />}
            {busy ? t("Установка…") : installed ? t("Установлено") : t("Скачать")}
          </button>
        </div>
      </div>

      {}
      <div className="mb-4 flex items-baseline gap-4">
        {(
          [
            ["about", "Описание"],
            ["versions", "Версии"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-[20px] font-light leading-none transition-colors ${
              tab === id ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {}
        <aside className="flex w-[240px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-[16px] border-1 border-[#232427]/65 bg-card p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("Установить в")}
              </div>
              <div className="truncate text-sm text-text">{build.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-[#818181]">
                {build.mc_version} · {loaderLabel[build.loader] ?? build.loader}
              </div>
            </div>

            {hit.categories.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Категории")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hit.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-card px-2 py-1 text-[11px] capitalize text-muted"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {links.some((l) => l.url) && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Ссылки")}
                </div>
                <div className="space-y-1">
                  {links
                    .filter((l) => l.url)
                    .map((l) => (
                      <button
                        key={l.label}
                        onClick={() => openUrl(l.url!)}
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-left text-sm text-muted transition-colors hover:text-accent"
                      >
                        <i
                          className={`${l.icon === "fa-discord" ? "fa-brands" : "fa-solid"} ${
                            l.icon
                          } w-4 text-center text-xs`}
                        />
                        <span className="truncate">{l.label}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={onBack}
            className="mt-3 flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm text-muted transition-colors hover:text-text"
          >
            <i className="fa-solid fa-arrow-left text-xs" />
            {t("Назад")}
          </button>
        </aside>

        {}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 pb-4">
          {tab === "versions" ? (
            <VersionList
              source={source}
              projectId={hit.project_id}
              currentVersionId={installedMod?.version_id}
              showFilters
              busyId={verBusy}
              onPick={installVersion}
            />
          ) : (
            <>
              {gallery.length > 0 && (
                <div className="mb-4 flex gap-3 overflow-x-auto pb-1">
                  {gallery.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setLightbox(i)}
                      title={t("Открыть")}
                      className="group relative h-40 shrink-0 overflow-hidden rounded-[16px] border-1 border-[#232427]/65"
                    >
                      <img
                        src={g.url}
                        alt={g.title ?? ""}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <i className="fa-solid fa-magnifying-glass-plus text-white" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="rounded-[16px] border-1 border-[#232427]/65 bg-card p-5">
                <p className="text-sm leading-relaxed text-text">{hit.description}</p>
                <p className="mt-5 text-xs text-muted">
                  {t(
                    "Полное описание и список изменений — на странице проекта (кнопка со стрелкой вверху). Версии — во вкладке «Версии»."
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox images={gallery} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
