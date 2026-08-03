import { useLauncherCtx } from "../LauncherContext";

const STAGE: Record<string, { icon: string; title: string }> = {
  java: { icon: "fa-mug-hot", title: "Среда Java" },
  manifest: { icon: "fa-list", title: "Список версий" },
  version: { icon: "fa-file-lines", title: "Описание версии" },
  client: { icon: "fa-box", title: "Клиент игры" },
  libraries: { icon: "fa-cubes", title: "Библиотеки" },
  natives: { icon: "fa-microchip", title: "Нативные библиотеки" },
  assets: { icon: "fa-images", title: "Игровые ресурсы" },
  loader: { icon: "fa-puzzle-piece", title: "Загрузчик модов" },
  forge: { icon: "fa-puzzle-piece", title: "Forge" },
  fabric: { icon: "fa-puzzle-piece", title: "Fabric" },
  identity: { icon: "fa-user-check", title: "Проверка входа" },
  mods: { icon: "fa-download", title: "Моды сборки" },
  modpack: { icon: "fa-download", title: "Сборка" },
};

export default function DownloadBar() {
  const { status, progress, error, gameRunning } = useLauncherCtx();

  const isError = status === "error";

  const isDownloading =
    status === "running" &&
    !gameRunning &&
    !!progress &&
    progress.stage !== "launch";
  const show = isDownloading || isError;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : 0;

  const indeterminate = !isError && (!progress || progress.total <= 1);

  const meta = (progress && STAGE[progress.stage]) || {
    icon: "fa-download",
    title: "Загрузка",
  };
  const title = isError ? "Ошибка" : meta.title;
  const sub = isError
    ? error || "Не удалось загрузить"
    : progress?.message ?? "Подготовка…";

  return (
    <div
      className={`overflow-hidden border-t border-border bg-panel transition-all duration-300 ${
        show ? "h-[52px] opacity-100" : "h-0 opacity-0"
      }`}
    >
      <div className="flex h-[52px] items-center gap-3 px-4">
        {}
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            isError
              ? "bg-[#ef4444]/15 text-[#ef4444]"
              : "bg-accent/15 text-accent"
          }`}
        >
          <i className={`fa-solid ${isError ? "fa-triangle-exclamation" : meta.icon} text-sm`} />
        </div>

        {}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {!isError && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />}
            <span
              className={`shrink-0 text-[13px] font-bold ${
                isError ? "text-[#ef4444]" : "text-text"
              }`}
            >
              {title}
            </span>
            <span className="truncate text-[11px] text-muted">{sub}</span>
            {!isError && (
              <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-accent">
                {indeterminate ? "" : `${pct}%`}
              </span>
            )}
          </div>

          {}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg">
            {!isError && (
              <div
                className="progress-shine progress-accent relative h-full overflow-hidden rounded-full transition-[width] duration-300"
                style={{ width: indeterminate ? "40%" : `${pct}%` }}
              />
            )}
            {isError && <div className="h-full w-full rounded-full bg-[#ef4444]/30" />}
          </div>
        </div>
      </div>
    </div>
  );
}
