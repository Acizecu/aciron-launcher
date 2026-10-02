import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

let focused = typeof document !== "undefined" ? document.hasFocus() : true;
const subs = new Set<() => void>();

function set(f: boolean) {
  document.documentElement.classList.toggle("app-unfocused", !f);
  if (f === focused) return;
  focused = f;
  subs.forEach((cb) => cb());
}

if (typeof window !== "undefined") {
  set(focused);
  window.addEventListener("focus", () => set(true));
  window.addEventListener("blur", () => set(false));
  try {
    void getCurrentWindow()
      .onFocusChanged(({ payload }) => set(payload))
      .catch(() => {});
  } catch {

  }
}

export function isWindowFocused(): boolean {
  return focused;
}

export function useWindowFocused(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => focused
  );
}
