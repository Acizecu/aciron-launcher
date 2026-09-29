import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { floatingStyle, useFloating, type Side } from "../floating";

export default function FloatingPanel({
  anchor,
  open,
  onClose,
  side = "top",
  align = "start",
  className = "",
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  side?: Side;
  align?: "start" | "center" | "end";
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const pos = useFloating(anchor, panel, { open, side, align });

  useEffect(() => {
    if (!open) return;

    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panel}
      data-side={pos?.side ?? side}
      className={`floating-in z-[9999] ${className}`}
      style={floatingStyle(pos)}

      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
