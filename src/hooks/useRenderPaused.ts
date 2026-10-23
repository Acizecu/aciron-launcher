import { useLauncherCtx } from "../LauncherContext";
import { useWindowFocused, useWindowHidden } from "../windowFocus";

export type RenderMode = "live" | "slow" | "paused";

export const SLOW_FRAME_MS = 50;

export function useRenderMode(): RenderMode {
  const { gameRunning } = useLauncherCtx();
  const focused = useWindowFocused();
  const hidden = useWindowHidden();
  if (hidden) return "paused";
  return gameRunning && !focused ? "slow" : "live";
}
