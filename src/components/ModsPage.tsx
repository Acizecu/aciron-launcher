import { useCallback, useRef, useState } from "react";
import ModsBrowser from "./ModsBrowser";
import Modal from "./Modal";
import {
  contentVersions,
  getBuilds,
  type Build,
  type ContentKind,
  type SourceId,
} from "../api";
import { t, ts } from "../i18n";
import { useToast } from "../ToastContext";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

export default function ModsPage() {
  const toast = useToast();

  const [ask, setAsk] = useState<{ list: Build[] | null; resolve: (b: Build | null) => void } | null>(
    null
  );

  const current = useRef<((b: Build | null) => void) | null>(null);

  const resolveBuild = useCallback(
    (projectId: string, source: SourceId, kind: ContentKind) =>
      new Promise<Build | null>((resolve) => {
        current.current = resolve;
        setAsk({ list: null, resolve });

        void (async () => {
          try {
            const builds = await getBuilds();

            let list = builds;
            if (kind === "mod") {
              const vers = await contentVersions(source, projectId);
              list = builds.filter((b) =>
                vers.some((v) => v.loaders.includes(b.loader) && v.game_versions.includes(b.mc_version))
              );
            }
            if (current.current === resolve) setAsk({ list, resolve });
          } catch (e) {
            if (current.current !== resolve) return;
            toast(ts(String(e)), "error");
            current.current = null;
            setAsk(null);
            resolve(null);
          }
        })();
      }),
    [toast]
  );

  const close = (picked: Build | null) => {
    ask?.resolve(picked);
    current.current = null;
    setAsk(null);
  };

  return (
    <>
      <ModsBrowser build={null} onInstalled={() => {}} resolveBuild={resolveBuild} />

      {ask && (
        <Modal
          title={t("Куда установить")}
          subtitle={t("Показаны только сборки, куда это встанет")}
          icon="fa-solid fa-cubes"
          onClose={() => close(null)}
        >
          {ask.list === null ? (
            <div className="grid h-24 place-items-center text-muted">
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
          ) : ask.list.length === 0 ? (
            <div className="px-1 py-2 text-sm leading-relaxed text-muted">
              {t(
                "Подходящих сборок нет: ни у одной не совпали версия игры и загрузчик. Создайте сборку с нужной версией — и мод сюда вернётся."
              )}
            </div>
          ) : (
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {ask.list.map((b) => (
                <button
                  key={b.id}
                  onClick={() => close(b)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/60"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg text-accent">
                    <i className="fa-solid fa-cube text-sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">{b.name}</div>
                    <div className="truncate text-[11px] text-muted">
                      {b.mc_version} · {loaderLabel[b.loader] ?? b.loader}
                    </div>
                  </div>
                  <i className="fa-solid fa-chevron-right text-xs text-muted" />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
