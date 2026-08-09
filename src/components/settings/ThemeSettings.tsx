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
import { Card, iconBtnCls } from "./controls";
import { t as tr } from "../../i18n";

const ghostBtnCls =
  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:text-muted disabled:hover:bg-transparent";

const cardActionCls =
  "grid h-6 w-6 place-items-center rounded-md bg-black/45 text-white/75 backdrop-blur-sm transition-colors hover:text-white";

export const THEME_GRID_CLS = "mx-auto grid w-full max-w-[624px] grid-cols-3 gap-3";

export function ThemeCard({
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
      className={`group flex w-full flex-col gap-2 rounded-[14px] border-1 p-2.5 text-left transition-colors ${
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

function ColorRow({
  label,
  hint,
  value,
  onChange,
  onReset,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;

  onReset?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-3.5 px-4 py-3">
      {}
      <label className="relative h-9 w-9 shrink-0 cursor-pointer" title={tr("Выбрать цвет")}>
        <span
          className="block h-full w-full rounded-full border border-border/70 transition-transform hover:scale-105"
          style={{ background: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
      </div>

      {onReset && (
        <button
          onClick={onReset}
          title={tr("Вернуть автоматический цвет")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-accent"
        >
          <i className="fa-solid fa-rotate-left text-[11px]" />
        </button>
      )}

      <input
        value={draft ?? value.toUpperCase()}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") setDraft(null);
        }}
        className="w-[76px] shrink-0 rounded-md bg-transparent px-1.5 py-1 text-right font-mono text-[11px] uppercase text-muted outline-none transition-colors hover:text-text focus:bg-bg focus:text-text"
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
            {tr("Основной текст на этом фоне читается плохо (контраст {v} при рекомендуемых 4.5).", {
              v: main.toFixed(1),
            })}{" "}
          </>
        )}
        {dim < 3 && (
          <>{tr("Тусклый текст почти не виден (контраст {v}).", { v: dim.toFixed(1) })} </>
        )}
        {tr("Помогает сделать фон темнее или текст светлее.")}
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

  const pal = useMemo(() => customPalette(theme), [theme]);

  const activeSaved = theme.id === "custom" ? theme.activeSavedId : null;

  return (
    <>
        <h2 className="text-lg font-bold text-text">{tr("Тема оформления")}</h2>
        <div className={THEME_GRID_CLS}>
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
            label={tr("Своя тема")}
            palette={pal}
            active={theme.id === "custom" && !activeSaved}
            onClick={() => setTheme("custom")}
          />
          {}
          {themePresets.map((p) => (
            <div key={p.id} className="group relative">
              <ThemeCard
                label={p.name}
                palette={p.palette}
                active={activeSaved === p.id}
                onClick={() => applySaved(p)}
              />
              {}
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(exportTheme(p.name, p.palette));
                    toast(tr("Код темы скопирован"), "success");
                  }}
                  title={tr("Скопировать код темы")}
                  className={cardActionCls}
                >
                  <i className="fa-solid fa-share-nodes text-[10px]" />
                </button>
                <button
                  onClick={() => deleteSaved(p.id)}
                  title={tr("Удалить тему")}
                  className={`${cardActionCls} hover:text-[#fca5a5]`}
                >
                  <i className="fa-solid fa-xmark text-[11px]" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {theme.id === "custom" && (
          <>
            {}
            <Card>
              <ColorRow
                label={tr("Акцент")}
                hint={tr("Кнопки, иконки, выделение. Оттенки для наведения и нажатия считаются сами.")}
                value={theme.seed.accent}
                onChange={(v) => setSeed({ accent: v })}
              />
              <ColorRow
                label={tr("Фон")}
                hint={tr("Панели, карточки и границы выводятся из него ступенями. Светлый фон делает тему светлой.")}
                value={theme.seed.base}
                onChange={(v) => setSeed({ base: v })}
              />
              <ColorRow
                label={tr("Текст")}
                hint={tr("По умолчанию подбирается под яркость фона.")}
                value={pal.text}
                onChange={(v) => setSeed({ text: v })}
              />
            </Card>

            <ContrastNotice palette={pal} />

            {}
            <Card>
              <button
                onClick={() => setTokensOpen((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text">{tr("Отдельные цвета")}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">
                    {Object.keys(theme.overrides).length > 0
                      ? tr("Изменено вручную: {n}", { n: Object.keys(theme.overrides).length })
                      : tr("Все цвета собираются автоматически")}
                  </div>
                </div>
                <i
                  className={`fa-solid fa-chevron-down text-xs text-muted transition-transform ${
                    tokensOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {tokensOpen && (
                <div className="divide-y divide-border/40">
                  {TOKENS.map((t) => (
                    <ColorRow
                      key={t.key}
                      label={tr(t.label)}
                      hint={t.hint ? tr(t.hint) : undefined}
                      value={pal[t.key]}
                      onChange={(v) => setToken(t.key, v)}
                      onReset={t.key in theme.overrides ? () => setToken(t.key, null) : undefined}
                    />
                  ))}
                  {Object.keys(theme.overrides).length > 0 && (
                    <div className="px-4 py-2.5">
                      <button
                        onClick={resetTokens}
                        className="text-[11px] text-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
                      >
                        {tr("Сбросить все ручные правки")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </>
        )}

        {}
        <Card>
          {}
          <div className="flex items-center gap-2 px-4 py-2">
            <input
              className="w-full bg-transparent py-1.5 text-sm text-text outline-none placeholder:text-muted/60"
              value={presetName}
              maxLength={24}
              placeholder={tr("Название темы")}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) {
                  savePreset(presetName);
                  setPresetName("");
                  toast(tr("Тема сохранена"), "success");
                }
              }}
            />
            <button
              onClick={() => {
                if (!presetName.trim()) return;
                savePreset(presetName);
                setPresetName("");
                toast(tr("Тема сохранена"), "success");
              }}
              disabled={!presetName.trim()}
              className={ghostBtnCls}
            >
              <i className="fa-solid fa-floppy-disk text-xs" />
              {tr("Сохранить")}
            </button>
          </div>
        </Card>

        {}
        {}
        <Card>
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text">{tr("Поделиться темой")}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted">
                {tr("Код можно отправить другу — он вставит его сюда и получит ровно эти цвета.")}
              </div>
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(
                  exportTheme(presetName.trim() || tr("Тема"), palette)
                );
                toast(tr("Код текущей темы скопирован"), "success");
              }}
              title={tr("Скопировать код текущей темы")}
              className={iconBtnCls}
            >
              <i className="fa-solid fa-copy text-xs" />
            </button>
          </div>
          <div className="flex items-center gap-2 px-4 py-2">
            <input
              className="w-full bg-transparent py-1.5 font-mono text-[11px] text-text outline-none placeholder:text-muted/60"
              value={shareCode}
              spellCheck={false}
              placeholder="aciron-theme-1:…"
              onChange={(e) => setShareCode(e.target.value)}
            />
            <button
              onClick={() => {
                const parsed = importTheme(shareCode);
                if (!parsed) {
                  toast(tr("Код темы не распознан"), "error");
                  return;
                }
                savePreset(parsed.name, parsed.palette);
                applySaved({ id: "tmp", name: parsed.name, palette: parsed.palette });
                setShareCode("");
                toast(tr("Тема «{name}» добавлена", { name: parsed.name }), "success");
              }}
              disabled={!shareCode.trim()}
              className={ghostBtnCls}
            >
              <i className="fa-solid fa-file-import text-xs" />
              {tr("Применить")}
            </button>
          </div>
        </Card>
    </>
  );
}
