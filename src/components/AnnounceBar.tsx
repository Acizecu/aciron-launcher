import { useEffect, useRef, useState } from "react";
import RichText from "./RichText";
import {
  announceCurrent,
  getSettings,
  isTauri,
  openUrl,
  saveSettings,
  type Announce,
} from "../api";
import { t, useLang } from "../i18n";

const TONES = new Map<string, { icon: string; cls: string }>([
  ["info", { icon: "fa-circle-info", cls: "" }],
  ["warning", { icon: "fa-triangle-exclamation", cls: "announce-warning" }],
  ["danger", { icon: "fa-circle-exclamation", cls: "announce-danger" }],
]);
const TONE_INFO = TONES.get("info")!;

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

const BAR_EVENT = "aciron-announce-bar";

export default function AnnounceBar() {

  const { lang } = useLang();
  const [ann, setAnn] = useState<Announce | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {

        const [s, a] = await Promise.all([getSettings(), announceCurrent(lang)]);
        if (dead) return;

        setAnn(a && a.id !== s.dismissed_announce_id ? a : null);
      } catch {

      }
    };
    void pull();

    let unlisten: (() => void) | undefined;
    if (isTauri) {
      void (async () => {
        const { listen } = await import("@tauri-apps/api/event");
        const fn = await listen("announce-changed", () => void pull());
        if (dead) fn();
        else unlisten = fn;
      })();
    }

    const timer = setInterval(() => void pull(), 3 * 60 * 1000);

    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);

    return () => {
      dead = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      unlisten?.();
    };
  }, [lang]);

  useEffect(() => {
    let raf = 0;
    const emit = () => {
      cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        const bottom = box.current?.getBoundingClientRect().bottom ?? 0;
        window.dispatchEvent(new CustomEvent(BAR_EVENT, { detail: bottom }));
      });
    };
    emit();
    window.addEventListener("resize", emit);
    window.addEventListener("aciron-ui-scale", emit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", emit);
      window.removeEventListener("aciron-ui-scale", emit);
      window.dispatchEvent(new CustomEvent(BAR_EVENT, { detail: 0 }));
    };
  }, [ann]);

  if (!ann) return null;

  const tone = TONES.get(ann.tone) ?? TONE_INFO;
  const url = ann.link?.url ? safeUrl(ann.link.url) : null;
  const link = url ? { url, label: ann.link?.label ?? "" } : null;

  const hide = async () => {
    const id = ann.id;
    setAnn(null);
    try {

      const fresh = await getSettings();
      await saveSettings({ ...fresh, dismissed_announce_id: id });
    } catch {

    }
  };

  return (
    <div
      ref={box}

      role="status"
      aria-live="polite"
      className={`announce ${tone.cls} flex shrink-0 items-center gap-2.5 px-4 py-1.5`}
    >
      <i className={`fa-solid ${tone.icon} announce-icon shrink-0 text-[13px]`} />

      <RichText source={ann.body} format="markdown" className="announce-body min-w-0 flex-1" />

      {link && (
        <button
          onClick={() => openUrl(link.url)}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text transition-colors hover:border-accent/60 hover:text-accent"
        >
          {link.label.trim() || t("Подробнее")}
          <i className="fa-solid fa-arrow-up-right-from-square ml-1.5 text-[9px]" />
        </button>
      )}

      <button
        onClick={hide}
        title={t("Скрыть")}
        aria-label={t("Скрыть")}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-card hover:text-text"
      >
        <i className="fa-solid fa-xmark text-[12px]" />
      </button>
    </div>
  );
}
