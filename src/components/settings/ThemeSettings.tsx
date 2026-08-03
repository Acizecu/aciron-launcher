import { useMemo, useState } from "react";
import {
  useTheme,
  PRESET_LIST,
  PRESETS,
  TOKENS,
  contrast,
  customPalette,
  exportTheme,
  importTheme,
  normalizeHex,
  type Palette,
} from "../../ThemeContext";
import { useToast } from "../../ToastContext";
import { Card, Field, iconBtnCls, inputCls } from "./controls";

function ThemeCard({
  label,
  palette,
  active,
  onClick,
}: {
  label: string;
  palette: Palette;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-[14px] border-1 p-2.5 text-left transition-colors ${
        active ? "border-accent bg-card" : "border-[#232427]/65 hover:border-accent/40"
      }`}
    >
      <div
        className="relative flex h-14 w-full items-center gap-2 overflow-hidden rounded-[10px] border px-2.5"
        style={{ background: palette.bg, borderColor: palette.border }}
      >
        <span className="h-8 w-8 shrink-0 rounded-[8px]" style={{ background: palette.accent }} />
        <span className="flex-1 space-y-1.5">
          <span className="block h-2 w-full rounded-full" style={{ background: palette.text }} />
          <span className="block h-2 w-2/3 rounded-full" style={{ background: palette.muted }} />
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${active ? "text-accent" : "text-text"}`}>{label}</span>
        {active && <i className="fa-solid fa-circle-check text-xs text-accent" />}
      </div>
    </button>
  );
}

function ColorInput({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2" title={title}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
      />
      <input
        value={draft ?? value.toUpperCase()}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-[86px] rounded-lg border border-border bg-bg px-2 py-1.5 text-center font-mono text-[11px] uppercase text-text outline-none transition-colors focus:border-accent"
      />
    </div>
  );
}

function ContrastNotice({ palette }: { palette: Palette }) {
  const main = contrast(palette.text, palette.bg);
  const dim = contrast(palette.muted, palette.bg);
  if (main >= 4.5 && dim >= 3) return null;
  const bad = main < 3 || dim < 2;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs leading-relaxed ${
        bad ? "bg-[#ef4444]/10 text-[#fca5a5]" : "bg-card text-muted"
      }`}
    >
      <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
      <span>
        {main < 4.5 && (
          <>
            Основной текст на этом фоне читается плохо (контраст{" "}
            {main.toFixed(1)} при рекомендуемых 4.5).{" "}
          </>
        )}
        {dim < 3 && <>Тусклый текст почти не виден (контраст {dim.toFixed(1)}). </>}
        Помогает сделать фон темнее или текст светлее.
      </span>
    </div>
  );
}

export default function ThemeSettings() {
  const {
    state: theme,
    palette,
    setTheme,
    setSeed,
    setToken,
    resetTokens,
    saved: themePresets,
    savePreset,
    applySaved,
    deleteSaved,
  } = useTheme();
  const [presetName, setPresetName] = useState("");

  const [tokensOpen, setTokensOpen] = useState(false);

  const [shareCode, setShareCode] = useState("");
  const toast = useToast();

  // customPalette(theme) — чистая функция от theme; раньше вызывалась до N(TOKENS)+3
  // раз за рендер (карточка, поле «Текст», ContrastNotice, каждый токен в map).
  // Считаем палитру один раз и переиспользуем — результат идентичен.
  const pal = useMemo(() => customPalette(theme), [theme]);

  return (
    <>
        <h2 className="text-lg font-bold text-text">Тема оформления</h2>
        <div className="grid grid-cols-3 gap-3">
          {PRESET_LIST.map((t) => (
            <ThemeCard
              key={t.id}
              label={t.label}
              palette={PRESETS[t.id]}
              active={theme.id === t.id}
              onClick={() => setTheme(t.id)}
            />
          ))}
          <ThemeCard
            label="Своя тема"
            palette={pal}
            active={theme.id === "custom"}
            onClick={() => setTheme("custom")}
          />
        </div>

        {theme.id === "custom" && (
          <>
            {}
            <Card>
              <Field
                label="Акцент"
                hint="Кнопки, иконки, выделение. Оттенки для наведения и нажатия считаются сами."
              >
                <ColorInput
                  value={theme.seed.accent}
                  onChange={(v) => setSeed({ accent: v })}
                />
              </Field>
              <Field
                label="Фон"
                hint="Панели, карточки и границы выводятся из него ступенями. Светлый фон делает тему светлой."
              >
                <ColorInput value={theme.seed.base} onChange={(v) => setSeed({ base: v })} />
              </Field>
              <Field
                label="Текст"
                hint="По умолчанию подбирается под яркость фона."
              >
                <ColorInput
                  value={pal.text}
                  onChange={(v) => setSeed({ text: v })}
                />
              </Field>
            </Card>

            <ContrastNotice palette={pal} />

            {}
            <Card>
              <button
                onClick={() => setTokensOpen((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text">Отдельные цвета</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">
                    {Object.keys(theme.overrides).length > 0
                      ? `Изменено вручную: ${Object.keys(theme.overrides).length}`
                      : "Все цвета собираются автоматически"}
                  </div>
                </div>
                <i
                  className={`fa-solid fa-chevron-down text-xs text-muted transition-transform ${
                    tokensOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {tokensOpen && (
                <div className="space-y-2 px-4 py-3.5">
                  {TOKENS.map((t) => {
                    const overridden = t.key in theme.overrides;
                    return (
                      <div key={t.key} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-text">{t.label}</div>
                          {t.hint && (
                            <div className="text-[11px] text-muted">{t.hint}</div>
                          )}
                        </div>
                        {overridden && (
                          <button
                            onClick={() => setToken(t.key, null)}
                            title="Вернуть автоматический цвет"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-accent"
                          >
                            <i className="fa-solid fa-rotate-left text-[11px]" />
                          </button>
                        )}
                        <ColorInput
                          value={pal[t.key]}
                          onChange={(v) => setToken(t.key, v)}
                        />
                      </div>
                    );
                  })}
                  {Object.keys(theme.overrides).length > 0 && (
                    <button
                      onClick={resetTokens}
                      className="mt-1 text-[11px] text-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
                    >
                      Сбросить все ручные правки
                    </button>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {}
        <Card>
          <div className="flex items-center gap-2 px-4 py-3.5">
            <input
              className={inputCls}
              value={presetName}
              maxLength={24}
              placeholder="Название темы"
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) {
                  savePreset(presetName);
                  setPresetName("");
                  toast("Тема сохранена", "success");
                }
              }}
            />
            <button
              onClick={() => {
                if (!presetName.trim()) return;
                savePreset(presetName);
                setPresetName("");
                toast("Тема сохранена", "success");
              }}
              disabled={!presetName.trim()}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-50"
            >
              <i className="fa-solid fa-floppy-disk" />
              Сохранить
            </button>
          </div>
        </Card>

        {}
        {themePresets.length > 0 && (
          <div>
            <span className="mb-2 block text-xs text-muted">Мои темы</span>
            <div className="flex flex-wrap gap-2">
              {themePresets.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-2 pr-1.5 transition-colors hover:border-accent/50"
                >
                  <button
                    onClick={() => applySaved(p)}
                    className="flex items-center gap-2"
                    title="Применить тему"
                  >
                    {}
                    <span
                      className="flex h-6 w-6 shrink-0 overflow-hidden rounded-md border"
                      style={{ borderColor: p.palette.border }}
                    >
                      <span className="w-1/2" style={{ background: p.palette.bg }} />
                      <span className="w-1/2" style={{ background: p.palette.accent }} />
                    </span>
                    <span className="text-sm font-medium text-text">{p.name}</span>
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(exportTheme(p.name, p.palette));
                      toast("Код темы скопирован", "success");
                    }}
                    title="Скопировать код темы"
                    className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:text-accent"
                  >
                    <i className="fa-solid fa-share-nodes text-[11px]" />
                  </button>
                  <button
                    onClick={() => deleteSaved(p.id)}
                    title="Удалить тему"
                    className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:text-[#ef4444]"
                  >
                    <i className="fa-solid fa-xmark text-xs" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {}
        <Card>
          <Field
            label="Поделиться темой"
            hint="Код можно отправить другу — он вставит его сюда и получит ровно эти цвета."
            column
          >
            <div className="flex items-center gap-2">
              <input
                className={`${inputCls} font-mono text-[11px]`}
                value={shareCode}
                spellCheck={false}
                placeholder="aciron-theme-1:…"
                onChange={(e) => setShareCode(e.target.value)}
              />
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(
                    exportTheme(presetName.trim() || "Тема", palette)
                  );
                  toast("Код текущей темы скопирован", "success");
                }}
                title="Скопировать код текущей темы"
                className={iconBtnCls}
              >
                <i className="fa-solid fa-copy text-xs" />
              </button>
              <button
                onClick={() => {
                  const parsed = importTheme(shareCode);
                  if (!parsed) {
                    toast("Код темы не распознан", "error");
                    return;
                  }
                  savePreset(parsed.name, parsed.palette);
                  applySaved({ id: "tmp", name: parsed.name, palette: parsed.palette });
                  setShareCode("");
                  toast(`Тема «${parsed.name}» добавлена`, "success");
                }}
                disabled={!shareCode.trim()}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-40"
              >
                <i className="fa-solid fa-file-import text-xs" />
                Применить
              </button>
            </div>
          </Field>
        </Card>
    </>
  );
}
