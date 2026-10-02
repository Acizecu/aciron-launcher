import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type StackEntry = { key: string | number; node: ReactNode };

const PEEK = 10;

const SHRINK = 0.05;

const VISIBLE = 3;
const GAP = 8;
const MOVE = "320ms cubic-bezier(.2,.8,.2,1)";

export default function NotifyStack({
  entries,
  from = "top",
  width,
  className = "",
  style,
  onHoverChange,
}: {
  entries: StackEntry[];
  from?: "top" | "bottom";
  width: number | string;
  className?: string;
  style?: CSSProperties;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const nodes = useRef(new Map<string, HTMLDivElement>());

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      nodes.current.forEach((el, k) => (next[k] = el.offsetHeight));
      setHeights((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.entries(next).every(([k, v]) => prev[k] === v);
        return same ? prev : next;
      });
    });
    nodes.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [entries]);

  const setHover = (v: boolean) => {
    setHovered(v);
    onHoverChange?.(v);
  };

  const empty = entries.length === 0;
  useEffect(() => {
    if (empty && hovered) {
      setHovered(false);
      onHoverChange?.(false);
    }
  }, [empty, hovered, onHoverChange]);

  if (empty) return null;

  const ordered = [...entries].reverse();
  const h = (k: string | number) => heights[String(k)] ?? 0;
  const frontH = h(ordered[0].key);

  const offsets: number[] = [];
  let acc = 0;
  for (const e of ordered) {
    offsets.push(acc);
    acc += h(e.key) + GAP;
  }
  const expandedH = Math.max(0, acc - GAP);
  const collapsedH = frontH + Math.min(ordered.length - 1, VISIBLE - 1) * PEEK;
  const sign = from === "top" ? 1 : -1;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...style,
        width,
        height: hovered ? expandedH : collapsedH,
        transition: `height ${MOVE}`,
      }}
      className={`pointer-events-auto ${className}`}
    >
      <div className="relative h-full w-full">
        {ordered.map((e, d) => {
          const shown = hovered || d < VISIBLE;
          const y = hovered ? offsets[d] : d * PEEK;
          const scale = hovered ? 1 : 1 - d * SHRINK;

          const clip = !hovered && d > 0 && frontH > 0;
          return (
            <div
              key={e.key}
              ref={(el) => {
                if (el) nodes.current.set(String(e.key), el.firstElementChild as HTMLDivElement);
                else nodes.current.delete(String(e.key));
              }}
              aria-hidden={!hovered && d > 0}
              style={{
                [from]: 0,
                zIndex: 100 - d,
                transform: `translateY(${sign * y}px) scale(${scale})`,
                transformOrigin: from === "top" ? "top center" : "bottom center",
                opacity: shown ? 1 : 0,
                filter: !hovered && d > 0 ? `brightness(${1 - d * 0.12})` : undefined,
                height: clip ? frontH : undefined,
                overflow: clip ? "hidden" : undefined,
                borderRadius: 16,
                pointerEvents: shown && (hovered || d === 0) ? "auto" : "none",
                transition: `transform ${MOVE}, opacity ${MOVE}, filter ${MOVE}`,
              }}
              className="absolute left-0 w-full"
            >
              <div>{e.node}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
