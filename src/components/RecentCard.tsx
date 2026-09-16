import { useState } from "react";
import { type Recent } from "../api";
import { cardInDelay } from "../anim";
import { coverFor } from "../covers";
import { useLauncherCtx } from "../LauncherContext";
import { t } from "../i18n";

function playtime(secs: number): string {
  if (secs < 60) return t("< 1мин.");
  if (secs < 3600) return t("{n}мин.", { n: Math.round(secs / 60) });
  return t("{n}ч.", { n: Math.floor(secs / 3600) });
}

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
      <div className="absolute inset-0 bg-[var(--veil)]" />

      {}
      {recent.kind === "build" && (
        <button
          onClick={() => goToBuild(recent.id)}
          title={t("Перейти к сборке")}
          aria-label={t("Перейти к сборке")}
          className="absolute inset-0 h-full w-full cursor-pointer bg-white/0 transition-colors hover:bg-white/5"
        />
      )}

      {}
      <button
        onClick={onRemove}
        title={t("Убрать из последних запусков")}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-[var(--veil-btn)] text-[var(--veil-text-dim)] opacity-0 transition hover:bg-[#FF3535]/50 hover:text-white group-hover:opacity-100"
      >
        <i className="fa-solid fa-xmark text-xs" />
      </button>

      {}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-[var(--veil-text)]">
            {recent.kind === "build" ? recent.name : `MC ${recent.name}`}
          </div>
          <div className="text-[10px] text-[var(--veil-text-dim)]">
            {t("Вы играли {time}", { time: playtime(recent.playtime_secs) })}
          </div>
        </div>
        {running ? (
          <button
            onClick={() => stop(recent.id)}
            className="pointer-events-auto h-9 shrink-0 rounded-lg bg-[#ef4444] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#dc2626]"
          >
            {t("Закрыть")}
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
            className="pointer-events-auto h-9 shrink-0 rounded-[8px] bg-accent px-4 text-sm font-semibold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <i className="fa-solid fa-spinner fa-spin" /> : t("Продолжить")}
          </button>
        )}
      </div>
    </div>
  );
}
