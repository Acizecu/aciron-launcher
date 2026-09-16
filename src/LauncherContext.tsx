import { createContext, useContext, type ReactNode } from "react";
import { useLauncher } from "./launch";

type LauncherCtx = ReturnType<typeof useLauncher>;

const Ctx = createContext<LauncherCtx | null>(null);

export function LauncherProvider({ children }: { children: ReactNode }) {

  const launcher = useLauncher();
  return <Ctx.Provider value={launcher}>{children}</Ctx.Provider>;
}

export function useLauncherCtx(): LauncherCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLauncherCtx вне LauncherProvider");
  return ctx;
}
