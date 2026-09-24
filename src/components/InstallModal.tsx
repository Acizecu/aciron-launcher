import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { listVersions, type VersionInfo } from "../api";
import { t } from "../i18n";
import Icon from "./Icon";

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
        <div className="flex items-center gap-2 pb-3 pt-1">
          <div className="field-wrap flex h-11 flex-1 items-center gap-2.5 px-4">
            <Icon cls="fa-solid fa-magnifying-glass text-[15px] text-muted" />
            <input
              autoFocus
              className="w-full bg-transparent text-[14.5px] text-text outline-none placeholder:text-muted"
              placeholder={t("Поиск версии…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowSnapshots((s) => !s)}
            aria-pressed={showSnapshots}
            className={`btn h-11 ${showSnapshots ? "border-accent/50 bg-accent/[0.08] text-accent-hover" : "btn-secondary"}`}
          >
            <Icon cls="fa-solid fa-flask text-[15px]" />
            {t("Снапшоты")}
          </button>
        </div>

        {}
        <div className="-mx-3 max-h-[52vh] overflow-y-auto">
          {!versions ? (
            <div className="grid place-items-center py-12 text-muted">
              <Icon cls="fa-solid fa-spinner fa-spin text-2xl" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">{t("Ничего не найдено")}</div>
          ) : (
            filtered.map((v) => (
              <div
                key={v.id}
                className="list-row group flex items-center gap-3.5 px-3 py-2.5"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${
                    v.type === "release" ? "bg-accent/12 text-accent" : "bg-white/[0.05] text-muted"
                  }`}
                >
                  <Icon cls={`fa-solid ${v.type === "release" ? "fa-cube" : "fa-flask"} text-[17px]`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-text">{v.id}</div>
                  <div className="text-[12px] capitalize text-muted">
                    {v.type}, {v.release_time.slice(0, 10)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onPick(v.id, v.type);
                    onClose();
                  }}
                  className="btn btn-sm btn-secondary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon cls="fa-solid fa-download text-[14px]" />
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
