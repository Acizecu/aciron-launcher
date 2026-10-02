import { useLauncherCtx } from "../LauncherContext";
import { useWindowFocused } from "../windowFocus";

export function useRenderPaused(): boolean {
  const { gameRunning } = useLauncherCtx();
  const focused = useWindowFocused();
  return gameRunning || !focused;
}
