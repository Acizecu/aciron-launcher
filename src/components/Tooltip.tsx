import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 380;
const GAP = 8;

const MARK = "data-aciron-tip";

type Tip = { text: string; x: number; y: number; below: boolean };

export default function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  const host = useRef<{ el: HTMLElement; text: string; mo: MutationObserver } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const release = () => {
      clearTimer();
      const h = host.current;
      if (h) {
        h.mo.disconnect();
        h.el.removeAttribute(MARK);
        h.el.setAttribute("title", h.text);
        host.current = null;
      }
      setTip(null);
    };

    const show = (el: HTMLElement, text: string) => {
      const r = el.getBoundingClientRect();

      if (!el.isConnected || (r.width === 0 && r.height === 0)) {
        release();
        return;
      }

      const below = r.top < 56;
      setTip({
        text,
        x: r.left + r.width / 2,
        y: below ? r.bottom + GAP : r.top - GAP,
        below,
      });
    };

    const onOver = (e: Event) => {
      const target = e.target as HTMLElement | null;

      const el = target?.closest?.(`[title],[${MARK}]`) as HTMLElement | null;
      if (!el) {
        if (host.current) release();
        return;
      }
      if (host.current?.el === el) return;
      release();

      const text = (el.getAttribute("title") ?? "").trim();
      if (!text) return;

      el.removeAttribute("title");
      el.setAttribute(MARK, "");
      const mo = new MutationObserver(() => {
        if (el.hasAttribute("title")) el.removeAttribute("title");
      });
      mo.observe(el, { attributes: true, attributeFilter: ["title"] });
      host.current = { el, text, mo };

      clearTimer();
      timer.current = window.setTimeout(() => show(el, text), DELAY_MS);
    };

    const onOut = (e: Event) => {
      const to = (e as MouseEvent).relatedTarget as Node | null;
      const h = host.current;
      if (!h) return;

      if (to && h.el.contains(to)) return;
      release();
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);

    document.addEventListener("mousedown", release, true);
    document.addEventListener("keydown", release, true);
    window.addEventListener("scroll", release, true);
    window.addEventListener("blur", release);

    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("mousedown", release, true);
      document.removeEventListener("keydown", release, true);
      window.removeEventListener("scroll", release, true);
      window.removeEventListener("blur", release);
      release();
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    let dx = 0;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;
    if (dx) el.style.transform = `translate(calc(-50% + ${dx}px), ${tip.below ? "0" : "-100%"})`;
  }, [tip]);

  if (!tip) return null;

  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed z-[200] max-w-[280px]"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      }}
    >
      <div className="tooltip-pop rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-[11px] leading-snug text-text shadow-lg shadow-black/40">
        {tip.text}
      </div>
    </div>,
    document.body
  );
}
