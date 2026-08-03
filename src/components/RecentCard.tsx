import { useState } from "react";
import { type Recent } from "../api";
import { cardInDelay } from "../anim";
import { coverFor } from "../covers";
import { useLauncherCtx } from "../LauncherContext";

function playtime(secs: number): string {
  if (secs < 60) return "< 1мин.";
  if (secs < 3600) return `${Math.round(secs / 60)}мин.`;
  return `${Math.floor(secs / 3600)}ч.`;
}

/** Переход к сборке из карточки последнего запуска. id рекента у сборок = "build:<id>";
 *  кладём чистый id в window (BuildsPage читает его при монтировании — она размонтирована,
 *  пока мы на главной) и просим App переключиться на вкладку «Сборки». */
function goToBuild(recentId: string) {
  const id = recentId.startsWith("build:") ? recentId.slice("build:".length) : recentId;
  (window as unknown as { __acironOpenBuild?: string }).__acironOpenBuild = id;
  window.dispatchEvent(new CustomEvent("aciron-open-build", { detail: id }));
}

export default function RecentCard({
  recent,
  index = 0,
  dying = false,
  onRemove,
}: {
  recent: Recent;

  index?: number;

  dying?: boolean;
  onRemove: () => void;
}) {
  const img = coverFor(recent.id, recent.mc_version);
  const { launch, isRunning, stop } = useLauncherCtx();

  const [busy, setBusy] = useState(false);
  const running = isRunning(recent.id);

  return (
    <div
      data-flip-id={recent.id}
      style={dying ? undefined : cardInDelay(index)}
      className={`group relative h-[150px] w-[285px] border-[#232427]/65 border-1 shrink-0 overflow-hidden rounded-[16px] bg-card ${
        dying ? "card-fall" : "card-in"
      }`}
    >
      {img ? (
        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-card to-bg">
          <i className="fa-solid fa-cube absolute right-4 top-4 text-4xl text-accent/25" />
        </div>
      )}

      {}
      <div className="absolute inset-0 bg-black/80" />

      {}
      <button
        onClick={onRemove}
        title="Убрать из последних запусков"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/50 text-white/70 opacity-0 transition hover:bg-[#FF3535]/50 hover:text-white group-hover:opacity-100"
      >
        <i className="fa-solid fa-xmark text-xs" />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-white">
            {recent.kind === "build" ? recent.name : `MC ${recent.name}`}
          </div>
          <div className="text-[10px] text-[#818181]">Вы играли {playtime(recent.playtime_secs)}</div>
        </div>
        {recent.kind === "build" && (
          <button
            onClick={() => goToBuild(recent.id)}
            title="Перейти к сборке"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white/10 text-white/80 transition-colors hover:bg-white/20"
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
          </button>
        )}
        {running ? (
          <button
            onClick={() => stop(recent.id)}
            className="h-9 shrink-0 rounded-lg bg-[#ef4444] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#dc2626]"
          >
            Закрыть
          </button>
        ) : (
          <button
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await launch(recent.id);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="h-9 shrink-0 rounded-[8px] bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <i className="fa-solid fa-spinner fa-spin" /> : "Продолжить"}
          </button>
        )}
      </div>
    </div>
  );
}
