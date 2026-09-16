import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMaximized } from "../windowState";

type Dir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const win = (() => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
})();

const HANDLES: { cls: string; dir: Dir }[] = [
  { cls: "top-0 left-3 right-3 h-[5px] cursor-ns-resize", dir: "North" },
  { cls: "bottom-0 left-3 right-3 h-[5px] cursor-ns-resize", dir: "South" },
  { cls: "left-0 top-3 bottom-3 w-[5px] cursor-ew-resize", dir: "West" },
  { cls: "right-0 top-3 bottom-3 w-[5px] cursor-ew-resize", dir: "East" },
  { cls: "top-0 left-0 h-3 w-3 cursor-nwse-resize", dir: "NorthWest" },
  { cls: "top-0 right-0 h-3 w-3 cursor-nesw-resize", dir: "NorthEast" },
  { cls: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize", dir: "SouthWest" },
  { cls: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize", dir: "SouthEast" },
];

export default function ResizeHandles() {
  const maximized = useMaximized();

  if (!win || maximized) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {HANDLES.map((h) => (
        <div
          key={h.dir}
          className={`pointer-events-auto absolute ${h.cls}`}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            win.startResizeDragging(h.dir).catch(() => {});
          }}
        />
      ))}
    </div>
  );
}
