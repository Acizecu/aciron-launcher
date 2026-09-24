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
import Icon from "./Icon";
import { Tabs } from "./ui/ds";

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
    <div className="flex items-baseline justify-between gap-3 py-2 text-[13px] first:pt-0">
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
  const [tab, setTab] = useState<"about" | "gallery" | "versions">("about");
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

  const hero = gallery.find((g) => g.featured)?.url ?? gallery[0]?.url ?? null;
  const tabs: { id: "about" | "gallery" | "versions"; label: string; count?: number }[] = [
    { id: "about", label: t("Описание") },
    ...(gallery.length > 0 ? [{ id: "gallery" as const, label: t("Галерея"), count: gallery.length }] : []),
    { id: "versions", label: t("Версии"), count: project?.versions_count ?? undefined },
  ];

  return (

    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-8 pb-10 pt-5">
        <button onClick={onBack} className="btn btn-sm btn-ghost -ml-3 mb-3">
          <Icon cls="fa-solid fa-arrow-left text-[14px]" />
          {t("Назад")}
        </button>

        {}
        <section className="relative overflow-hidden rounded-[22px] bg-raised">
          <div className="absolute inset-0">
            {hero ? (
              <img src={hero} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : icon ? (
              <img
                src={icon}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full scale-125 object-cover opacity-50 blur-3xl"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/25" />
          </div>

          <div className="relative flex min-h-[220px] items-end gap-5 p-7">
            <div className="grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-[18px] bg-black/40 shadow-[0_10px_30px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
              {icon ? (
                <img src={icon} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                <Icon cls="fa-solid fa-cube text-3xl text-white/60" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-white">{title}</h1>
              {authors && (
                <div className="mt-1 truncate text-[14px] text-white/70">{t("от {author}", { author: authors })}</div>
              )}
              {summary && (
                <p className="mt-2.5 line-clamp-2 max-w-[70ch] text-[14px] leading-relaxed text-white/80">{summary}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => openUrl(siteLink.url)}
                title={t("Открыть на {site}", { site: siteLink.label })}
                className="btn btn-lg btn-icon w-[50px] border-white/15 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
              >
                <Icon cls="fa-solid fa-arrow-up-right-from-square text-[16px]" />
              </button>
              <button
                onClick={install}
                disabled={installed || busy}
                className={`btn btn-lg min-w-[150px] ${
                  installed ? "border-white/15 bg-white/10 text-white/80 backdrop-blur-md" : "btn-accent"
                }`}
              >
                <Icon
                  cls={`fa-solid ${busy ? "fa-spinner fa-spin" : installed ? "fa-check" : "fa-download"} text-[16px]`}
                />
                {busy ? t("Установка…") : installed ? t("Установлено") : t("Скачать")}
              </button>
            </div>
          </div>
        </section>

        {}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-text2">
          <span className="flex items-center gap-1.5" title={t("Загрузок")}>
            <Icon cls="fa-solid fa-download text-[14px] text-muted" />
            <b className="font-semibold text-text">{fmt(downloads)}</b>
          </span>
          {}
          {project?.followers != null && (
            <span
              className="flex items-center gap-1.5"
              title={source === "curseforge" ? t("Лайков") : t("Подписчиков")}
            >
              <Icon cls={`fa-solid ${source === "curseforge" ? "fa-thumbs-up" : "fa-heart"} text-[14px] text-muted`} />
              <b className="font-semibold text-text">{fmt(project.followers)}</b>
            </span>
          )}
          {updated && (
            <span className="flex items-center gap-1.5" title={t("Обновлён")}>
              <Icon cls="fa-solid fa-clock-rotate-left text-[14px] text-muted" />
              {updated}
            </span>
          )}
          {build && (
            <span className="ml-auto flex items-center gap-1.5 text-muted">
              {t("Установить в")}
              <b className="font-medium text-text">{build.name}</b>
            </span>
          )}
        </div>

        {}
        {(project?.allow_distribution === false || (project && !project.is_available)) && (
          <div className="mt-4 space-y-1.5">
            {project?.allow_distribution === false && (
              <p className="flex items-start gap-2 text-[13px] text-warn">
                <span className="dot mt-[7px] bg-warn" />
                {t(
                  "Автор запретил сторонним лаунчерам скачивать файлы этого проекта. Установить получится только вручную, со страницы проекта."
                )}
              </p>
            )}
            {project && !project.is_available && (
              <p className="flex items-start gap-2 text-[13px] text-warn">
                <span className="dot mt-[7px] bg-warn" />
                {t("Проект скрыт или заархивирован — новых версий у него не будет.")}
              </p>
            )}
          </div>
        )}

        <div className="mt-6">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        <div className="mt-6 flex items-start gap-10">
          <main className="min-w-0 flex-1">
            {tab === "versions" ? (
              <VersionList
                source={source}
                projectId={hit.project_id}
                currentVersionId={installedMod?.version_id}
                showFilters
                busyId={verBusy}
                onPick={installVersion}
              />
            ) : tab === "gallery" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {gallery.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => setLightbox(i)}
                    title={g.title || t("Открыть")}
                    className="group relative aspect-video overflow-hidden rounded-[18px] bg-raised"
                  >
                    <img
                      src={g.url}
                      alt={g.title ?? ""}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]"
                    />
                    {g.title && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-6 text-left text-[12.5px] text-white/90">
                        {g.title}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : !project && !failed ? (
              <div className="grid h-40 place-items-center text-muted">
                <Icon cls="fa-solid fa-spinner fa-spin text-[18px]" />
              </div>
            ) : project?.body && project.body_format ? (
              <>
                {}
                <RichText source={project.body} format={project.body_format} />
                {project.body_truncated && (
                  <p className="mt-6 text-[13px] text-muted">
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
                <p className="text-[14.5px] leading-relaxed text-text">{summary}</p>
                <p className="mt-6 text-[13px] text-muted">
                  {failed ? t("Не удалось получить описание с площадки.") : t("Полного описания у этого проекта нет.")}{" "}
                  <button
                    onClick={() => openUrl(siteLink.url)}
                    className="text-accent transition-colors hover:text-accent-hover"
                  >
                    {t("Открыть на {site}", { site: siteLink.label })}
                  </button>
                </p>
              </>
            )}
          </main>

          {}
          <aside className="sticky top-0 w-[280px] shrink-0 space-y-6">
            {!build && (
              <p className="text-[13px] leading-relaxed text-muted">
                {t("Сборку выберете при установке — покажем только те, куда это встанет.")}
              </p>
            )}

            {project && (
              <SideBlock title={t("О проекте")}>
                <div className="divide-y divide-line">
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
                  {project.client_side && <Row label={t("На клиенте")}>{sideLabel(project.client_side)}</Row>}
                  {project.server_side && <Row label={t("На сервере")}>{sideLabel(project.server_side)}</Row>}
                  {published && <Row label={t("Создан")}>{published}</Row>}
                  {updated && <Row label={t("Обновлён")}>{updated}</Row>}
                  {project.versions_count != null && <Row label={t("Версий")}>{project.versions_count}</Row>}
                  {project.plays != null && <Row label={t("Запусков")}>{fmt(project.plays)}</Row>}
                  {ram != null && (
                    <Row label={t("Памяти")}>
                      {(ram / 1024).toFixed(1)} {t("ГБ")}
                    </Row>
                  )}
                </div>
              </SideBlock>
            )}

            {project && project.loaders.length > 0 && (
              <SideBlock title={t("Загрузчики")}>
                <div className="flex flex-wrap gap-1.5">
                  {project.loaders.map((l) => (
                    <span key={l} className="tag">
                      {loaderLabel[l] ?? l}
                    </span>
                  ))}
                </div>
              </SideBlock>
            )}

            {project && project.game_versions.length > 0 && (
              <SideBlock title={t("Версии игры")}>
                <div className="flex flex-wrap gap-1.5">
                  {}
                  {project.game_versions.slice(0, 12).map((v) => (
                    <span key={v} className="tag">
                      {v}
                    </span>
                  ))}
                  {project.game_versions.length > 12 && (
                    <button
                      onClick={() => setTab("versions")}
                      className="px-1 text-[12px] text-accent transition-colors hover:text-accent-hover"
                    >
                      {t("и ещё {n}", { n: project.game_versions.length - 12 })}
                    </button>
                  )}
                </div>
              </SideBlock>
            )}

            {categories.length > 0 && (
              <SideBlock title={t("Категории")}>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <span key={c} className="tag capitalize">
                      {c}
                    </span>
                  ))}
                </div>
              </SideBlock>
            )}

            {links.some((l) => l.url) && (
              <SideBlock title={t("Ссылки")}>
                <div className="-mx-3">
                  {links
                    .filter((l) => l.url)
                    .map((l) => (
                      <button
                        key={l.label + l.url}
                        onClick={() => openUrl(l.url!)}
                        className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[14px] text-text2 transition-colors hover:bg-white/[0.04] hover:text-text"
                      >
                        <Icon
                          cls={`${l.icon === "fa-discord" ? "fa-brands" : "fa-solid"} ${l.icon} text-[15px] text-muted`}
                        />
                        <span className="truncate">{l.label}</span>
                      </button>
                    ))}
                </div>
              </SideBlock>
            )}
          </aside>
        </div>
      </div>

      {lightbox !== null && <Lightbox images={gallery} index={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function SideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-[14px] font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}
