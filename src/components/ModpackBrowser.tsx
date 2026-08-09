import { useEffect, useRef, useState } from "react";
import { searchContent, contentCategories, openUrl, type ModHit } from "../api";
import SourceMenu, { type Source } from "./SourceMenu";
import ModpackDetail from "./ModpackDetail";
import VersionPickerModal from "./VersionPickerModal";
import Pagination from "./Pagination";
import { cardInDelay } from "../anim";
import { t, ts } from "../i18n";

function packUrl(source: Source, h: ModHit): string {
  if (source === "curseforge") return `https://www.curseforge.com/minecraft/modpacks/${h.slug}`;
  if (source === "ftb") return `https://www.feed-the-beast.com/modpacks/${h.slug}`;
  return `https://modrinth.com/modpack/${h.slug}`;
}

const PER_PAGE = 25;
const SORTS = [
  { id: "downloads", label: "Загрузки" },
  { id: "follows", label: "Подписки" },
  { id: "relevance", label: "Релевантность" },
  { id: "newest", label: "Новые" },
  { id: "updated", label: "Обновлённые" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function ModpackBrowser({ onInstalled }: { onInstalled: () => void }) {
  const [source, setSource] = useState<Source>("modrinth");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [index, setIndex] = useState("downloads");
  const [cats, setCats] = useState<string[]>([]);
  const [allCats, setAllCats] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hits, setHits] = useState<ModHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ModHit | null>(null);
  const [versionPick, setVersionPick] = useState<ModHit | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setError("");
    searchContent(source, applied, "", "", cats, index, page * PER_PAGE, PER_PAGE, "modpack")
      .then((r) => {
        if (my !== seq.current) return;
        setHits(r.hits);
        setTotal(r.total_hits);
      })
      .catch((e) => my === seq.current && setError(ts(String(e))))
      .finally(() => my === seq.current && setLoading(false));
  }, [source, applied, cats, index, page]);

  const doSearch = () => {
    setPage(0);
    setApplied(query);
  };

  const pickSource = (s: Source) => {
    setSource(s);
    setPage(0);
    setApplied("");
    setQuery("");
    setCats([]);
  };

  useEffect(() => {
    if (source !== "modrinth") return;
    contentCategories(source).then(setAllCats).catch(() => {});
  }, [source]);

  const totalPages = Math.min(Math.ceil(total / PER_PAGE), 100);

  if (detail) {
    return (
      <ModpackDetail
        pack={detail}
        source={source}
        onBack={() => setDetail(null)}
        onInstalled={onInstalled}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      {}
      <aside className="flex w-[190px] shrink-0 flex-col overflow-y-auto pr-1">
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t("Сортировка")}
        </div>
        <div className="space-y-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              disabled={source === "ftb"}
              onClick={() => {
                setPage(0);
                setIndex(s.id);
              }}
              className={`w-full truncate rounded-[8px] px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                index === s.id ? "bg-card text-text" : "text-muted hover:text-text"
              }`}
            >
              {t(s.label)}
            </button>
          ))}
        </div>

        {}
        {source === "modrinth" && allCats.length > 0 && (
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
                  onClick={() => {
                    setPage(0);
                    setCats((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                    );
                  }}
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
      </aside>

      {}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <i className="fa-solid fa-magnifying-glass text-xs text-muted" />
            <input
              className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
              placeholder={t("Поиск модпаков…")}
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
          <SourceMenu value={source} onChange={pickSource} />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1 pb-4">
          {error && (
            <div className="rounded-[12px] bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">
              {error}
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
              {hits.map((h, i) => (
                <div
                  key={h.project_id}
                  onClick={() => setDetail(h)}
                  style={cardInDelay(i)}
                  className="card-in group flex cursor-pointer items-center gap-3 rounded-[16px] border-1 border-[#232427]/65 bg-card p-3 transition-colors hover:border-accent/40"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-bg">
                    {h.icon_url ? (
                      <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <i className="fa-solid fa-cubes-stacked text-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text group-hover:text-accent">
                        {h.title}
                      </span>
                      {h.author && (
                        <span className="shrink-0 text-[11px] text-[#818181]">
                          {t("от {name}", { name: h.author })}
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

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openUrl(packUrl(source, h));
                    }}
                    title={t("Открыть страницу модпака")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-bg text-muted opacity-0 transition hover:text-accent group-hover:opacity-100"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVersionPick(h);
                    }}
                    className="h-9 w-[116px] shrink-0 rounded-[8px] bg-accent text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
                  >
                    {t("Установить")}
                  </button>
                </div>
              ))}

              {}
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </>
          )}
        </div>
      </div>

      {versionPick && (
        <VersionPickerModal
          pack={versionPick}
          source={source}
          onClose={() => setVersionPick(null)}
          onInstalled={onInstalled}
        />
      )}
    </div>
  );
}
