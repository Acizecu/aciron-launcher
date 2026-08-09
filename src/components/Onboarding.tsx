import { useEffect, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  headSkinUrl,
  defaultSettings,
  getAccounts,
  getSettings,
  pickFolder,
  saveSettings,
  totalRamMb,
  type Account,
  type Settings,
} from "../api";
import { PRESET_LIST, PRESETS, useTheme } from "../ThemeContext";
import { LANGS, setLang, useLang } from "../i18n";
import AcironLogo from "./AcironLogo";
import AddAccountModal from "./AddAccountModal";
import Head from "./Head";
import { LangFlag } from "./FlagIcons";
import { THEME_GRID_CLS, ThemeCard } from "./settings/ThemeSettings";

const appWindow = (() => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
})();

type StepId = "welcome" | "lang" | "files" | "theme" | "account" | "done";

const STEPS: StepId[] = ["welcome", "lang", "files", "theme", "account", "done"];

function rise(i: number): { animationDelay: string } {
  return { animationDelay: `${80 + i * 70}ms` };
}

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLang();
  const { state, setTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [maxRam, setMaxRam] = useState(16384);
  const [signIn, setSignIn] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  const [themeBefore] = useState(state.id);

  const id = STEPS[step];

  useEffect(() => {
    void (async () => {
      const [s, ram] = await Promise.all([
        getSettings().catch(() => defaultSettings()),
        totalRamMb().catch(() => 16384),
      ]);
      setSettings(s);
      setMaxRam(ram);
    })();
  }, []);

  useEffect(() => {
    if (id !== "account" && id !== "done") return;
    void getAccounts()
      .then((a) => setAccount(a.accounts.find((x) => x.id === a.active) ?? null))
      .catch(() => {});
  }, [id, signIn]);

  const patch = (p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s));

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {

      const fresh = await getSettings();
      const own = settings;
      await saveSettings({
        ...fresh,
        ...(own
          ? {
              game_dir: own.game_dir,
              versions_dir: own.versions_dir,
              builds_dir: own.builds_dir,
              ram_mb: own.ram_mb,
            }
          : {}),
        onboarded: true,
      });
    } catch {

    }
    setSaving(false);
    onClose();
  };

  const next = () => (step === STEPS.length - 1 ? void finish() : setStep((s) => s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !signIn) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chooseFolder = async () => {
    const dir = await pickFolder(settings?.game_dir);
    if (!dir) return;

    const sep = dir.includes("/") && !dir.includes("\\") ? "/" : "\\";
    patch({
      game_dir: dir,
      versions_dir: `${dir}${sep}versions`,
      builds_dir: `${dir}${sep}builds`,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-bg text-text">
      {}
      <div
        className="aurora aurora-1 h-[46vh] w-[46vw]"
        style={{ left: "-8vw", top: "-10vh", background: "var(--color-accent)", opacity: 0.16 }}
      />
      <div
        className="aurora aurora-2 h-[38vh] w-[42vw]"
        style={{ right: "-6vw", top: "8vh", background: "var(--color-accent)", opacity: 0.1 }}
      />
      <div
        className="aurora aurora-3 h-[42vh] w-[52vw]"
        style={{ left: "18vw", bottom: "-16vh", background: "var(--color-accent)", opacity: 0.08 }}
      />

      {}
      <div
        data-tauri-drag-region
        className="relative z-10 flex h-9 items-center px-3 text-[13px]"
      >
        <span data-tauri-drag-region className="pointer-events-none flex gap-1">
          <span className="text-gradient font-semibold">Aciron</span>
          <span className="text-muted">Launcher</span>
        </span>
        <div className="ml-auto flex h-full items-center">
          <button
            onClick={() => appWindow?.minimize()}
            aria-label={t("Свернуть")}
            className="grid h-9 w-9 place-items-center rounded-md text-[#676767] transition-colors hover:bg-ctrl-hover hover:text-text"
          >
            <svg width="15" height="2" viewBox="0 0 15 2" fill="none">
              <path d="M1 1H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => appWindow?.close()}
            aria-label={t("Закрыть")}
            className="grid h-9 w-9 place-items-center rounded-md text-[#676767] transition-colors hover:bg-[#FF3535]/50 hover:text-[#CDCDCD]"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M1 1L14 14M1 14L14 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative z-10 flex h-[calc(100%-2.25rem)] flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center px-8">
          <div key={id} className="wizard-in w-full max-w-[720px]">
            {id === "welcome" && (
              <div className="text-center">
                {}
                <div className="rise-in mx-auto mb-7 grid place-items-center" style={rise(0)}>
                  <AcironLogo size={116} className="logo-glow" />
                </div>
                <h1 className="rise-in text-[34px] font-light leading-tight" style={rise(1)}>
                  {t("Настроим лаунчер под вас")}
                </h1>
                <p
                  className="rise-in mx-auto mt-3 max-w-[440px] text-sm leading-relaxed text-muted"
                  style={rise(2)}
                >
                  {t(
                    "Это займёт меньше минуты. Всё, что выберете, потом можно поменять в настройках."
                  )}
                </p>
                <button
                  onClick={next}
                  className="rise-in mt-8 h-12 rounded-xl bg-accent px-8 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
                  style={rise(3)}
                >
                  {t("Начать настройку")}
                </button>
              </div>
            )}

            {id === "lang" && (
              <StepShell
                icon="fa-language"
                title={t("Язык")}
                desc={t("Интерфейс лаунчера. Язык игры от этого не зависит.")}
              >
                <div className="grid grid-cols-2 gap-3">
                  {LANGS.map((l, i) => (
                    <Choice
                      key={l.id}
                      i={i}
                      on={lang === l.id}
                      onClick={() => setLang(l.id)}
                      title={l.label}
                      sub={l.id === "ru" ? t("Русский язык") : "English"}
                      flag={l.id}
                    />
                  ))}
                </div>
              </StepShell>
            )}

            {id === "files" && (
              <StepShell
                icon="fa-folder-open"
                title={t("Папка игры")}
                desc={t("Куда складывать версии, сборки и файлы игры")}
              >
                <div className="rise-in rounded-2xl border border-border bg-card/60 p-4" style={rise(0)}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-accent">
                      <i className="fa-solid fa-folder" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-sm text-text"
                        title={settings?.game_dir ?? ""}
                      >
                        {settings?.game_dir || "…"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {t("versions и builds будут внутри этой папки")}
                      </div>
                    </div>
                    <button
                      onClick={chooseFolder}
                      className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      {t("Выбрать папку")}
                    </button>
                  </div>
                </div>

                <div className="rise-in mt-3 rounded-2xl border border-border bg-card/60 p-4" style={rise(1)}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-text">{t("Память для игры")}</span>
                    <span className="text-sm tabular-nums text-accent">
                      {t("{n} ГБ", { n: ((settings?.ram_mb ?? 4096) / 1024).toFixed(1) })}
                    </span>
                  </div>
                  {}
                  {(() => {
                    const min = 1024;
                    const max = Math.max(4096, Math.floor(maxRam * 0.8));
                    const val = settings?.ram_mb ?? 4096;
                    return (
                      <input
                        type="range"
                        className="aciron-range mt-3 w-full"
                        min={min}
                        max={max}
                        step={512}
                        value={val}
                        onChange={(e) => patch({ ram_mb: Number(e.target.value) })}
                        style={
                          {
                            "--pct": `${((val - min) / (max - min)) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    );
                  })()}
                  <div className="mt-1 flex justify-between text-[11px] text-muted">
                    <span>{t("1 ГБ")}</span>
                    <span>{t("всего в системе: {n} ГБ", { n: (maxRam / 1024).toFixed(0) })}</span>
                  </div>
                </div>
              </StepShell>
            )}

            {id === "theme" && (
              <StepShell
                icon="fa-palette"
                title={t("Внешний вид")}
                desc={t("Выберите тему — её видно сразу")}
              >
                {}
                <div className="max-h-[44vh] overflow-y-auto">
                  <div className={THEME_GRID_CLS}>
                    {PRESET_LIST.map((p, i) => (
                      <div key={p.id} className="rise-in" style={rise(Math.min(i, 6))}>
                        <ThemeCard
                          label={p.label}
                          palette={PRESETS[p.id]}
                          active={state.id === p.id}
                          onClick={() => setTheme(p.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {state.id !== themeBefore && (
                  <button
                    onClick={() => setTheme(themeBefore)}
                    className="mt-3 text-[11px] text-muted transition-colors hover:text-text"
                  >
                    <i className="fa-solid fa-rotate-left mr-1.5 text-[10px]" />
                    {t("Вернуть прежнюю тему")}
                  </button>
                )}
              </StepShell>
            )}

            {id === "account" && (
              <StepShell
                icon="fa-user"
                title={t("Вход в аккаунт")}
                desc={t(
                  "Аккаунт нужен для друзей, чата, скинов и плащей. Можно и пропустить — играть это не мешает."
                )}
              >
                {account ? (
                  <div
                    className="rise-in flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/8 p-4"
                    style={rise(0)}
                  >
                    <Head
                      skin={headSkinUrl(account)}
                      name={account.aciron_name || account.username}
                      size={44}
                      className="shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text">
                        {account.aciron_name || account.username}
                      </div>
                      <div className="text-[11px] text-muted">{t("Вы вошли — всё готово")}</div>
                    </div>
                    <i className="fa-solid fa-circle-check text-lg text-accent" />
                  </div>
                ) : (
                  <button
                    onClick={() => setSignIn(true)}
                    className="rise-in flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 text-left transition-colors hover:border-accent/50"
                    style={rise(0)}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg text-accent">
                      <i className="fa-solid fa-right-to-bracket" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">
                        {t("Войти в Aciron ID")}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {t("Или создать новый аккаунт — это бесплатно")}
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right text-xs text-muted" />
                  </button>
                )}
              </StepShell>
            )}

            {id === "done" && (
              <div className="text-center">
                <div
                  className="pop-in mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full bg-accent/15 text-4xl text-accent"
                  style={{ animationDelay: "60ms" }}
                >
                  <i className="fa-solid fa-check" />
                </div>
                <h1 className="rise-in text-[32px] font-light" style={rise(1)}>
                  {t("Всё готово")}
                </h1>
                <p className="rise-in mt-3 text-sm text-muted" style={rise(2)}>
                  {t("Приятной игры!")}
                </p>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="rise-in mt-8 h-12 rounded-xl bg-accent px-9 text-sm font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
                  style={rise(3)}
                >
                  {saving ? <i className="fa-solid fa-spinner fa-spin" /> : t("Играть")}
                </button>
              </div>
            )}
          </div>
        </div>

        {}
        {id !== "welcome" && (
          <div className="flex shrink-0 items-center gap-4 px-8 pb-7">
            <button
              onClick={back}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-sm text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-arrow-left text-xs" />
              {t("Назад")}
            </button>

            <div className="mx-auto flex items-center gap-2">
              {STEPS.slice(1, -1).map((s, i) => {
                const cur = step - 1;
                return (
                  <span
                    key={s}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === cur ? "w-6 bg-accent" : i < cur ? "w-1.5 bg-accent/50" : "w-1.5 bg-border"
                    }`}
                  />
                );
              })}
            </div>

            {id === "done" ? (
              <span className="h-11 w-[104px]" />
            ) : (
              <button
                onClick={next}
                className="flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
              >
                {id === "account" && !account ? t("Пропустить") : t("Далее")}
                <i className="fa-solid fa-arrow-right text-xs" />
              </button>
            )}
          </div>
        )}
      </div>

      {signIn && (
        <AddAccountModal
          initialStep="aciron"
          onAdded={() => setSignIn(false)}
          onClose={() => setSignIn(false)}
        />
      )}
    </div>
  );
}

function StepShell({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span
          className="rise-in grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/12 text-lg text-accent"
          style={rise(0)}
        >
          <i className={`fa-solid ${icon}`} />
        </span>
        <div className="min-w-0">
          <h1 className="rise-in text-[26px] font-light leading-tight" style={rise(1)}>
            {title}
          </h1>
          <p className="rise-in mt-1 text-[13px] leading-relaxed text-muted" style={rise(2)}>
            {desc}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Choice({
  i,
  on,
  onClick,
  title,
  sub,
  flag,
}: {
  i: number;
  on: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  flag: string;
}) {
  return (
    <button
      onClick={onClick}
      style={rise(i)}
      className={`rise-in flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${
        on
          ? "border-accent/60 bg-accent/8"
          : "border-border bg-card/50 hover:border-accent/40 hover:bg-card"
      }`}
    >
      {}
      <span className="grid w-11 shrink-0 place-items-center">
        <LangFlag lang={flag} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-text">{title}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
      {on && <i className="fa-solid fa-check text-xs text-accent" />}
    </button>
  );
}

