import { useEffect, useState } from "react";
import { useLauncherCtx } from "../LauncherContext";

export function useRenderPaused(): boolean {
  const { gameRunning } = useLauncherCtx();
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  return gameRunning || !focused;
}
