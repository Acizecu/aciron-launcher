import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { listVersions, type VersionInfo } from "../api";
import { t } from "../i18n";

export default function InstallModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (id: string, type: string) => void;
}) {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [query, setQuery] = useState("");
  const [showSnapshots, setShowSnapshots] = useState(false);

  useEffect(() => {
    listVersions()
      .then(setVersions)
      .catch(() => setVersions([]));
  }, []);

  const filtered = useMemo(() => {
    if (!versions) return [];
    return versions.filter(
      (v) =>
        (showSnapshots || v.type === "release") &&
        v.id.toLowerCase().includes(query.toLowerCase())
    );
  }, [versions, query, showSnapshots]);

  return (
    <Modal title={t("Установить версию")} icon="fa-download" onClose={onClose} width="max-w-lg">
      <div className="flex flex-col">
        {}
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-3">
            <i className="fa-solid fa-magnifying-glass text-xs text-muted" />
            <input
              autoFocus
              className="w-full bg-transparent py-2 text-sm text-text outline-none placeholder:text-muted/60"
              placeholder={t("Поиск версии…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowSnapshots((s) => !s)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showSnapshots
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border text-muted hover:text-text"
            }`}
          >
            <i className="fa-solid fa-flask text-xs" />
            {t("Снапшоты")}
          </button>
        </div>

        {}
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!versions ? (
            <div className="grid place-items-center py-12 text-muted">
              <i className="fa-solid fa-spinner fa-spin text-2xl" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">{t("Ничего не найдено")}</div>
          ) : (
            filtered.map((v) => (
              <div
                key={v.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-card"
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
                    v.type === "release" ? "bg-accent/15 text-accent" : "bg-bg text-muted"
                  }`}
                >
                  <i className={`fa-solid ${v.type === "release" ? "fa-cube" : "fa-flask"} text-sm`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text">{v.id}</div>
                  <div className="text-[11px] capitalize text-muted">
                    {v.type} · {v.release_time.slice(0, 10)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onPick(v.id, v.type);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-bg opacity-0 transition-opacity hover:bg-accent-hover group-hover:opacity-100"
                >
                  <i className="fa-solid fa-download" />
                  {t("Выбрать")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
