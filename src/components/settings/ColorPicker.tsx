import { useCallback, useEffect, useRef, useState } from "react";
import { AnchoredPanel, useAnchor } from "../AnchoredPanel";
import { normalizeHex } from "../../ThemeContext";
import { t as tr } from "../../i18n";

type HSV = { h: number; s: number; v: number };

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hexToHsv(hex: string): HSV {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[seg];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function useDrag(onMove: (x: number, y: number, rect: DOMRect) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const report = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      onMove(x, y, rect);
    },
    [onMove]
  );

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && report(e);
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [report]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    report(e);
  };

  return { ref, onPointerDown };
}

export default function ColorPicker({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (hex: string) => void;
  title?: string;
}) {
  const btn = useAnchor();
  const [draft, setDraft] = useState<string | null>(null);

  const [hue, setHue] = useState(() => hexToHsv(value).h);
  useEffect(() => {
    const h = hexToHsv(value);
    if (h.s > 0.02 && h.v > 0.02) setHue(h.h);
  }, [value]);

  const hsv = hexToHsv(value);

  const field = useDrag((x, y) => onChange(hsvToHex({ h: hue, s: x, v: 1 - y })));
  const bar = useDrag((x) => {
    const h = x * 360;
    setHue(h);
    onChange(hsvToHex({ h, s: hsv.s || 1, v: hsv.v || 1 }));
  });

  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    setDraft(null);
  };

  useEffect(() => {
    if (!btn.open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && btn.setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [btn.open]);

  return (
    <>
      <button
        ref={btn.ref}
        onClick={btn.toggle}
        title={title ?? tr("Выбрать цвет")}
        aria-label={title ?? tr("Выбрать цвет")}
        style={{ background: value }}
        className="h-7 w-7 shrink-0 rounded-full transition-transform hover:scale-110 active:scale-95"
      />

      <AnchoredPanel
        anchor={btn.ref}
        open={btn.open}
        onClose={btn.close}
        height={250}
        width={220}
        align="right"
        className="rounded-2xl border border-border bg-panel p-3 shadow-xl"
      >
        <div>
          {}
          <div
            ref={field.ref}
            onPointerDown={field.onPointerDown}
            className="relative h-[120px] w-full cursor-crosshair rounded-xl"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
            }}
          >
            <span
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
            />
          </div>

          {}
          <div
            ref={bar.ref}
            onPointerDown={bar.onPointerDown}
            className="relative mt-3 h-3 w-full cursor-pointer rounded-full"
            style={{
              background:
                "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${(hue / 360) * 100}%`, background: `hsl(${hue} 100% 50%)` }}
            />
          </div>

          <input
            value={draft ?? value.toUpperCase()}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setDraft(null);
            }}
            className="mt-3 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-center font-mono text-[11px] uppercase text-text outline-none transition-colors focus:border-accent"
          />
        </div>
      </AnchoredPanel>
    </>
  );
}
