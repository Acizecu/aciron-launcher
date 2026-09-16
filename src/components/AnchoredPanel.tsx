import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function AnchoredPanel({
  anchor,
  open,
  onClose,
  height,
  width,
  align = "left",
  className = "",
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;

  height: number;

  width?: number;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
    maxH: number;
    up: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const b = anchor.current?.getBoundingClientRect();
      if (!b) return;
      const below = window.innerHeight - b.bottom - 8;
      const above = b.top - 8;
      const up = below < height && above > below;
      setPos({
        ...(up ? { bottom: window.innerHeight - b.top + 6 } : { top: b.bottom + 6 }),
        ...(align === "right" ? { right: window.innerWidth - b.right } : { left: b.left }),
        width: width ?? b.width,
        maxH: Math.min(height, up ? above : below),
        up,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, height, width, align, anchor]);

  if (!open || !pos) return null;

  const scale = (window as unknown as { __acironScale?: number }).__acironScale || 1;

  return createPortal(
    <>
      {}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className={`dropdown-in fixed z-[9999] overflow-y-auto ${className}`}
        style={{
          top: pos.top,
          bottom: pos.bottom,
          left: pos.left,
          right: pos.right,
          width: pos.width / scale,
          maxHeight: pos.maxH / scale,
          transform: `scale(${scale})`,
          transformOrigin: `${pos.up ? "bottom" : "top"} ${align === "right" ? "right" : "left"}`,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

export function useAnchor() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return { ref, open, setOpen, close: () => setOpen(false), toggle: () => setOpen((v) => !v) };
}
