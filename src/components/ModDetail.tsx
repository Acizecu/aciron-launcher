import { useEffect, useState, type ReactNode } from "react";
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
import RichText from "./RichText";
import { dtf, t, ts } from "../i18n";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

function sideLabel(side: string): string {
  switch (side) {
    case "required":
      return t("обязателен");
    case "optional":
      return t("по желанию");
    case "unsupported":
      return t("не нужен");
    case "unknown":
      return t("неизвестно");
    default:
      return side;
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function date(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dtf().format(d);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-text">{children}</span>
    </div>
  );
}

export default function ModDetail({
  build,
  hit,

  kind = "mod",
  source = "modrinth",
  onBack,
  onInstalled,
  resolveBuild,
}: {

  build: Build | null;
  hit: ModHit;
  kind?: ContentKind;
  source?: SourceId;
  onBack: () => void;
  onInstalled: (b: Build) => void;
  resolveBuild?: (projectId: string, source: SourceId, kind: ContentKind) => Promise<Build | null>;
}) {
  const [project, setProject] = useState<ModProject | null>(null);

  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"about" | "versions">("about");
  const [verBusy, setVerBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {

    let dead = false;
    setProject(null);
    setFailed(false);
    contentProject(source, hit.project_id)
      .then((p) => !dead && setProject(p))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [source, hit.project_id]);

  const installedMod = build?.mods.find((m) => m.project_id === hit.project_id);
  const installed = !!installedMod;

  const installVersion = async (v: ModVersion) => {
    if (verBusy) return;
    const target = build ?? (await resolveBuild?.(hit.project_id, source, kind)) ?? null;
    if (!target) return;
    setVerBusy(v.id);
    try {
      const updated = await installContentVersion(source, target.id, hit.project_id, v.id);
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
    const target = build ?? (await resolveBuild?.(hit.project_id, source, kind)) ?? null;
    if (!target) return;
    setBusy(true);
    try {
      const updated = await installContent(source, target.id, hit.project_id);
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
  const title = project?.title || hit.title;
  const downloads = project?.downloads ?? hit.downloads;
  const gallery = project?.gallery ?? [];

  const summary = project?.description || hit.description;

  const authors = project?.authors?.length
    ? project.authors.map((a) => a.name).join(", ")
    : hit.author;

  const siteLink =
    source === "curseforge"
      ? {
          label: "CurseForge",
          url:
            project?.website_url ||
            `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(slug)}`,
        }
      : source === "ftb"
      ? {
          label: "FTB",
          url: project?.website_url || `https://www.feed-the-beast.com/modpacks/${slug}`,
        }
      : { label: "Modrinth", url: project?.website_url || `https://modrinth.com/mod/${slug}` };

  const links: { label: string; url?: string | null; icon: string }[] = [
    { label: siteLink.label, url: siteLink.url, icon: "fa-arrow-up-right-from-square" },
    { label: t("Исходники"), url: project?.source_url, icon: "fa-code" },
    { label: t("Проблемы"), url: project?.issues_url, icon: "fa-bug" },
    { label: "Wiki", url: project?.wiki_url, icon: "fa-book" },
    { label: "Discord", url: project?.discord_url, icon: "fa-discord" },
    ...(project?.donation_urls ?? []).map((d) => ({
      label: d.platform || t("Поддержать автора"),
      url: d.url,
      icon: "fa-heart",
    })),
  ];

  const updated = date(project?.updated);
  const published = date(project?.published);
  const ram = project?.ram_rec_mb ?? project?.ram_min_mb;
  const categories = [
    ...(project?.categories ?? hit.categories),
    ...(project?.additional_categories ?? []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-card">
          {icon ? (
            <img src={icon} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <i className="fa-solid fa-cube text-2xl text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[30px] font-light leading-none text-text">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            {authors && <span className="truncate">{t("от {author}", { author: authors })}</span>}
            <span title={t("Загрузок")}>
              <i className="fa-solid fa-download mr-1 text-[10px]" />
              {fmt(downloads)}
            </span>
            {}
            {project?.followers != null && (
              <span title={source === "curseforge" ? t("Лайков") : t("Подписчиков")}>
                <i
                  className={`fa-solid mr-1 text-[10px] ${
                    source === "curseforge" ? "fa-thumbs-up" : "fa-heart"
                  }`}
                />
                {fmt(project.followers)}
              </span>
            )}
            {updated && (
              <span title={t("Обновлён")}>
                <i className="fa-solid fa-clock-rotate-left mr-1 text-[10px]" />
                {updated}
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">{summary}</p>
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
      {project?.allow_distribution === false && (
        <div className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#fbbf24]/10 px-3 py-2 text-[12px] text-[#fbbf24]">
          <i className="fa-solid fa-triangle-exclamation mt-0.5" />
          <span>
            {t(
              "Автор запретил сторонним лаунчерам скачивать файлы этого проекта. Установить получится только вручную, со страницы проекта."
            )}
          </span>
        </div>
      )}
      {project && !project.is_available && (
        <div className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#fbbf24]/10 px-3 py-2 text-[12px] text-[#fbbf24]">
          <i className="fa-solid fa-box-archive mt-0.5" />
          <span>{t("Проект скрыт или заархивирован — новых версий у него не будет.")}</span>
        </div>
      )}

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
              {build ? (
                <>
                  <div className="truncate text-sm text-text">{build.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {build.mc_version} · {loaderLabel[build.loader] ?? build.loader}
                  </div>
                </>
              ) : (
                <div className="text-[11px] leading-snug text-muted">
                  {t("Сборку выберете при установке — покажем только те, куда это встанет.")}
                </div>
              )}
            </div>

            {}
            {project && (
              <div className="space-y-1.5">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("О проекте")}
                </div>
                {project.license_name && (
                  <Row label={t("Лицензия")}>
                    {project.license_url ? (
                      <button
                        onClick={() => openUrl(project.license_url!)}
                        className="truncate text-accent transition-colors hover:text-accent-hover"
                      >
                        {project.license_name}
                      </button>
                    ) : (
                      project.license_name
                    )}
                  </Row>
                )}
                {project.client_side && (
                  <Row label={t("На клиенте")}>
                    {sideLabel(project.client_side)}
                  </Row>
                )}
                {project.server_side && (
                  <Row label={t("На сервере")}>
                    {sideLabel(project.server_side)}
                  </Row>
                )}
                {published && <Row label={t("Создан")}>{published}</Row>}
                {updated && <Row label={t("Обновлён")}>{updated}</Row>}
                {project.versions_count != null && (
                  <Row label={t("Версий")}>{project.versions_count}</Row>
                )}
                {project.plays != null && <Row label={t("Запусков")}>{fmt(project.plays)}</Row>}
                {ram != null && (
                  <Row label={t("Памяти")}>
                    {(ram / 1024).toFixed(1)} {t("ГБ")}
                  </Row>
                )}
              </div>
            )}

            {project && project.loaders.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Загрузчики")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {project.loaders.map((l) => (
                    <span key={l} className="rounded-md bg-card px-2 py-1 text-[11px] text-muted">
                      {loaderLabel[l] ?? l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {project && project.game_versions.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Версии игры")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {}
                  {project.game_versions.slice(0, 12).map((v) => (
                    <span key={v} className="rounded-md bg-card px-2 py-1 text-[11px] text-muted">
                      {v}
                    </span>
                  ))}
                  {project.game_versions.length > 12 && (
                    <span className="px-1 py-1 text-[11px] text-muted">
                      {t("и ещё {n}", { n: project.game_versions.length - 12 })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {categories.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {t("Категории")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
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
                        key={l.label + l.url}
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
                      title={g.title || t("Открыть")}
                      className="group relative h-40 shrink-0 overflow-hidden rounded-[16px] border-1 border-[#232427]/65"
                    >
                      <img
                        src={g.url}
                        alt={g.title ?? ""}
                        referrerPolicy="no-referrer"
                        loading="lazy"
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
                {!project && !failed ? (
                  <div className="grid h-24 place-items-center text-muted">
                    <i className="fa-solid fa-spinner fa-spin" />
                  </div>
                ) : project?.body && project.body_format ? (
                  <>
                    {}
                    <RichText source={project.body} format={project.body_format} />
                    {project.body_truncated && (
                      <p className="mt-5 text-xs text-muted">
                        {t("Описание длинное и показано не целиком.")}{" "}
                        <button
                          onClick={() => openUrl(siteLink.url)}
                          className="text-accent transition-colors hover:text-accent-hover"
                        >
                          {t("Открыть на {site}", { site: siteLink.label })}
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-text">{summary}</p>
                    <p className="mt-5 text-xs text-muted">
                      {failed
                        ? t("Не удалось получить описание с площадки.")
                        : t("Полного описания у этого проекта нет.")}{" "}
                      <button
                        onClick={() => openUrl(siteLink.url)}
                        className="text-accent transition-colors hover:text-accent-hover"
                      >
                        {t("Открыть на {site}", { site: siteLink.label })}
                      </button>
                    </p>
                  </>
                )}
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
