import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import BuildCover from "./BuildCover";
import Dropdown from "./Dropdown";
import LoaderVersionPicker from "./builds/LoaderVersionPicker";
import {
  listVersions,
  changeBuildVersion,
  renameBuild,
  setBuildImage,
  setBuildBanner,
  setBuildLoader,
  getBuildBanner,
  pickFile,
  type Build,
  type Loader,
  type VersionInfo,
} from "../api";
import { useToast } from "../ToastContext";
import LoadingDots from "./LoadingDots";
import { t, ts } from "../i18n";

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent";

const loaderLabel: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

const LOADERS: { id: Loader; label: string; icon: string }[] = [
  { id: "fabric", label: "Fabric", icon: "fa-scroll" },
  { id: "forge", label: "Forge", icon: "fa-hammer" },
  { id: "neoforge", label: "NeoForge", icon: "fa-fire" },
  { id: "quilt", label: "Quilt", icon: "fa-layer-group" },
];

export default function BuildSettingsModal({
  build,
  onClose,
  onUpdated,
}: {
  build: Build;
  onClose: () => void;
  onUpdated: (b: Build) => void;
}) {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [version, setVersion] = useState(build.mc_version);
  const [loader, setLoader] = useState<Loader>(build.loader as Loader);
  const [loaderVersion, setLoaderVersion] = useState(build.loader_version ?? "");
  const [name, setName] = useState(build.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [banner, setBanner] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    listVersions()
      .then(setVersions)
      .catch(() => setVersions([]));
    getBuildBanner(build.id).then(setBanner).catch(() => {});
  }, [build.id]);

  const changeBanner = async () => {
    const f = await pickFile(t("Изображение"), ["png", "jpg", "jpeg", "webp", "gif"]);
    if (!f) return;
    try {
      const updated = await setBuildBanner(build.id, f);
      onUpdated(updated);
      setBanner(await getBuildBanner(build.id));
      toast(t("Баннер обновлён"), "success");
    } catch (e) {
      toast(ts(String(e)), "error");
    }
  };

  const dropBanner = async () => {
    try {
      const updated = await setBuildBanner(build.id, "");
      onUpdated(updated);
      setBanner(null);
      toast(t("Баннер убран"), "info");
    } catch (e) {
      toast(ts(String(e)), "error");
    }
  };

  const options = useMemo(() => {
    const list = (versions ?? []).filter((v) => showSnapshots || v.type === "release");
    if (!list.some((v) => v.id === build.mc_version)) {
      list.unshift({ id: build.mc_version, type: "release", release_time: "" });
    }
    return list;
  }, [versions, showSnapshots, build.mc_version]);

  const changeCover = async () => {
    const f = await pickFile(t("Изображение"), ["png", "jpg", "jpeg", "webp", "gif"]);
    if (!f) return;
    try {
      const updated = await setBuildImage(build.id, f);
      onUpdated(updated);
      toast(t("Обложка обновлена"), "success");
    } catch (e) {
      toast(ts(String(e)), "error");
    }
  };

  const nameChanged = name.trim() !== "" && name.trim() !== build.name;
  const versionChanged = version !== build.mc_version;
  const loaderChanged = loader !== build.loader;
  const loaderVersionChanged = loaderVersion !== (build.loader_version ?? "");

  const apply = async () => {
    setError("");
    if (!nameChanged && !versionChanged && !loaderChanged && !loaderVersionChanged) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (nameChanged) {
        const upd = await renameBuild(build.id, name.trim());
        onUpdated(upd);
      }
      if (versionChanged) {
        const upd = await changeBuildVersion(build.id, version);
        onUpdated(upd);
        const off = upd.mods.filter((m) => !m.enabled).length;
        toast(
          t("Версия изменена на {v}", { v: version }) +
            (off ? t(" · {n} мод(ов) выключено (нет под эту версию)", { n: off }) : ""),
          "success"
        );
      }

      if (loaderChanged || loaderVersionChanged) {
        const upd = await setBuildLoader(build.id, loader, loaderVersion);
        onUpdated(upd);
        toast(
          loaderVersion
            ? t("Ядро: {loader} {version}", {
                loader: loaderLabel[loader] ?? loader,
                version: loaderVersion,
              })
            : t("Ядро: {loader}, последняя версия", { loader: loaderLabel[loader] ?? loader }),
          "success"
        );
      } else if (nameChanged && !versionChanged) {
        toast(t("Сохранено"), "success");
      }
      onClose();
    } catch (e) {
      setError(ts(String(e)));
      toast(ts(String(e)), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("Настройка сборки")}
      subtitle={
        build.loader_version
          ? `${loaderLabel[build.loader] ?? build.loader} ${build.loader_version}`
          : loaderLabel[build.loader] ?? build.loader
      }
      icon="fa-gear"
      onClose={onClose}
    >
      <div className="space-y-5 p-5">
        {}
        <div className="flex gap-4">
          <button
            onClick={changeCover}
            title={t("Изменить обложку")}
            className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border"
          >
            <BuildCover build={build} className="h-24 w-24" />
            <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="flex flex-col items-center gap-1 text-white">
                <i className="fa-solid fa-camera" />
                <span className="text-[10px] font-medium">{t("Обложка")}</span>
              </span>
            </span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <label className="mb-1.5 block text-xs text-muted">{t("Название сборки")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              maxLength={60}
              placeholder={t("Моя сборка")}
              className={inputCls}
            />
            <p className="mt-1.5 text-[11px] text-muted">{t("Папка сборки на диске не изменится.")}</p>
          </div>
        </div>

        {}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted">{t("Баннер карточки")}</span>
            {banner && (
              <button
                onClick={dropBanner}
                className="text-[11px] font-medium text-muted transition-colors hover:text-[#ef4444]"
              >
                <i className="fa-solid fa-trash-can mr-1" />
                {t("Убрать")}
              </button>
            )}
          </div>
          <button
            onClick={changeBanner}
            title={banner ? t("Сменить баннер") : t("Выбрать картинку")}
            className="group relative h-28 w-full overflow-hidden rounded-[16px] border border-border bg-bg"
          >
            {banner ? (
              <img src={banner} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted">
                <span className="flex flex-col items-center gap-1">
                  <i className="fa-solid fa-image" />
                  <span className="text-[11px]">{t("Добавить баннер")}</span>
                </span>
              </span>
            )}
            {banner && (
              <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="flex flex-col items-center gap-1 text-white">
                  <i className="fa-solid fa-camera" />
                  <span className="text-[10px] font-medium">{t("Сменить")}</span>
                </span>
              </span>
            )}
          </button>
          <p className="mt-1.5 text-[11px] text-muted">
            {t("Показывается на карточке сборки. Рекомендуемый размер — 570×300.")}
          </p>
        </div>

        {}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs text-muted">{t("Версия Minecraft")}</span>
            <button
              onClick={() => setShowSnapshots((s) => !s)}
              className={`text-[11px] font-medium transition-colors ${
                showSnapshots ? "text-accent" : "text-muted hover:text-text"
              }`}
            >
              <i className="fa-solid fa-flask mr-1" />
              {t("Снапшоты")}
            </button>
          </div>
          {versions === null ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-muted">
              <i className="fa-solid fa-spinner fa-spin" />
              {t("Загрузка версий")}<LoadingDots className="ml-1" />
            </div>
          ) : (
            <Dropdown
              value={version}
              onChange={setVersion}
              options={options.map((v) => ({
                value: v.id,
                label: v.id + (v.type !== "release" ? ` (${v.type})` : ""),
              }))}
            />
          )}
          {versionChanged && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
              <i className="fa-solid fa-circle-info mt-0.5 text-accent" />
              {t("Моды будут пере-подобраны под {v}; те, которых под неё нет, — выключены.", {
                v: version,
              })}
            </p>
          )}
        </div>

        {}
        <div>
          <span className="mb-1.5 block text-xs text-muted">{t("Ядро (загрузчик модов)")}</span>
          <div className="grid grid-cols-4 gap-2">
            {LOADERS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLoader(l.id)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-colors ${
                  loader === l.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-muted hover:border-accent/40 hover:text-text"
                }`}
              >
                <i className={`fa-solid ${l.icon} text-sm`} />
                <span className="text-[11px] font-medium">{l.label}</span>
              </button>
            ))}
          </div>
          {loaderChanged && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[#fbbf24]">
              <i className="fa-solid fa-triangle-exclamation mt-0.5" />
              {t(
                "Моды пишут под конкретное ядро: установленные под {from} на {to} скорее всего не заработают. Файлы останутся на месте — их можно выключить или удалить вручную.",
                { from: loaderLabel[build.loader] ?? build.loader, to: loaderLabel[loader] ?? loader }
              )}
            </p>
          )}
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-muted">
            {t("Версия {loader}", { loader: loaderLabel[loader] ?? loader })}
          </span>
          <LoaderVersionPicker
            loader={loader}
            mcVersion={version}
            value={loaderVersion}
            onChange={setLoaderVersion}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">
            <i className="fa-solid fa-circle-exclamation mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            {t("Закрыть")}
          </button>
          <button
            onClick={apply}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
          >
            {busy && <i className="fa-solid fa-spinner fa-spin" />}
            {busy ? t("Сохранение…") : t("Сохранить")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
