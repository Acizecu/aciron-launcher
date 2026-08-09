import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  type Settings,
  type BuildInfo,
  getSettings,
  saveSettings,
  defaultSettings,
  detectJava,
  pickFolder,
  pickFile,
  openFolder,
  moveDirectories,
  hardwareCapable,
  totalRamMb,
  buildInfo,
} from "../api";
import Modal from "./Modal";
import ThemeSettings from "./settings/ThemeSettings";
import { Card, Field, PathRow, Toggle, iconBtnCls, inputCls } from "./settings/controls";
import Dropdown from "./Dropdown";
import { LangFlag } from "./FlagIcons";
import { DEBUG_TOOLS } from "../config";
import { getSfxPrefs, setSfxPrefs } from "../sfx";
import { useToast } from "./../ToastContext";
import { LANGS, setLang, t, ts, useLang, type Lang } from "../i18n";

const FOLDER_FIELDS: { key: "game_dir" | "versions_dir" | "builds_dir"; label: string }[] = [
  { key: "game_dir", label: "Папка игры" },
  { key: "versions_dir", label: "Папка версий" },
  { key: "builds_dir", label: "Папка сборок" },
];

type FolderMove = { from: string; to: string; label: string };

type CatId = "theme" | "java" | "game" | "behavior" | "folders";

const CATS: { id: CatId; label: string; icon: string }[] = [
  { id: "theme", label: "Тема", icon: "fa-palette" },
  { id: "java", label: "Java", icon: "fa-mug-hot" },
  { id: "game", label: "Игра", icon: "fa-gamepad" },
  { id: "behavior", label: "Лаунчер", icon: "fa-sliders" },
  { id: "folders", label: "Папки", icon: "fa-folder-tree" },
];

export default function SettingsPage({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(true);

  const { lang } = useLang();

  useEffect(() => {
    onDirtyChange?.(!saved);
  }, [saved, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [hwCap, setHwCap] = useState(true);

  const [ramMax, setRamMax] = useState(16384);

  const [bi, setBi] = useState<BuildInfo | null>(null);

  const [sfx, setSfx] = useState(getSfxPrefs);
  const [cat, setCat] = useState<CatId>("theme");
  const [folderPrompt, setFolderPrompt] = useState<FolderMove[] | null>(null);
  const toast = useToast();

  const origRef = useRef<Record<"game_dir" | "versions_dir" | "builds_dir", string> | null>(null);

  useEffect(() => {
    getSettings().then((fresh) => {
      setS(fresh);
      origRef.current = {
        game_dir: fresh.game_dir,
        versions_dir: fresh.versions_dir,
        builds_dir: fresh.builds_dir,
      };
    });
    hardwareCapable().then(setHwCap);
    totalRamMb().then(setRamMax);
    buildInfo().then(setBi).catch(() => {});
  }, []);

  if (!s) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <i className="fa-solid fa-spinner fa-spin text-2xl" />
      </div>
    );
  }

  const update = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setSaved(false);
  };

  const persist = async (move: boolean, moves: FolderMove[]) => {
    await saveSettings(s);
    origRef.current = {
      game_dir: s.game_dir,
      versions_dir: s.versions_dir,
      builds_dir: s.builds_dir,
    };
    setSaved(true);
    setFolderPrompt(null);

    if (move && moves.length > 0) {
      window.dispatchEvent(
        new CustomEvent("aciron-task-start", { detail: { name: t("Перенос файлов") } })
      );
      moveDirectories(moves.map((m) => ({ from: m.from, to: m.to })))
        .then(() => toast(t("Файлы перенесены в новое место"), "success"))
        .catch((e) => {
          window.dispatchEvent(new CustomEvent("aciron-task-end"));
          toast(t("Перенос файлов: {e}", { e: ts(String(e)) }), "error");
        });
    }
  };

  const onSave = async () => {
    const orig = origRef.current;
    const moves: FolderMove[] = orig
      ? FOLDER_FIELDS.map((f) => ({
          from: orig[f.key],
          to: String(s[f.key]),
          label: f.label,
        })).filter((m) => m.from && m.to && m.from !== m.to)
      : [];

    if (moves.length > 0) {
      setFolderPrompt(moves);
      return;
    }
    await persist(false, []);
  };
  const onReset = async () => {
    const def = await defaultSettings();
    setS(def);
    setSaved(false);
  };
  const onDetectJava = async () => {
    const j = await detectJava();
    if (j) update({ java_path: j });
  };
  const browseJava = async () => {
    const f = await pickFile("Java", ["exe"], s.java_path);
    if (f) update({ java_path: f });
  };
  const pick = async (key: keyof Settings) => {
    const dir = await pickFolder(String(s[key]));
    if (dir) update({ [key]: dir } as Partial<Settings>);
  };

  const ramGb = (s.ram_mb / 1024).toFixed(1);

  return (
    <div className="flex h-full min-h-0">
      {}
      <nav className="flex w-52 shrink-0 flex-col gap-1 border-r border-border p-3">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm transition-colors ${
              cat === c.id ? "bg-card text-text" : "text-muted hover:text-text"
            }`}
          >
            <i className={`fa-solid ${c.icon} w-4 text-center ${cat === c.id ? "text-accent" : ""}`} />
            {t(c.label)}
          </button>
        ))}
        <div className="mt-auto space-y-1 pt-3">
          <button
            onClick={onReset}
            className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            <i className="fa-solid fa-arrow-rotate-left w-4 text-center" />
            {t("Сбросить")}
          </button>
        </div>
      </nav>

      {}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-5 px-6 py-6">
            {cat === "theme" && <ThemeSettings />}

            {cat === "java" && (
              <>
                <h2 className="text-lg font-bold text-text">Java</h2>
                <Card>
                  <Field column>
                    <div className="flex gap-2">
                      <input
                        className={inputCls}
                        value={s.java_path}
                        placeholder={t("Путь к java.exe")}
                        onChange={(e) => update({ java_path: e.target.value })}
                      />
                      <button className={iconBtnCls} title={t("Обзор")} onClick={browseJava}>
                        <i className="fa-solid fa-folder-open text-sm" />
                      </button>
                      <button
                        className={iconBtnCls}
                        title={t("Определить автоматически")}
                        onClick={onDetectJava}
                      >
                        <i className="fa-solid fa-wand-magic-sparkles text-sm" />
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      {t("Путь к Java дирректории")}
                    </p>
                  </Field>
                  <Field label={t("JVM-аргументы")} hint={t("Доп. флаги виртуальной машины при запуске (через пробел)")} column>
                    <input
                      className={`${inputCls} font-mono`}
                      value={s.jvm_args}
                      placeholder="-XX:+UseG1GC -Dfile.encoding=UTF-8"
                      onChange={(e) => update({ jvm_args: e.target.value })}
                    />
                  </Field>
                </Card>
              </>
            )}

            {cat === "game" && (
              <>
                <h2 className="text-lg font-bold text-text">{t("Игра")}</h2>
                <Card>
                  <Field label={t("Оперативная память")} hint={t("Сколько ОЗУ выделять игре")}>
                    <span className="rounded-md bg-bg px-2.5 py-1 text-sm font-semibold text-accent">
                      {ramGb} {t("ГБ")}
                    </span>
                  </Field>
                  <div className="px-4 pb-4">
                    <input
                      type="range"
                      min={1024}
                      max={ramMax}
                      step={512}
                      value={Math.min(s.ram_mb, ramMax)}
                      onChange={(e) => update({ ram_mb: Number(e.target.value) })}
                      className="aciron-range"
                      style={
                        {
                          "--pct": `${
                            ((Math.min(s.ram_mb, ramMax) - 1024) / Math.max(1, ramMax - 1024)) * 100
                          }%`,
                        } as CSSProperties
                      }
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-muted">
                      <span>{t("1 ГБ")}</span>
                      <span>
                        {Math.round(ramMax / 1024)} {t("ГБ")}
                      </span>
                    </div>
                  </div>
                  <Field
                    label={t("Запуск в полноэкранном режиме")}
                    hint={t("Игра будет открываться на весь экран")}
                  >
                    <Toggle value={s.fullscreen} onChange={(v) => update({ fullscreen: v })} />
                  </Field>
                  <Field label={t("Размер окна игры")} hint={t("Если полноэкранный режим выключен")}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="w-20 rounded-lg border border-border bg-bg px-2 py-1.5 text-center text-sm text-text outline-none focus:border-accent disabled:opacity-50"
                        value={s.window_width}
                        disabled={s.fullscreen}
                        onChange={(e) => update({ window_width: Number(e.target.value) })}
                      />
                      <i className="fa-solid fa-xmark text-xs text-muted" />
                      <input
                        type="number"
                        className="w-20 rounded-lg border border-border bg-bg px-2 py-1.5 text-center text-sm text-text outline-none focus:border-accent disabled:opacity-50"
                        value={s.window_height}
                        disabled={s.fullscreen}
                        onChange={(e) => update({ window_height: Number(e.target.value) })}
                      />
                    </div>
                  </Field>
                </Card>
              </>
            )}

            {cat === "behavior" && (
              <>
                <h2 className="text-lg font-bold text-text">{t("Поведение лаунчера")}</h2>
                <Card>
                  {}
                  <Field
                    label={t("Язык интерфейса")}
                    hint={t("Язык игры от этого не зависит")}
                  >
                    <Dropdown
                      className="w-[190px]"
                      align="right"
                      value={lang}
                      onChange={(v) => {
                        setLang(v as Lang);

                        setS((p) => (p ? { ...p, language: v as Lang } : p));
                      }}
                      options={LANGS.map((l) => ({
                        value: l.id,
                        label: l.label,
                        node: <LangFlag lang={l.id} size={16} />,
                      }))}
                    />
                  </Field>
                </Card>
                <Card>
                  {}
                  <Field label={t("Звук нажатия")} hint={t("Щелчок при нажатии на кнопки")}>
                    <Toggle
                      value={sfx.click}
                      onChange={(v) => {
                        setSfx((p) => ({ ...p, click: v }));
                        setSfxPrefs({ click: v });
                      }}
                    />
                  </Field>
                  <Field label={t("Звук наведения")} hint={t("Тихий отклик при наведении на кнопку")}>
                    <Toggle
                      value={sfx.hover}
                      onChange={(v) => {
                        setSfx((p) => ({ ...p, hover: v }));
                        setSfxPrefs({ hover: v });
                      }}
                    />
                  </Field>
                </Card>
                <Card>
                  <Field
                    label={t("Размер интерфейса")}
                    hint={t("Масштаб окна лаунчера — работает и в развёрнутом/полноэкранном окне")}
                  >
                    <span className="rounded-md bg-bg px-2.5 py-1 text-sm font-semibold text-accent">
                      {s.ui_scale}%
                    </span>
                  </Field>
                  <div className="px-4 pb-4">
                    <input
                      type="range"
                      min={80}
                      max={160}
                      step={5}
                      value={s.ui_scale}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        update({ ui_scale: v });

                        window.dispatchEvent(new CustomEvent("aciron-ui-scale", { detail: v }));
                      }}
                      className="aciron-range"
                      style={{ "--pct": `${((s.ui_scale - 80) / (160 - 80)) * 100}%` } as CSSProperties}
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-muted">
                      <span>80%</span>
                      <span>160%</span>
                    </div>
                  </div>
                  <Field
                    label={t("Скрывать лаунчер при запуске игры")}
                    hint={t("Спрячется, пока игра открыта, и вернётся после её закрытия")}
                  >
                    <Toggle value={s.hide_on_launch} onChange={(v) => update({ hide_on_launch: v })} />
                  </Field>
                  <Field
                    label={t("Анимация фона")}
                    hint={t("Плавающие кубики на фоне лаунчера")}
                  >
                    <Toggle
                      value={s.background_anim ?? hwCap}
                      onChange={(v) => update({ background_anim: v })}
                    />
                  </Field>
                  <Field
                    label="Discord Rich Presence"
                    hint={t("Показывать в Discord, во что вы играете")}
                  >
                    <Toggle value={s.discord_rpc} onChange={(v) => update({ discord_rpc: v })} />
                  </Field>
                  <Field
                    label={t("Авто добавление серверов")}
                    hint={t("Добавляет топ 5 серверов из категории Сервера в список серверов")}
                  >
                    <Toggle value={s.autoadd_server} onChange={(v) => update({ autoadd_server: v })} />
                  </Field>
                  <Field
                    label={t("Звук уведомлений")}
                    hint={t("Сигнал при заявке в друзья и других всплывающих уведомлениях")}
                  >
                    <Toggle value={s.notify_sound} onChange={(v) => update({ notify_sound: v })} />
                  </Field>
                  <Field
                    label={t("Проверять обновления при запуске")}
                    hint={t("Только уведомляет о доступном обновлении. Установка — всегда вручную.")}
                  >
                    <Toggle
                      value={s.auto_update_check}
                      onChange={(v) => update({ auto_update_check: v })}
                    />
                  </Field>
                </Card>

                {}
                {DEBUG_TOOLS && (
                <Card>
                  <Field
                    label={t("Канал сборки")}
                    hint={
                      bi && bi.channel !== "local" && !bi.dirty
                        ? t("Опубликованный канал автообновления")
                        : t("Локальная сборка: автообновление недоступно")
                    }
                  >
                    <span className="rounded-md bg-bg px-2.5 py-1 text-sm font-semibold text-accent">
                      {!bi
                        ? "…"
                        : bi.channel === "dev"
                        ? `Dev · v${bi.version}${bi.dirty ? "+dirty" : ""}`
                        : bi.channel === "stable"
                        ? `Stable · v${bi.version}`
                        : t("Локальная · v{version}", {
                            version: `${bi.version}${bi.dirty ? "+dirty" : "+local"}`,
                          })}
                    </span>
                  </Field>
                  <Field
                    label={t("Dev Mode — отключить автообновление")}
                    hint={t("Полностью отключает проверку/установку. Рекомендуется, пока правите код.")}
                  >
                    <Toggle
                      value={s.dev_mode_disable_updates}
                      onChange={(v) => update({ dev_mode_disable_updates: v })}
                    />
                  </Field>
                  {s.skipped_update_version && (
                    <Field
                      label={t("Пропущенная версия")}
                      hint={t("Не спрашивать про v{version}", {
                        version: s.skipped_update_version,
                      })}
                    >
                      <button
                        onClick={() => update({ skipped_update_version: "" })}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
                      >
                        {t("Сбросить")}
                      </button>
                    </Field>
                  )}
                </Card>
                )}
              </>
            )}

            {cat === "folders" && (
              <>
                <h2 className="text-lg font-bold text-text">{t("Папки лаунчера")}</h2>
                <Card>
                  <Field label={t("Папка игры")} column>
                    <PathRow value={s.game_dir} onPick={() => pick("game_dir")} onOpen={() => openFolder(s.game_dir)} />
                  </Field>
                  <Field label={t("Папка версий")} column>
                    <PathRow value={s.versions_dir} onPick={() => pick("versions_dir")} onOpen={() => openFolder(s.versions_dir)} />
                  </Field>
                  <Field label={t("Папка сборок")} column>
                    <PathRow value={s.builds_dir} onPick={() => pick("builds_dir")} onOpen={() => openFolder(s.builds_dir)} />
                  </Field>
                </Card>
              </>
            )}
          </div>
        </div>

        {}
        <div
          aria-hidden={saved}
          className={`flex items-center gap-3 border-t border-border bg-panel px-6 py-3 transition-opacity duration-200 ${
            saved ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
            <span className="flex items-center gap-2 text-sm text-muted">
              <i className="fa-solid fa-circle-info text-accent" />
              {t("Есть несохранённые изменения")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  getSettings().then((fresh) => {
                    setS(fresh);
                    origRef.current = {
                      game_dir: fresh.game_dir,
                      versions_dir: fresh.versions_dir,
                      builds_dir: fresh.builds_dir,
                    };

                    window.dispatchEvent(
                      new CustomEvent("aciron-ui-scale", { detail: fresh.ui_scale })
                    );
                  });
                  setSaved(true);
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {t("Отменить")}
              </button>
              <button
                onClick={onSave}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
              >
                <i className="fa-solid fa-floppy-disk" />
                {t("Сохранить")}
              </button>
            </div>
        </div>
      </div>

      {folderPrompt && (
        <Modal title={t("Папки изменены")} icon="fa-folder-tree" onClose={() => setFolderPrompt(null)}>
          <div className="p-5">
            <p className="text-sm text-text">
              {t("Вы изменили расположение папок. Перенести существующие файлы в новое место?")}
            </p>
            <ul className="mt-3 space-y-1.5">
              {folderPrompt.map((m) => (
                <li key={m.label} className="rounded-lg bg-card px-3 py-2 text-xs">
                  <div className="font-semibold text-text">{t(m.label)}</div>
                  <div className="mt-0.5 truncate text-muted" title={m.from}>
                    {t("из:")} {m.from}
                  </div>
                  <div className="truncate text-muted" title={m.to}>
                    {t("в:")} {m.to}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setFolderPrompt(null)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                {t("Отмена")}
              </button>
              <button
                onClick={() => persist(false, folderPrompt)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent/50"
              >
                {t("Просто сохранить")}
              </button>
              <button
                onClick={() => persist(true, folderPrompt)}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
              >
                <i className="fa-solid fa-truck-fast" />
                {t("Перенести и сохранить")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
