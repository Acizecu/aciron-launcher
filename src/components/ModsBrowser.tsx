import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchContent,
  contentCategories,
  installContent,
  type Build,
  type ContentKind,
  type ModHit,
} from "../api";
import ModDetail from "./ModDetail";
import SourceMenu, { type Source } from "./SourceMenu";
import Pagination from "./Pagination";
import ViewToggle from "./ViewToggle";
import { useViewMode } from "../hooks/useViewMode";
import { cardInDelay } from "../anim";
import { startTask, endTask, wasCancelled } from "../downloadTask";
import { useToast } from "../ToastContext";
import { t, ts } from "../i18n";
import Icon from "./Icon";
import CategoryFilter, { ActiveFilters, categoryLabel } from "./catalog/CategoryFilter";
import { RailNav } from "./ui/ds";

const PER_PAGE = 25;

const CTYPES: { id: ContentKind; label: string; icon: string; ptype: string }[] = [
  { id: "mod", label: "Моды", icon: "fa-puzzle-piece", ptype: "mod" },
  { id: "resourcepack", label: "Ресурспаки", icon: "fa-palette", ptype: "resourcepack" },
  { id: "shader", label: "Шейдеры", icon: "fa-wand-sparkles", ptype: "shader" },
];

const SORTS: { id: string; label: string }[] = [
  { id: "relevance", label: "Релевантность" },
  { id: "downloads", label: "Загрузки" },
  { id: "follows", label: "Подписки" },
  { id: "newest", label: "Новые" },
  { id: "updated", label: "Обновлённые" },
];

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

export default function ModsBrowser({
  build,
  initialQuery = "",
  initialKind = "mod",
  onBack,
  onInstalled,
  resolveBuild,
}: {

  build: Build | null;
  initialQuery?: string;
  initialKind?: ContentKind;
  onBack?: () => void;
  onInstalled: (b: Build) => void;

  resolveBuild?: (projectId: string, source: Source, kind: ContentKind) => Promise<Build | null>;
}) {
  const view = useViewMode();
  const [source, setSource] = useState<Source>("modrinth");
  const [ctype, setCtype] = useState<ContentKind>(initialKind);
  const [query, setQuery] = useState(initialQuery);
  const [applied, setApplied] = useState(initialQuery);
  const [index, setIndex] = useState("relevance");
  const [cats, setCats] = useState<string[]>([]);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hits, setHits] = useState<ModHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [detailMod, setDetailMod] = useState<ModHit | null>(null);
  const seq = useRef(0);
  const toast = useToast();

  const installedIds = useMemo(
    () => new Set((build?.mods ?? []).map((m) => m.project_id)),
    [build]
  );

  const ptype = CTYPES.find((c) => c.id === ctype)!.ptype;

  const loaderFilter = ctype === "mod" ? build?.loader ?? "" : "";
  const mcFilter = build?.mc_version ?? "";

  useEffect(() => {
    if (source === "ftb") return;
    contentCategories(source).then(setAllCats).catch(() => {});
  }, [source]);

  useEffect(() => {
    if (source === "ftb") return;
    const my = ++seq.current;
    setLoading(true);
    setError("");
    searchContent(source, applied, loaderFilter, mcFilter, cats, index, page * PER_PAGE, PER_PAGE, ptype)
      .then((r) => {
        if (my !== seq.current) return;
        setHits(r.hits);
        setTotal(r.total_hits);
      })
      .catch((e) => my === seq.current && setError(ts(String(e))))
      .finally(() => my === seq.current && setLoading(false));
  }, [source, applied, cats, index, page, loaderFilter, mcFilter, ptype]);

  const doSearch = () => {
    setPage(0);
    setApplied(query);
  };

  const pickSource = (s: Source) => {
    setSource(s);
    setPage(0);
    setCats([]);
  };

  const pickCtype = (id: ContentKind) => {
    setCtype(id);
    setCats([]);
    setPage(0);
  };

  const install = async (h: ModHit) => {
    if (installedIds.has(h.project_id) || installing.has(h.project_id)) return;

    const target = build ?? (await resolveBuild?.(h.project_id, source, ctype)) ?? null;
    if (!target) return;
    setInstalling((prev) => new Set(prev).add(h.project_id));
    startTask(`mod:${h.project_id}`, h.title);
    try {
      const updated = await installContent(source, target.id, h.project_id);

      if (wasCancelled(`mod:${h.project_id}`)) return;
      onInstalled(updated);
      endTask(`mod:${h.project_id}`, true);
      toast(t("«{name}» установлен", { name: h.title }), "success");
    } catch (e) {
      endTask(`mod:${h.project_id}`, false);
      toast(ts(String(e)), "error");
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(h.project_id);
        return next;
      });
    }
  };

  const totalPages = Math.min(Math.ceil(total / PER_PAGE), 100);

  if (detailMod) {
    return (
      <ModDetail
        build={build}
        hit={detailMod}
        kind={ctype}
        source={source}
        onBack={() => setDetailMod(null)}
        onInstalled={onInstalled}
        resolveBuild={resolveBuild}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold tracking-[-0.03em] leading-none text-text">
            {t("Каталог")}
          </h1>
          <div className="mt-2 truncate text-[12px] text-muted">
            {build
              ? `${build.name}, ${build.mc_version}, ${loaderLabel[build.loader] ?? build.loader}`
              : t("Сборку спросим при установке")}
            {total ? t(", найдено {total}", { total }) : ""}
          </div>
        </div>
        <div className="shrink-0">
          <SourceMenu value={source} onChange={pickSource} allow={["modrinth", "curseforge"]} />
        </div>
      </div>

      {}
      <div className="page-tabs mb-5">
        {CTYPES.map((c) => (
          <button
            key={c.id}
            onClick={() => pickCtype(c.id)}
            data-active={ctype === c.id}
            className="page-tab"
          >
            {t(c.label)}
          </button>
        ))}
      </div>

      {source === "ftb" ? (
        <div className="grid min-h-0 flex-1 place-items-center text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-xl text-accent">
              <Icon cls="fa-solid fa-layer-group" />
            </div>
            <h2 className="text-[15px] font-medium text-text">{t("FTB — это готовые сборки")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {t(
                "У Feed The Beast нет отдельных модов — только целые модпаки. Найти их можно во вкладке «Сборки» → «Популярные»."
              )}
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="btn btn-sm btn-secondary mx-auto mt-4"
              >
                <Icon cls="fa-solid fa-arrow-left text-[12.5px]" />
                {t("Назад")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-5">
          {}
          <aside className="flex w-[190px] shrink-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-2 px-1 text-[13px] font-semibold text-text">
              {t("Сортировка")}
            </div>
            <RailNav
              items={SORTS.map((s) => ({ id: s.id, label: t(s.label) }))}
              value={index}
              onChange={(id) => {
                setPage(0);
                setIndex(id);
              }}
              itemHeight={36}
            />

            {ctype === "mod" && allCats.length > 0 && (
              <>
                <CategoryFilter
                  all={allCats}
                  selected={cats}
                  onChange={(next) => {
                    setPage(0);
                    setCats(next);
                  }}
                />
              </>
            )}
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="btn btn-sm btn-ghost mt-3 self-start"
              >
                <Icon cls="fa-solid fa-arrow-left text-[12.5px]" />
                {t("Назад")}
              </button>
            )}
          </aside>

          {}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center gap-2">
              <div className="field-wrap flex h-10 min-w-0 flex-1 items-center gap-2 px-3.5">
                <Icon cls="fa-solid fa-magnifying-glass text-[12.5px] text-muted" />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                  placeholder={t("Поиск: {kind} на {source}…", {
                    kind: t(CTYPES.find((c) => c.id === ctype)!.label).toLowerCase(),
                    source: source === "curseforge" ? "CurseForge" : "Modrinth",
                  })}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setApplied("");
                      setPage(0);
                    }}
                    title={t("Очистить")}
                    className="shrink-0 text-muted transition-colors hover:text-text"
                  >
                    <Icon cls="fa-solid fa-xmark text-[12.5px]" />
                  </button>
                )}
              </div>
              <button
                onClick={doSearch}
                className="btn btn-secondary h-10 shrink-0 px-4"
              >
                {t("Поиск")}
              </button>
              <ViewToggle />
            </div>

            <ActiveFilters

              selected={cats}

              onChange={(next) => {

                setPage(0);

                setCats(next);

              }}

            />

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1 pb-4">
              {error && (
                <div className="flex items-start gap-2 px-1 text-[13px] text-danger">
                  <span className="dot mt-[7px] bg-danger" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {loading ? (
                <div className="grid place-items-center py-16 text-muted">
                  <Icon cls="fa-solid fa-spinner fa-spin text-2xl" />
                </div>
              ) : hits.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted">{t("Ничего не найдено")}</div>
              ) : (
                <>
                  {}
                  <div
                    className={
                      view === "grid"
                        ? "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-2.5"
                        : "space-y-0.5"
                    }
                  >
                  {hits.map((h, i) => {
                    const isInstalled = installedIds.has(h.project_id);
                    const action = (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          install(h);
                        }}
                        disabled={isInstalled || installing.has(h.project_id)}
                        title={isInstalled ? t("Уже в сборке") : t("Скачать в сборку")}
                        className={`btn btn-sm shrink-0 ${view === "grid" ? "w-[108px]" : "w-[120px]"} ${
                          isInstalled ? "btn-ghost cursor-default" : "btn-secondary"
                        }`}
                      >
                        {installing.has(h.project_id) ? (
                          <Icon cls="fa-solid fa-spinner fa-spin" />
                        ) : isInstalled ? (
                          t("Установлено")
                        ) : (
                          t("Скачать")
                        )}
                      </button>
                    );

                    if (view === "grid") {
                      return (
                        <div
                          key={h.project_id}
                          onClick={() => setDetailMod(h)}
                          style={cardInDelay(i)}
                          className="card-in tile group flex cursor-pointer flex-col p-3.5"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-raised">
                              {h.icon_url ? (
                                <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Icon cls="fa-solid fa-cube text-lg text-muted" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-[15px] font-semibold leading-tight text-text group-hover:text-accent"
                                title={h.title}
                              >
                                {h.title}
                              </div>
                              <div className="mt-1 line-clamp-2 text-[12px] leading-tight text-muted">
                                {h.description}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-[12px] text-muted">
                              {h.author && <span className="truncate">{h.author}</span>}
                              <span className="shrink-0">
                                <Icon cls="fa-solid fa-download mr-1" />
                                {fmt(h.downloads)}
                              </span>
                            </span>
                            {action}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={h.project_id}
                        onClick={() => setDetailMod(h)}
                        style={cardInDelay(i)}
                        className="card-in list-row group flex cursor-pointer items-center gap-4 px-3 py-3"
                      >
                        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-raised">
                          {h.icon_url ? (
                            <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon cls="fa-solid fa-cube text-muted" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-text transition-colors group-hover:text-accent">
                              {h.title}
                            </span>
                            {h.author && (
                              <span className="shrink-0 text-[12px] text-muted">
                                {t("от")} {h.author}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[13px] text-text2">{h.description}</div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            {h.categories.slice(0, 3).map((c) => (
                              <span
                                key={c}
                                className="tag capitalize"
                              >
                                {categoryLabel(c)}
                              </span>
                            ))}
                            <span className="ml-1 flex items-center gap-1 text-[12px] text-muted">
                              <Icon cls="fa-solid fa-download text-[12px]" />
                              {fmt(h.downloads)}
                            </span>
                          </div>
                        </div>

                        {action}
                      </div>
                    );
                  })}
                  </div>

                  {}
                  <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
