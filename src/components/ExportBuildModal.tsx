import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import {
  buildTree,
  exportBuild,
  saveFile,
  type Build,
  type PackFormat,
  type TreeEntry,
} from "../api";
import { useToast } from "../ToastContext";
import { wasCancelled } from "../downloadTask";
import { t, ts } from "../i18n";
import Icon from "./Icon";

const EXPORT_TASK = "legacy";

const FORMATS: {
  id: PackFormat;
  ext: string;
  title: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: "acpack",
    ext: "acpack",
    title: "Aciron (.acpack)",
    desc: "Открывается двойным кликом. Моды с Modrinth и CurseForge едут ссылками — архив лёгкий.",
    icon: "fa-cube",
  },
  {
    id: "mrpack",
    ext: "mrpack",
    title: "Modrinth (.mrpack)",
    desc: "Общий формат: Modrinth App, Prism и другие. Ссылками уходит только то, что есть на Modrinth.",
    icon: "fa-share-nodes",
  },
];

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return t("{size} ГБ", { size: (bytes / 1024 / 1024 / 1024).toFixed(2) });
  if (bytes >= 1024 * 1024) return t("{size} МБ", { size: (bytes / 1024 / 1024).toFixed(1) });
  if (bytes >= 1024) return t("{size} КБ", { size: Math.round(bytes / 1024) });
  return t("{size} Б", { size: bytes });
}

function suggestName(name: string, ext: string): string {
  const slug =
    name
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "build";
  return `${slug}.${ext}`;
}

const KNOWN_ICON: Record<string, string> = {
  mods: "fa-puzzle-piece",
  resourcepacks: "fa-palette",
  shaderpacks: "fa-wand-sparkles",
  config: "fa-sliders",
  saves: "fa-earth-americas",
  screenshots: "fa-camera",
  journeymap: "fa-map",
  schematics: "fa-compass-drafting",
};

export default function ExportBuildModal({
  build,
  onClose,
}: {
  build: Build;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<PackFormat>("acpack");
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    buildTree(build.id)
      .then((list) => {
        setTree(list);
        setPicked(new Set(list.filter((e) => e.default_on).map((e) => e.name)));
      })
      .catch(() => setTree([]));
  }, [build.id]);

  const total = useMemo(
    () => (tree ?? []).filter((e) => picked.has(e.name)).reduce((s, e) => s + e.size, 0),
    [tree, picked]
  );

  const toggle = (name: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });

  const run = async () => {
    if (busy || picked.size === 0) return;
    const meta = FORMATS.find((f) => f.id === format)!;
    const dest = await saveFile(meta.title, [meta.ext], suggestName(build.name, meta.ext));
    if (!dest) return;
    setBusy(true);
    window.dispatchEvent(
      new CustomEvent("aciron-task-start", {
        detail: {
          name: t("Экспорт: {name}", { name: build.name }),
          cancelLabel: t("Отменить экспорт"),
        },
      })
    );
    try {
      const size = await exportBuild(build.id, format, dest, [...picked]);
      toast(t("Сборка экспортирована, {size}", { size: fmtSize(size) }), "success");
      onClose();
    } catch (e) {

      if (!wasCancelled(EXPORT_TASK)) {
        window.dispatchEvent(new Event("aciron-task-end"));
        toast(ts(String(e)), "error");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("Экспорт сборки")}
      subtitle={build.name}
      icon="fa-file-export"
      width="max-w-lg"
      onClose={onClose}
    >
      <div className="pt-1">
        {}
        <div className="grid grid-cols-2 gap-2.5">
          {FORMATS.map((f) => {
            const on = format === f.id;
            return (
              <button
                key={f.id}
                onClick={() => !busy && setFormat(f.id)}
                disabled={busy}
                className={`flex flex-col gap-2 rounded-[18px] p-3.5 text-left transition-colors duration-300 ${
                  on
                    ? "bg-accent/[0.08] shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
                    : "bg-white/[0.035] hover:bg-white/[0.06]"
                } disabled:opacity-60`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] transition-colors ${
                      on ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted"
                    }`}
                  >
                    <Icon cls={`fa-solid ${f.icon} text-[16px]`} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
                    {f.title}
                  </span>
                  {on && <Icon cls="fa-solid fa-check text-[11.5px] text-accent" />}
                </span>
                <span className="text-[12px] leading-relaxed text-muted">{t(f.desc)}</span>
              </button>
            );
          })}
        </div>

        {}
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-text">{t("Что включить")}</span>
          <span className="text-[12px] tabular-nums text-muted">
            {t("на диске")}: {fmtSize(total)}
          </span>
        </div>

        <div className="mt-2 max-h-[240px] space-y-1 overflow-y-auto pr-1">
          {tree === null && (
            <div className="grid place-items-center py-6 text-muted">
              <Icon cls="fa-solid fa-spinner fa-spin" />
            </div>
          )}
          {tree?.length === 0 && (
            <div className="py-6 text-center text-[13px] text-muted">
              {t("В папке сборки пока пусто")}
            </div>
          )}
          {tree?.map((e) => {
            const on = picked.has(e.name);
            return (
              <button
                key={e.name}
                onClick={() => !busy && toggle(e.name)}
                disabled={busy}
                className={`flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2 text-left transition-colors ${
                  on ? "bg-white/[0.04]" : "hover:bg-white/[0.03]"
                } disabled:opacity-60`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-[7px] border transition-colors duration-200 ${
                    on ? "border-accent bg-accent text-bg" : "border-line-strong text-transparent"
                  }`}
                >
                  <Icon cls="fa-solid fa-check text-[12px]" />
                </span>
                <Icon
                  cls={`fa-solid ${
                    e.is_dir ? KNOWN_ICON[e.name] ?? "fa-folder" : "fa-file"
                  } w-4 shrink-0 text-center text-[12px] ${on ? "text-accent" : "text-muted"}`}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{e.name}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted">
                  {fmtSize(e.size)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {t("Логи, краши и служебные папки в архив не попадают никогда.")}{" "}
          {t(
            "Моды, ресурспаки и шейдеры из репозиториев в архив не кладутся — вместо них едет ссылка, поэтому файл получится заметно легче."
          )}
        </p>

        {}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            {busy ? t("Свернуть") : t("Отмена")}
          </button>
          <button
            onClick={run}
            disabled={busy || picked.size === 0}
            className="btn btn-accent"
          >
            <Icon cls={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-file-export"}`} />
            {busy ? t("Упаковываем…") : t("Экспортировать")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
