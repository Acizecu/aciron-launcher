import { useSyncExternalStore } from "react";

export type ViewMode = "list" | "grid";

const KEY = "aciron:view-mode";

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

let mode: ViewMode = read();
const subs = new Set<() => void>();

export function setViewMode(next: ViewMode) {
  if (next === mode) return;
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {

  }
  for (const f of subs) f();
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => mode,
    () => mode
  );
}
