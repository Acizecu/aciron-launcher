import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

let focused = typeof document !== "undefined" ? document.hasFocus() : true;
let hidden = typeof document !== "undefined" ? document.hidden : false;
let minimized = false;
const subs = new Set<() => void>();

function emit() {
  document.documentElement.classList.toggle("app-hidden", hidden || minimized);
  subs.forEach((cb) => cb());
}

function setFocused(f: boolean) {
  if (f === focused) return;
  focused = f;
  emit();
}

function setMinimized(m: boolean) {
  if (m === minimized) return;
  minimized = m;
  emit();
}

if (typeof window !== "undefined") {
  emit();
  window.addEventListener("focus", () => setFocused(true));
  window.addEventListener("blur", () => setFocused(false));
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    emit();
  });
  try {
    const win = getCurrentWindow();
    const check = () => {
      void Promise.all([win.isMinimized(), win.isVisible()])
        .then(([min, vis]) => setMinimized(min || !vis))
        .catch(() => {});
    };
    void win
      .onFocusChanged(({ payload }) => {
        setFocused(payload);
        check();
      })
      .catch(() => {});
    void win.onResized(check).catch(() => {});
    window.setInterval(check, 2000);
    check();
  } catch {

  }
}

export function isWindowFocused(): boolean {
  return focused;
}

export function isWindowHidden(): boolean {
  return hidden || minimized;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function useWindowFocused(): boolean {
  return useSyncExternalStore(subscribe, () => focused);
}

export function useWindowHidden(): boolean {
  return useSyncExternalStore(subscribe, isWindowHidden);
}
