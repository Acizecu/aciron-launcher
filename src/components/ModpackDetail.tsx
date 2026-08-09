import { useEffect, useState } from "react";
import {
  contentProject,
  installModpackContent,
  openUrl,
  type ModHit,
  type ModProject,
  type ModVersion,
  type SourceId,
} from "../api";
import { useToast } from "../ToastContext";
import VersionList from "./VersionList";
import Lightbox from "./Lightbox";
import { t, ts } from "../i18n";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function packUrl(source: SourceId, slug: string): string {
  if (source === "curseforge") return `https://www.curseforge.com/minecraft/modpacks/${slug}`;
  if (source === "ftb") return `https://www.feed-the-beast.com/modpacks/${slug}`;
  return `https://modrinth.com/modpack/${slug}`;
}

export default function ModpackDetail({
  pack,
  source,
  onBack,
  onInstalled,
}: {
  pack: ModHit;
  source: SourceId;
  onBack: () => void;
  onInstalled: () => void;
}) {
  const [project, setProject] = useState<ModProject | null>(null);
  const [tab, setTab] = useState<"about" | "versions">("about");
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    contentProject(source, pack.project_id).then(setProject).catch(() => {});
  }, [source, pack.project_id]);

  const install = async (v: ModVersion) => {
    if (busy) return;
    setBusy(v.id);

    window.dispatchEvent(new CustomEvent("aciron-task-start", { detail: { name: pack.title } }));
    try {
      await installModpackContent(source, pack.project_id, v.id);
      toast(
        t("Сборка «{title}» ({version}) установлена", {
          title: pack.title,
          version: v.version_number,
        }),
        "success",
      );
      onInstalled();
    } catch (e) {
      toast(ts(String(e)), "error");
      window.dispatchEvent(new Event("aciron-task-end"));
    } finally {
      setBusy(null);
    }
  };

  const icon = project?.icon_url || pack.icon_url;
  const slug = project?.slug || pack.slug;
  const downloads = project?.downloads ?? pack.downloads;
  const gallery = project?.gallery ?? [];

  const links: { label: string; url?: string; icon: string }[] = [
    {
      label: source === "curseforge" ? "CurseForge" : source === "ftb" ? "FTB" : "Modrinth",
      url: project?.website_url || packUrl(source, slug),
      icon: "fa-arrow-up-right-from-square",
    },
    { label: t("Исходники"), url: project?.source_url, icon: "fa-code" },
    { label: t("Проблемы"), url: project?.issues_url, icon: "fa-bug" },
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
            <i className="fa-solid fa-cubes-stacked text-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-light leading-none text-text">{pack.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#818181]">
            {pack.author && <span>{t("от")} {pack.author}</span>}
            <span>
              <i className="fa-solid fa-download mr-1 text-[10px]" />
              {fmt(downloads)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {pack.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onBack}
            title={t("Назад")}
            className="grid h-11 w-11 place-items-center rounded-[8px] bg-card text-muted transition-colors hover:text-text"
          >
            <i className="fa-solid fa-arrow-left text-sm" />
          </button>
          <button
            onClick={() => setTab("versions")}
            className="h-11 rounded-[8px] bg-accent px-7 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
          >
            {t("Установить")}
          </button>
        </div>
      </div>

      {}
      <div className="mb-4 flex items-baseline gap-4">
        {([
          ["about", t("Описание")],
          ["versions", t("Версии")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`text-[20px] font-light leading-none transition-colors ${
              tab === id ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "versions" ? (
          <div className="p-4">
            <p className="mb-3 text-xs text-muted">
              {t("Выберите версию — она установится как отдельная сборка.")}
            </p>
            <VersionList
              source={source}
              projectId={pack.project_id}
              actionLabel={t("Скачать")}
              showFilters
              busyId={busy}
              onPick={install}
            />
          </div>
        ) : (
          <>
            {gallery.length > 0 && (
              <div className="flex gap-3 overflow-x-auto border-b border-border p-4">
                {gallery.map((g, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightbox(idx)}
                    className="group relative h-40 shrink-0 overflow-hidden rounded-lg border border-border"
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

            <div className="p-5">
              <p className="text-sm leading-relaxed text-text">{pack.description}</p>

              {pack.categories.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {pack.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {links
                  .filter((l) => l.url)
                  .map((l) => (
                    <button
                      key={l.label}
                      onClick={() => openUrl(l.url!)}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      <i className={`${l.icon === "fa-discord" ? "fa-brands" : "fa-solid"} ${l.icon}`} />
                      {l.label}
                    </button>
                  ))}
              </div>

              <p className="mt-6 text-xs text-muted">
                {t("Список версий и установка — во вкладке «Версии».")}
              </p>
            </div>
          </>
        )}
      </div>

      {lightbox !== null && (
        <Lightbox images={gallery} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
