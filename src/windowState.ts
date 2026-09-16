import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const win = (() => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
})();

let maximized = false;
const subs = new Set<() => void>();

function applyChrome(m: boolean) {
  const root = document.documentElement;
  root.classList.toggle("win-maximized", m);

  const over = m
    ? Math.round((window.innerWidth - (window.screen.availWidth || window.innerWidth)) / 2)
    : 0;
  root.style.setProperty("--win-inset", `${Math.max(0, Math.min(16, over))}px`);
}

function set(m: boolean) {
  applyChrome(m);
  if (m === maximized) return;
  maximized = m;
  subs.forEach((f) => f());
}

if (win) {
  const sync = () => void win.isMaximized().then(set).catch(() => {});
  sync();
  void win.onResized(sync);
}

export function useMaximized(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => maximized,
    () => false
  );
}

export const hasNativeWindow = win !== null;
