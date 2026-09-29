import { useEffect, useMemo, useRef, useState } from "react";
import SET from "../../emoji-set.json";
import KEYWORDS from "../../emoji-keywords.json";
import { twemojiUrl } from "../../twemoji";
import { t } from "../../i18n";
import Icon from "../Icon";

const CATS = Object.entries(SET as Record<string, string[]>);
const WORDS = KEYWORDS as Record<string, string>;
const RECENT_KEY = "aciron.emoji.recent";
const RECENT_MAX = 16;
const COLS = 8;

const CAT_ICON: Record<string, string> = {
  Недавние: "fa-regular fa-clock",
  Улыбки: "fa-regular fa-face-smile",
  Жесты: "fa-regular fa-hand",
  Сердца: "fa-regular fa-heart",
  Игра: "fa-solid fa-gamepad",
  Прочее: "fa-regular fa-star",
};

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(e: string) {
  try {
    const next = [e, ...loadRecent().filter((x) => x !== e)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {

  }
}

function EmojiGlyph({ e, size = 22 }: { e: string; size?: number }) {
  const url = twemojiUrl(e);
  return url ? (
    <img src={url} alt={e} draggable={false} style={{ width: size, height: size }} />
  ) : (
    <span style={{ fontSize: size - 4 }} className="leading-none">
      {e}
    </span>
  );
}

export default function EmojiPicker({
  onPick,
  autoFocus = true,
}: {
  onPick: (emoji: string) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [recent] = useState(loadRecent);
  const [active, setActive] = useState(0);
  const [cursor, setCursor] = useState(0);
  const scroller = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const sections = useRef<(HTMLDivElement | null)[]>([]);

  const cats = useMemo(
    () => (recent.length ? [["Недавние", recent] as [string, string[]], ...CATS] : CATS),
    [recent]
  );

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const all = new Set(CATS.flatMap(([, list]) => list));
    return [...all].filter((e) => (WORDS[e] ?? "").includes(q) || e === q);
  }, [query]);

  const flat = useMemo(() => found ?? cats.flatMap(([, list]) => list), [found, cats]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => search.current?.focus());
  }, [autoFocus]);

  useEffect(() => setCursor(0), [query]);

  const pick = (e: string) => {
    rememberEmoji(e);
    onPick(e);
  };

  const jump = (i: number) => {
    setActive(i);
    const el = sections.current[i];
    if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
  };

  const onScroll = () => {
    const top = (scroller.current?.scrollTop ?? 0) + 12;
    let idx = 0;
    sections.current.forEach((el, i) => {
      if (el && el.offsetTop <= top) idx = i;
    });
    setActive(idx);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const move = (d: number) => {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(flat.length - 1, c + d)));
    };
    if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowDown") move(COLS);
    else if (e.key === "ArrowUp") move(-COLS);
    else if (e.key === "Enter" && flat[cursor]) {
      e.preventDefault();
      pick(flat[cursor]);
    }
  };

  useEffect(() => {
    scroller.current
      ?.querySelector<HTMLElement>(`[data-emoji-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let index = 0;
  const cell = (e: string, key: string) => {
    const i = index++;
    const hot = i === cursor;
    return (
      <button
        key={key}
        data-emoji-index={i}
        onClick={() => pick(e)}
        onMouseEnter={() => setCursor(i)}
        title={WORDS[e]?.split(" ").slice(0, 3).join(" ") || e}
        className={`grid h-9 w-9 place-items-center rounded-[10px] transition-[background-color,transform] duration-150 hover:scale-110 ${
          hot ? "bg-white/[0.07]" : ""
        }`}
      >
        <EmojiGlyph e={e} />
      </button>
    );
  };

  return (
    <div
      onKeyDown={onKey}
      className="flex w-[324px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[18px] bg-popover shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div className="p-2 pb-1.5">
        <div className="field-wrap flex h-9 items-center gap-2 px-3">
          <Icon cls="fa-solid fa-magnifying-glass text-[12px] text-muted" />
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Найти эмодзи")}
            className="w-full bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted hover:text-text" title={t("Очистить")}>
              <Icon cls="fa-solid fa-xmark text-[12px]" />
            </button>
          )}
        </div>
      </div>

      {!found && (
        <div className="flex gap-0.5 border-b border-line px-2 pb-1.5">
          {cats.map(([name], i) => (
            <button
              key={name}
              onClick={() => jump(i)}
              title={t(name)}
              className={`grid h-8 flex-1 place-items-center rounded-[10px] text-[14px] transition-colors ${
                i === active ? "bg-raised text-accent" : "text-muted hover:bg-white/[0.04] hover:text-text"
              }`}
            >
              <Icon cls={CAT_ICON[name] ?? "fa-regular fa-star"} />
            </button>
          ))}
        </div>
      )}

      <div ref={scroller} onScroll={onScroll} className="relative h-[232px] overflow-y-auto px-2 pb-2">
        {found ? (
          found.length === 0 ? (
            <div className="grid h-full place-items-center text-[13px] text-muted">{t("Ничего не нашлось")}</div>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 pt-2">{found.map((e) => cell(e, "f" + e))}</div>
          )
        ) : (
          cats.map(([name, list], ci) => (
            <div key={name} ref={(el) => void (sections.current[ci] = el)}>
              <div className="sticky top-0 z-10 bg-popover/95 px-1 pb-1 pt-2 text-[11.5px] font-medium text-muted backdrop-blur-sm">
                {t(name)}
              </div>
              <div className="grid grid-cols-8 gap-0.5">{list.map((e) => cell(e, name + e))}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
