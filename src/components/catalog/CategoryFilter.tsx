import { useMemo, useState } from "react";
import { t } from "../../i18n";
import Icon from "../Icon";

function categoryLabel(slug: string): string {
  switch (slug) {
    case "adventure":
      return t("Приключения");
    case "cursed":
      return t("Странное");
    case "decoration":
      return t("Декор");
    case "economy":
      return t("Экономика");
    case "equipment":
      return t("Снаряжение");
    case "food":
      return t("Еда");
    case "game-mechanics":
      return t("Механики");
    case "library":
      return t("Библиотеки");
    case "magic":
      return t("Магия");
    case "management":
      return t("Управление");
    case "minigame":
      return t("Мини-игры");
    case "mobs":
      return t("Мобы");
    case "optimization":
      return t("Оптимизация");
    case "social":
      return t("Общение");
    case "storage":
      return t("Хранение");
    case "technology":
      return t("Технологии");
    case "transportation":
      return t("Транспорт");
    case "utility":
      return t("Утилиты");
    case "worldgen":
      return t("Генерация мира");
    default: {

      const s = slug.replace(/-/g, " ");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }
}

const ICONS: Record<string, string> = {
  adventure: "fa-map",
  cursed: "fa-bug",
  decoration: "fa-palette",
  economy: "fa-gem",
  equipment: "fa-shield-halved",
  food: "fa-mug-hot",
  "game-mechanics": "fa-sliders",
  library: "fa-book",
  magic: "fa-wand-magic-sparkles",
  management: "fa-folder-tree",
  minigame: "fa-gamepad",
  mobs: "fa-hand-fist",
  optimization: "fa-meteor",
  social: "fa-comments",
  storage: "fa-box-archive",
  technology: "fa-microchip",
  transportation: "fa-truck-fast",
  utility: "fa-hammer",
  worldgen: "fa-earth-americas",
};

export { categoryLabel };

export default function CategoryFilter({
  all,
  selected,
  onChange,
}: {
  all: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.toLowerCase().includes(q) || categoryLabel(c).toLowerCase().includes(q));
  }, [all, query]);

  const toggle = (c: string) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  return (
    <section className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-[13px] font-semibold text-text">{t("Категории")}</span>
        {selected.length > 0 && <span className="tag tag-accent">{selected.length}</span>}
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="ml-auto text-[12px] text-muted transition-colors hover:text-text"
          >
            {t("Сбросить")}
          </button>
        )}
      </div>

      {all.length > 8 && (
        <div className="field-wrap mb-2 flex h-9 items-center gap-2 px-3">
          <Icon cls="fa-solid fa-magnifying-glass text-[13px] text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Найти категорию")}
            className="w-full bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} title={t("Очистить")} className="text-muted hover:text-text">
              <Icon cls="fa-solid fa-xmark text-[13px]" />
            </button>
          )}
        </div>
      )}

      <div className="space-y-0.5">
        {shown.map((c) => {
          const on = selected.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggle(c)}
              data-active={on}
              aria-pressed={on}
              className="rail-link !h-9 gap-3 !px-3"
            >
              {ICONS[c] ? (
                <Icon
                  cls={`fa-solid ${ICONS[c]} text-[15px] transition-colors duration-300 ${on ? "text-accent" : "text-muted"}`}
                />
              ) : (
                <span className={`dot ${on ? "bg-accent" : "bg-muted/60"}`} />
              )}
              <span className="min-w-0 flex-1 truncate">{categoryLabel(c)}</span>
              <Icon
                cls={`fa-solid fa-check text-[13px] text-accent transition-[opacity,transform] duration-300 ${
                  on ? "scale-100 opacity-100" : "scale-50 opacity-0"
                }`}
              />
            </button>
          );
        })}
        {shown.length === 0 && <p className="px-3 py-2 text-[12.5px] text-muted">{t("Ничего не найдено")}</p>}
      </div>
    </section>
  );
}

export function ActiveFilters({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (selected.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <button
          key={c}
          onClick={() => onChange(selected.filter((x) => x !== c))}
          title={t("Убрать фильтр")}
          className="group flex h-7 items-center gap-1.5 rounded-full bg-accent/12 pl-3 pr-2 text-[12.5px] font-medium text-accent-hover transition-colors hover:bg-accent/20"
        >
          {categoryLabel(c)}
          <Icon cls="fa-solid fa-xmark text-[12px] opacity-70 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
      <button
        onClick={() => onChange([])}
        className="ml-1 text-[12.5px] text-muted transition-colors hover:text-text"
      >
        {t("Сбросить всё")}
      </button>
    </div>
  );
}
