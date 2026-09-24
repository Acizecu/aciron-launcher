import { useEffect, useRef, useState } from "react";
import { searchContent, contentCategories, openUrl, type ModHit } from "../api";
import SourceMenu, { type Source } from "./SourceMenu";
import ModpackDetail from "./ModpackDetail";
import VersionPickerModal from "./VersionPickerModal";
import Pagination from "./Pagination";
import { cardInDelay } from "../anim";
import { t, ts } from "../i18n";
import Icon from "./Icon";
import CategoryFilter, { ActiveFilters, categoryLabel } from "./catalog/CategoryFilter";
import { RailNav } from "./ui/ds";

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
        <div className="mb-2 px-1 text-[13px] font-semibold text-text">
          {t("Сортировка")}
        </div>
        <RailNav
          items={SORTS.map((s) => ({ id: s.id, label: t(s.label), disabled: source === "ftb" }))}
          value={index}
          onChange={(id) => {
            setPage(0);
            setIndex(id);
          }}
          itemHeight={36}
        />

        {}
        {source === "modrinth" && allCats.length > 0 && (
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
      </aside>

      {}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex items-center gap-2">
          <div className="field-wrap flex h-10 min-w-0 flex-1 items-center gap-2 px-3.5">
            <Icon cls="fa-solid fa-magnifying-glass text-[12.5px] text-muted" />
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
          <SourceMenu value={source} onChange={pickSource} />
        </div>

        <ActiveFilters

          selected={cats}

          onChange={(next) => {

            setPage(0);

            setCats(next);

          }}

        />

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto py-1 pr-1 pb-4">
          {error && (
            <div className="flex items-start gap-2 px-1 text-[13px] text-danger">
              <span className="dot mt-[7px] bg-danger" />
              {error}
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
              {hits.map((h, i) => (
                <div
                  key={h.project_id}
                  onClick={() => setDetail(h)}
                  style={cardInDelay(i)}
                  className="card-in list-row group flex cursor-pointer items-center gap-4 px-3 py-3"
                >
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-raised">
                    {h.icon_url ? (
                      <img src={h.icon_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon cls="fa-solid fa-cubes-stacked text-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-text transition-colors group-hover:text-accent">
                        {h.title}
                      </span>
                      {h.author && (
                        <span className="shrink-0 text-[12px] text-muted">
                          {t("от {name}", { name: h.author })}
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

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openUrl(packUrl(source, h));
                    }}
                    title={t("Открыть страницу модпака")}
                    className="btn btn-sm btn-ghost btn-icon shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <Icon cls="fa-solid fa-arrow-up-right-from-square text-[15px]" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVersionPick(h);
                    }}
                    className="btn btn-sm btn-secondary w-[120px] shrink-0"
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
