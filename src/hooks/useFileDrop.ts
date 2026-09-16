import { useEffect, useState } from "react";
import { isTauri } from "../api";

export function useFileDrop(enabled: boolean, onDrop: (paths: string[]) => void) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!enabled || !isTauri) {
      setOver(false);
      return;
    }
    let dead = false;
    let off: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const un = await getCurrentWebview().onDragDropEvent((e) => {
          const p = e.payload;
          if (p.type === "over" || p.type === "enter") setOver(true);
          else if (p.type === "leave") setOver(false);
          else if (p.type === "drop") {
            setOver(false);
            const paths = (p.paths ?? []).filter(Boolean);
            if (paths.length) onDrop(paths);
          }
        });
        if (dead) un();
        else off = un;
      } catch {

      }
    })();

    return () => {
      dead = true;
      off?.();
      setOver(false);
    };

  }, [enabled, onDrop]);

  return over;
}
