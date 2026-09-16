import { useState } from "react";
import Modal from "./Modal";
import {
  completeFirstRun,
  importExternalInstance,
  type ExternalInstance,
} from "../api";
import { useToast } from "../ToastContext";
import { t, ts } from "../i18n";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

const sourceIcon: Record<string, string> = {
  prism: "fa-gem",
  multimc: "fa-cubes",
  polymc: "fa-cubes",
  modrinth: "fa-cube",
};

export default function FirstRunImport({
  instances,
  onClose,
}: {
  instances: ExternalInstance[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(instances.map((i) => i.path))
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const toast = useToast();

  const toggle = (path: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const finish = async () => {
    await completeFirstRun();
    onClose();
  };

  const skip = async () => {
    if (busy) return;
    await finish();
  };

  const runImport = async () => {
    const list = instances.filter((i) => selected.has(i.path));
    if (list.length === 0) return skip();
    setBusy(true);
    setDone(0);
    let ok = 0;
    for (const inst of list) {
      try {
        await importExternalInstance(inst.path, inst.source);
        ok++;
      } catch (e) {

        toast(t("«{name}»: {e}", { name: inst.name, e: ts(String(e)) }), "error");
      }
      setDone((d) => d + 1);
    }
    setBusy(false);
    toast(
      ok > 0 ? t("Импортировано сборок: {n}", { n: ok }) : t("Ничего не импортировано"),
      ok > 0 ? "success" : "info"
    );
    await finish();
  };

  const total = selected.size;

  return (
    <Modal
      title={t("Импорт сборок")}
      subtitle={t("Нашли сборки в других лаунчерах — перенести их в Aciron?")}
      icon="fa-file-import"
      dismissible={!busy}
      onClose={skip}
    >
      <div className="flex max-h-[60vh] flex-col p-5">
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent">
          <i className="fa-solid fa-circle-info mt-0.5" />
          <span>
            {t(
              "Скопируются моды, ресурспаки, шейдеры и конфиги. Оригинальные сборки в других лаунчерах не изменятся."
            )}
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {instances.map((inst) => {
            const on = selected.has(inst.path);
            return (
              <button
                key={inst.path}
                onClick={() => !busy && toggle(inst.path)}
                disabled={busy}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  on ? "border-accent/60 bg-accent/5" : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    on ? "bg-accent text-bg" : "bg-bg text-muted"
                  }`}
                >
                  <i className={`fa-solid ${sourceIcon[inst.source] ?? "fa-box"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text">{inst.name}</div>
                  <div className="truncate text-xs text-muted">
                    {inst.source_label} · {inst.mc_version} ·{" "}
                    {loaderLabel[inst.loader] ?? inst.loader} ·{" "}
                    {t("{n} мод(ов)", { n: inst.mods_count })}
                  </div>
                </div>
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                    on ? "border-accent bg-accent text-bg" : "border-border text-transparent"
                  }`}
                >
                  <i className="fa-solid fa-check text-[10px]" />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          {busy ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              <i className="fa-solid fa-spinner fa-spin" />
              {t("Импорт… {done}/{total}", { done, total })}
            </span>
          ) : (
            <span className="text-xs text-muted">{t("Выбрано: {n}", { n: total })}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={skip}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {t("Пропустить")}
            </button>
            <button
              onClick={runImport}
              disabled={busy || total === 0}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-50"
            >
              <i className="fa-solid fa-file-import" />
              {t("Импортировать")}
              {total > 0 ? ` (${total})` : ""}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
