import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GalleryImage } from "../api";
import { t } from "../i18n";

const MAX_ZOOM = 5;
const MIN_ZOOM = 1;

export default function Lightbox({
  images,
  index,
  onClose,
}: {
  images: GalleryImage[];
  index: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => setI(index), [index]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((d: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + d));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const go = useCallback(
    (d: number) => {
      setI((v) => (v + d + images.length) % images.length);
      reset();
    },
    [images.length, reset]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") zoomBy(0.5);
      else if (e.key === "-") zoomBy(-0.5);
      else if (e.key === "0") reset();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose, reset, zoomBy]);

  const onWheel = (e: React.WheelEvent) => {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left - r.width / 2;
    const cy = e.clientY - r.top - r.height / 2;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (next === z) return z;
      const k = next / z;
      setPan((p) =>
        next === 1 ? { x: 0, y: 0 } : { x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }
      );
      return next;
    });
  };

  const onDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  const cur = images[i];
  if (!cur) return null;

  const arrowCls =
    "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/40 text-white/90 opacity-0 backdrop-blur-sm transition-all hover:bg-black/70 group-hover:opacity-100";

  return createPortal(
    <div
      className="modal-backdrop group fixed inset-0 z-[100] flex flex-col bg-black/88 backdrop-blur-md"

      onClick={() => zoom === 1 && onClose()}
    >
      {}
      <div
        className="relative z-20 flex shrink-0 items-center gap-2 px-4 py-3 text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-[12px]">
          {cur.title}
          {images.length > 1 && (
            <span className="ml-2 tabular-nums opacity-60">
              {i + 1} / {images.length}
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 w-11 text-right text-[11px] tabular-nums opacity-70">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => zoomBy(-0.5)}
            title={t("Уменьшить")}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="fa-solid fa-magnifying-glass-minus text-sm" />
          </button>
          <button
            onClick={() => zoomBy(0.5)}
            title={t("Увеличить (до 5×)")}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="fa-solid fa-magnifying-glass-plus text-sm" />
          </button>
          <button
            onClick={reset}
            title={t("Вернуть 100%")}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white"
          >
            <i className="fa-solid fa-compress text-sm" />
          </button>
          <button
            onClick={onClose}
            aria-label={t("Закрыть")}
            title={t("Закрыть (Esc)")}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-[#FF3535]/50 hover:text-white"
          >
            <i className="fa-solid fa-xmark text-lg" />
          </button>
        </div>
      </div>

      {}
      <div
        ref={stage}
        onWheel={onWheel}
        onMouseDown={onDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (zoom > 1) reset();
          else setZoom(2.5);
        }}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
      >
        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label={t("Предыдущая")}
            className={`${arrowCls} left-4`}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
        )}

        <img
          key={i}
          src={cur.url}
          alt={cur.title ?? ""}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="lightbox-img absolute left-1/2 top-1/2 max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragging ? "none" : "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {images.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label={t("Следующая")}
            className={`${arrowCls} right-4`}
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        )}
      </div>

      {}
      {images.length > 1 && (
        <div
          className="flex shrink-0 justify-center px-4 pb-4 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-w-full gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-md">
            {images.map((g, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setI(idx);
                  reset();
                }}
                className={`h-12 w-20 shrink-0 overflow-hidden rounded-lg border transition ${
                  idx === i ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={g.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
