import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri, getSettings } from "./api";

async function appWin() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export type Progress = {
  op?: string;
  stage: string;
  message: string;
  current: number;
  total: number;
};

export type LaunchStatus = "idle" | "running" | "done" | "error";

export function useLauncher() {
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");

  const [running, setRunning] = useState<string[]>([]);
  const runningRef = useRef<string[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const setRun = useCallback((next: string[]) => {
    runningRef.current = next;
    setRunning(next);
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    const unlisteners: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<Progress>("launch-progress", (e) => {
        // PlayBar/DownloadBar показывают ТОЛЬКО прогресс запуска игры. Установку
        // модпака и перенос данных (op="install"/"migrate") ведёт орб, а не эта
        // панель — иначе ошибка установки поднимала бы баннер запуска, а её "done"
        // сбрасывал бы состояние. Пустой op трактуем как запуск (совместимость).
        const op = e.payload.op ?? "";
        if (op && op !== "launch") return;
        setProgress(e.payload);
        if (e.payload.stage === "error") {
          setError(e.payload.message);
          setStatus("error");
        }
      }).then((u) => unlisteners.push(u));
      listen<{ id: string }>("game-started", async (e) => {
        const id = e.payload?.id ?? "";
        if (!runningRef.current.includes(id)) setRun([...runningRef.current, id]);
        const s = await getSettings();
        if (s.hide_on_launch) (await appWin())?.hide();
      }).then((u) => unlisteners.push(u));
      listen<{ id: string }>("game-exited", async (e) => {
        const id = e.payload?.id ?? "";
        const next = runningRef.current.filter((x) => x !== id);
        setRun(next);

        if (next.length === 0) {
          const w = await appWin();
          if (w) {
            await w.show();
            await w.unminimize().catch(() => {});
            await w.setFocus().catch(() => {});
          }
        }
      }).then((u) => unlisteners.push(u));
    });
    return () => unlisteners.forEach((u) => u());
  }, [setRun]);

  const stop = useCallback(
    async (id?: string) => {
      if (isTauri) {
        try {
          await invoke("stop_game", { id: id ?? null });
        } catch {

        }
      }

      setRun(id ? runningRef.current.filter((x) => x !== id) : []);
    },
    [setRun]
  );

  const isRunning = useCallback((id: string) => running.includes(id), [running]);

  const mockRun = useCallback((target: string) => {
    const steps: Progress[] = [
      { stage: "manifest", message: "Получение списка версий", current: 1, total: 1 },
      { stage: "version", message: "Загрузка описания версии", current: 1, total: 1 },
      { stage: "client", message: "Загрузка клиента", current: 1, total: 1 },
      { stage: "libraries", message: "Загрузка библиотек", current: 18, total: 42 },
      { stage: "libraries", message: "Загрузка библиотек", current: 42, total: 42 },
      { stage: "assets", message: "Загрузка ресурсов", current: 640, total: 2600 },
      { stage: "assets", message: "Загрузка ресурсов", current: 1700, total: 2600 },
      { stage: "assets", message: "Загрузка ресурсов", current: 2600, total: 2600 },
      { stage: "launch", message: "Запуск игры", current: 1, total: 1 },
    ];
    let i = 0;
    const tick = () => {
      if (i < steps.length) {
        setProgress(steps[i++]);
        timer.current = window.setTimeout(tick, 700);
      } else {
        setStatus("done");
        setProgress({ stage: "done", message: "Игра запущена", current: 1, total: 1 });

        setRun([...runningRef.current, target]);
        timer.current = window.setTimeout(() => setStatus("idle"), 3500);
      }
    };
    tick();
  }, [setRun]);

  const launch = useCallback(
    async (target: string, server?: string) => {
      setError("");
      setProgress(null);
      setStatus("running");

      if (!isTauri) {
        mockRun(target);
        return;
      }
      try {
        if (target.startsWith("build:")) {
          await invoke("launch_build", { buildId: target.slice(6) });
        } else {

          await invoke("launch_game", { version: target, server: server ?? null });
        }
        setStatus("done");
        timer.current = window.setTimeout(() => setStatus("idle"), 4000);
      } catch (e) {
        setError(String(e));
        setStatus("error");
        timer.current = window.setTimeout(() => setStatus("idle"), 6000);
      }
    },
    [mockRun]
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    status,
    progress,
    error,
    launch,
    running,
    isRunning,
    gameRunning: running.length > 0,
    stop,
  };
}
