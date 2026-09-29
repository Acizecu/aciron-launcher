import { useLayoutEffect, useState, type RefObject } from "react";

export type Side = "top" | "bottom" | "left" | "right";

export type FloatingPos = {
  left: number;
  top: number;
  side: Side;

  maxHeight: number;
  scale: number;
};

type Options = {
  open: boolean;

  side?: Side;

  align?: "start" | "center" | "end";
  gap?: number;

  padding?: number;
};

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

export function uiScale(): number {
  return (window as unknown as { __acironScale?: number }).__acironScale || 1;
}

export function computePosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  view: { width: number; height: number },
  opts: { side: Side; align: "start" | "center" | "end"; gap: number; padding: number }
): { left: number; top: number; side: Side; maxHeight: number } {
  const { gap, padding } = opts;
  const space: Record<Side, number> = {
    top: anchor.top - gap - padding,
    bottom: view.height - anchor.bottom - gap - padding,
    left: anchor.left - gap - padding,
    right: view.width - anchor.right - gap - padding,
  };
  const need = (s: Side) => (s === "top" || s === "bottom" ? panel.height : panel.width);

  let side = opts.side;
  if (space[side] < need(side)) {
    const opp = OPPOSITE[side];
    if (space[opp] >= need(opp)) side = opp;
    else side = space[opp] > space[side] ? opp : side;
  }

  let left: number;
  let top: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? anchor.top - gap - panel.height : anchor.bottom + gap;
    left =
      opts.align === "start"
        ? anchor.left
        : opts.align === "end"
          ? anchor.right - panel.width
          : anchor.left + anchor.width / 2 - panel.width / 2;
  } else {
    left = side === "left" ? anchor.left - gap - panel.width : anchor.right + gap;
    top =
      opts.align === "start"
        ? anchor.top
        : opts.align === "end"
          ? anchor.bottom - panel.height
          : anchor.top + anchor.height / 2 - panel.height / 2;
  }

  left = Math.max(padding, Math.min(left, view.width - padding - panel.width));
  top = Math.max(padding, Math.min(top, view.height - padding - panel.height));

  const maxHeight =
    side === "top" ? anchor.top - gap - padding : side === "bottom" ? view.height - anchor.bottom - gap - padding
      : view.height - 2 * padding;
  return { left, top, side, maxHeight: Math.max(120, maxHeight) };
}

export function useFloating(
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  { open, side = "top", align = "start", gap = 6, padding = 8 }: Options
): FloatingPos | null {
  const [pos, setPos] = useState<FloatingPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = anchor.current?.getBoundingClientRect();
        if (!a) return;
        const scale = uiScale();
        const p = panel.current;

        const size = p
          ? { width: p.offsetWidth * scale, height: p.offsetHeight * scale }
          : { width: 0, height: 0 };
        const r = computePosition(a, size, { width: window.innerWidth, height: window.innerHeight }, {
          side,
          align,
          gap,
          padding,
        });
        setPos({ ...r, scale });
      });
    };
    update();

    const ro = new ResizeObserver(update);
    if (panel.current) ro.observe(panel.current);
    if (anchor.current) ro.observe(anchor.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };

  }, [open, side, align, gap, padding, anchor, panel]);

  return pos;
}

export function floatingStyle(pos: FloatingPos | null): React.CSSProperties {
  if (!pos) return { position: "fixed", left: 0, top: 0, visibility: "hidden" };
  return {
    position: "fixed",
    left: pos.left,
    top: pos.top,
    transform: `scale(${pos.scale})`,
    transformOrigin: "top left",
  };
}
