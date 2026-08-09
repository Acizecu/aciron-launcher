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
}: {
  build: Build;
  initialQuery?: string;
  initialKind?: ContentKind;
  onBack: () => void;
  onInstalled: (b: Build) => void;
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
    () => new Set(build.mods.map((m) => m.project_id)),
    [build.mods]
  );

  const ptype = CTYPES.find((c) => c.id === ctype)!.ptype;
  const loaderFilter = ctype === "mod" ? build.loader : "";

  useEffect(() => {
    if (source === "ftb") return;
    contentCategories(source).then(setAllCats).catch(() => {});
  }, [source]);

  useEffect(() => {
    if (source === "ftb") return;
    const my = ++seq.current;
    setLoading(true);
    setError("");
    searchContent(source, applied, loaderFilter, build.mc_version, cats, index, page * PER_PAGE, PER_PAGE, ptype)
      .then((r) => {
        if (my !== seq.current) return;
        setHits(r.hits);
        setTotal(r.total_hits);
      })
      .catch((e) => my === seq.current && setError(ts(String(e))))
      .finally(() => my === seq.current && setLoading(false));
  }, [source, applied, cats, index, page, loaderFilter, build.mc_version, ptype]);

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
    setInstalling((prev) => new Set(prev).add(h.project_id));
    startTask(`mod:${h.project_id}`, h.title);
    try {
      const updated = await installContent(source, build.id, h.project_id);

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

  const toggleCat = (c: string) => {
    setPage(0);
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
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
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      {}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-light leading-none text-text">
            {t("Каталог")}
          </h1>
          <div className="mt-2 truncate text-[12px] text-[#818181]">
            {build.name} · {build.mc_version} · {loaderLabel[build.loader] ?? build.loader}
            {total ? t(" · найдено {total}", { total }) : ""}
          </div>
        </div>
        <div className="shrink-0">
          <SourceMenu value={source} onChange={pickSource} allow={["modrinth", "curseforge"]} />
        </div>
      </div>

      {}
      <div className="mb-4 flex items-baseline gap-4">
        {CTYPES.map((c) => (
          <button
            key={c.id}
            onClick={() => pickCtype(c.id)}
            className={`text-[20px] font-light leading-none transition-colors ${
              ctype === c.id ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {t(c.label)}
          </button>
        ))}
      </div>

      {source === "ftb" ? (
        <div className="grid min-h-0 flex-1 place-items-center text-center">
          <div className="max-w-sm">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card text-xl text-accent">
              <i className="fa-solid fa-layer-group" />
            </div>
            <h2 className="text-[15px] font-medium text-text">{t("FTB — это готовые сборки")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {t(
                "У Feed The Beast нет отдельных модов — только целые модпаки. Найти их можно во вкладке «Сборки» → «Популярные»."
              )}
            </p>
            <button
              onClick={onBack}
              className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-[8px] bg-card px-3 text-sm text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-arrow-left text-xs" />
              {t("Назад")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-5">
          {}
          <aside className="flex w-[190px] shrink-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("Сортировка")}
            </div>
            <div className="space-y-1">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setPage(0);
                    setIndex(s.id);
                  }}
                  className={`w-full truncate rounded-[8px] px-3 py-2 text-left text-sm transition-colors ${
                    index === s.id ? "bg-card text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>

            {ctype === "mod" && allCats.length > 0 && (
              <>
                <div className="mb-1 mt-4 flex items-center gap-2 px-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t("Категории")}
                  </span>
                  {cats.length > 0 && (
                    <button
                      onClick={() => {
                        setPage(0);
                        setCats([]);
                      }}
                      title={t("Сбросить категории")}
                      className="ml-auto text-[11px] text-accent transition-colors hover:text-accent-hover"
                    >
                      {t("сброс")}
                    </button>
                  )}
                </div>
                <div className="space-y-1 pb-2">
                  {allCats.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCat(c)}
                      className={`w-full truncate rounded-[8px] px-3 py-2 text-left text-sm capitalize transition-colors ${
                        cats.includes(c) ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            )}
            </div>

            <button
              onClick={onBack}
              className="mt-3 flex h-10 items-center gap-2 rounded-[8px] bg-card px-3 text-sm text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-arrow-left text-xs" />
              {t("Назад")}
            </button>
          </aside>

          {}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
                <i className="fa-solid fa-magnifying-glass text-xs text-muted" />
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
                    <i className="fa-solid fa-xmark text-xs" />
                  </button>
                )}
              </div>
              <button
                onClick={doSearch}
                className="h-10 shrink-0 rounded-[8px] bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
              >
                {t("Поиск")}
              </button>
              <ViewToggle />
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1 pb-4">
              {error && (
                <div className="flex items-start gap-2 rounded-[12px] bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">
                  <i className="fa-solid fa-circle-exclamation mt-0.5" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              {loading ? (
                <div className="grid place-items-center py-16 text-muted">
                  <i className="fa-solid fa-spinner fa-spin text-2xl" />
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
                        : "space-y-2"
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
                        className={`shrink-0 rounded-[8px] text-sm font-semibold transition-colors ${
                          view === "grid" ? "h-8 w-[104px] text-[12px]" : "h-9 w-[116px]"
                        } ${
                          isInstalled
                            ? "cursor-default bg-bg text-muted"
                            : "bg-accent text-bg hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
                        }`}
                      >
                        {installing.has(h.project_id) ? (
                          <i className="fa-solid fa-spinner fa-spin" />
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
                          className="card-in group flex cursor-pointer flex-col rounded-[16px] border-1 border-[#232427]/65 bg-card p-3 transition-colors hover:border-accent/40"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-bg">
                              {h.icon_url ? (
                                <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <i className="fa-solid fa-cube text-lg text-muted" />
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
                            <span className="flex min-w-0 items-center gap-2 text-[11px] text-[#818181]">
                              {h.author && <span className="truncate">{h.author}</span>}
                              <span className="shrink-0">
                                <i className="fa-solid fa-download mr-1" />
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
                        className="card-in group flex cursor-pointer items-center gap-3 rounded-[16px] border-1 border-[#232427]/65 bg-card p-3 transition-colors hover:border-accent/40"
                      >
                        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-bg">
                          {h.icon_url ? (
                            <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <i className="fa-solid fa-cube text-muted" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-text group-hover:text-accent">
                              {h.title}
                            </span>
                            {h.author && (
                              <span className="shrink-0 text-[11px] text-[#818181]">
                                {t("от")} {h.author}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[12px] text-muted">{h.description}</div>
                          <div className="mt-1 flex items-center gap-1.5">
                            {h.categories.slice(0, 3).map((c) => (
                              <span
                                key={c}
                                className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] capitalize text-muted"
                              >
                                {c}
                              </span>
                            ))}
                            <span className="text-[10px] text-[#818181]">
                              <i className="fa-solid fa-download mr-1" />
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
