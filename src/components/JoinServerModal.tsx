import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { getBuilds, type Build } from "../api";
import { coverFor } from "../covers";
import { useLauncherCtx } from "../LauncherContext";
import { t } from "../i18n";
import Icon from "./Icon";

const LOADER_LABEL: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

type Choice = {
  target: string;
  title: string;
  meta: string;
  mcVersion: string;

  match: boolean;
};

export default function JoinServerModal({
  friendName,
  server,
  mcVersion,
  buildName,
  onClose,
}: {
  friendName: string;
  server: string;
  mcVersion?: string | null;
  buildName?: string | null;
  onClose: () => void;
}) {
  const { launch, isRunning, status } = useLauncherCtx();
  const [builds, setBuilds] = useState<Build[] | null>(null);

  useEffect(() => {
    let alive = true;
    getBuilds()
      .then((list) => alive && setBuilds(list))
      .catch(() => alive && setBuilds([]));
    return () => {
      alive = false;
    };
  }, []);

  const choices = useMemo<Choice[]>(() => {
    const out: Choice[] = (builds ?? []).map((b) => {
      const sameName = !!buildName && b.name.trim().toLowerCase() === buildName.trim().toLowerCase();
      const sameVersion = !!mcVersion && b.mc_version === mcVersion;
      return {
        target: `build:${b.id}`,
        title: b.name,
        meta: `${b.mc_version}, ${LOADER_LABEL[b.loader] ?? b.loader}`,
        mcVersion: b.mc_version,

        match: sameVersion && (sameName || !buildName),
      };
    });

    if (mcVersion) {
      out.push({
        target: mcVersion,
        title: `Minecraft ${mcVersion}`,
        meta: t("Без модов"),
        mcVersion,

        match: !buildName,
      });
    }

    const rank = (c: Choice) => (c.match ? 0 : c.mcVersion === mcVersion ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b));
  }, [builds, mcVersion, buildName]);

  const busy = status === "running";

  const start = (c: Choice) => {
    if (busy || isRunning(c.target)) return;
    void launch(c.target, server);
    onClose();
  };

  return (
    <Modal
      title={t("Зайти к {name}", { name: friendName })}
      subtitle={server}
      icon="fa-right-to-bracket"
      onClose={onClose}
    >
      <div className="pt-1">
        <p className="mb-4 px-1 text-[13px] leading-relaxed text-muted">
          {mcVersion
            ? t("Друг играет на {version}. Выберите, чем запустить игру, и она сама зайдёт на сервер.", {
                version: buildName ? `${buildName} (${mcVersion})` : mcVersion,
              })
            : t("Выберите, чем запустить игру, и она сама зайдёт на сервер.")}
        </p>

        {builds === null ? (
          <div className="grid h-24 place-items-center text-muted">
            <Icon cls="fa-solid fa-spinner fa-spin" />
          </div>
        ) : choices.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12.5px] leading-relaxed text-muted">
            {t("Сборок пока нет, а версию игры друг не показывает. Создайте сборку на странице «Сборки».")}
          </div>
        ) : (
          <div className="max-h-[340px] space-y-0.5 overflow-y-auto">
            {choices.map((c) => {
              const running = isRunning(c.target);
              const cover = coverFor(c.target, c.mcVersion);
              const otherVersion = !!mcVersion && c.mcVersion !== mcVersion;
              return (
                <button
                  key={c.target}
                  onClick={() => start(c)}
                  disabled={busy || running}
                  className="list-row group flex w-full items-center gap-3.5 p-2.5 text-left disabled:opacity-60"
                >
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[13px] bg-white/[0.05]">
                    {cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-accent">
                        <Icon cls="fa-solid fa-cube" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14.5px] font-semibold text-text">{c.title}</span>
                      {c.match && (
                        <span className="tag tag-accent shrink-0">
                          {t("Как у друга")}
                        </span>
                      )}
                    </span>
                    <span
                      className={`block truncate text-[12px] ${otherVersion ? "text-warn" : "text-muted"}`}
                      title={otherVersion ? t("Другая версия игры, сервер может не пустить") : undefined}
                    >
                      {c.meta}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium text-muted">
                    {running ? t("Уже запущено") : <Icon cls="fa-solid fa-play text-accent" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
