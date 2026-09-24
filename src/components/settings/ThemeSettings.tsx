import { useMemo, useState } from "react";
import {
  useTheme,
  backgroundOf,
  PRESET_LIST,
  PRESETS,
  TOKENS,
  contrast,
  customPalette,
  exportTheme,
  importTheme,
  type Palette,
} from "../../ThemeContext";
import { BACKGROUNDS, type BackgroundId } from "../background/scenes";
import { useToast } from "../../ToastContext";
import { Card, Field, iconBtnCls, inputCls, Toggle } from "./controls";
import ColorPicker from "./ColorPicker";
import { AnchoredPanel, useAnchor } from "../AnchoredPanel";
import { t as tr } from "../../i18n";
import Icon from "../Icon";

function bgLabel(id: BackgroundId): string {
  switch (id) {
    case "aurora":
      return tr("Сияние");
    case "stars":
      return tr("Звёзды");
    case "waves":
      return tr("Волны");
    case "constellation":
      return tr("Созвездия");
    case "embers":
      return tr("Искры");
    case "rain":
      return tr("Дождь");
    case "hex":
      return tr("Соты");
    case "warp":
      return tr("Гиперпрыжок");
    case "glow":
      return tr("Свечение");
    default:
      return tr("Кубики");
  }
}

const cardActionCls =
  "grid h-6 w-6 place-items-center rounded-[10px] bg-black/45 text-white/75 backdrop-blur-sm transition-colors hover:text-white";

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
        active ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:border-line-strong"
      }`}
    >
      <div
        className="relative flex h-14 w-full items-center gap-2 overflow-hidden rounded-[10px] border px-2.5"
        style={{ background: palette.bg, borderColor: palette.border }}
      >
        <span className="h-8 w-8 shrink-0 rounded-[10px]" style={{ background: palette.accent }} />
        <span className="flex-1 space-y-1.5">
          <span className="block h-2 w-full rounded-full" style={{ background: palette.text }} />
          <span className="block h-2 w-2/3 rounded-full" style={{ background: palette.muted }} />
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[12.5px] font-medium ${active ? "text-accent" : "text-text"}`}>{label}</span>
        {active && <Icon cls="fa-solid fa-circle-check text-[12.5px] text-accent" />}
      </div>
    </button>
  );
}

function BackgroundPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: BackgroundId) => void;
}) {
  const btn = useAnchor();
  const cur = BACKGROUNDS.find((b) => b.id === value) ?? BACKGROUNDS[0];

  return (
    <>
      <button
        ref={btn.ref}
        onClick={btn.toggle}
        className={`flex h-10 w-full items-center gap-2.5 rounded-[14px] border px-3 text-sm text-text transition-colors ${
          btn.open ? "border-accent/60 bg-white/[0.04]" : "border-line bg-white/[0.03] hover:border-line-strong hover:bg-white/[0.05]"
        }`}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] bg-bg text-accent">
          <Icon cls={`${cur.icon} text-[12px]`} />
        </span>
        <span className="flex-1 truncate text-left">{bgLabel(cur.id as BackgroundId)}</span>
        <Icon
          cls={`fa-solid fa-chevron-down text-[11.5px] text-muted transition-transform ${
            btn.open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnchoredPanel
        anchor={btn.ref}
        open={btn.open}
        onClose={btn.close}
        height={330}
        className="rounded-[18px] bg-popover p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <div className="grid grid-cols-3 gap-3">
          {BACKGROUNDS.map((b, i) => {
            const on = b.id === value;
            return (
              <button
                key={b.id}
                onClick={() => {
                  onChange(b.id as BackgroundId);
                  btn.close();
                }}
                style={{ ["--i" as string]: Math.min(i, 9) }}
                className={`dropdown-item-in group flex w-full flex-col gap-2 rounded-[14px] border-1 p-2.5 text-left transition-colors ${
                  on ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:border-line-strong"
                }`}
              >
                {}
                <div className="relative h-14 w-full overflow-hidden rounded-[10px] border border-line bg-bg">
                  <Icon
                    cls={`${b.icon} pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 text-[56px] leading-none opacity-[0.14]`}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`truncate text-[12.5px] font-medium ${on ? "text-accent" : "text-text"}`}>
                    {bgLabel(b.id as BackgroundId)}
                  </span>
                  {on && <Icon cls="fa-solid fa-circle-check text-[12.5px] text-accent" />}
                </div>
              </button>
            );
          })}
        </div>
      </AnchoredPanel>
    </>
  );
}

function ContrastNotice({ palette }: { palette: Palette }) {
  const main = contrast(palette.text, palette.bg);
  const dim = contrast(palette.muted, palette.bg);
  if (main >= 4.5 && dim >= 3) return null;
  const bad = main < 3 || dim < 2;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[12.5px] leading-relaxed ${
        bad ? "bg-danger/10 text-danger" : "bg-white/[0.04] text-muted"
      }`}
    >
      <Icon cls="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
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

export default function ThemeSettings({
  anim,
  onAnim,
}: {

  anim: boolean;
  onAnim: (v: boolean) => void;
}) {
  const {
    state: theme,
    palette,
    setTheme,
    setSeed,
    setToken,
    resetTokens,
    setBackground,
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

  const bg = backgroundOf(theme);

  return (
    <>
        <h2 className="text-lg font-semibold text-text">{tr("Тема оформления")}</h2>
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
                    void navigator.clipboard.writeText(exportTheme(p.name, p.palette, p.background));
                    toast(tr("Код темы скопирован"), "success");
                  }}
                  title={tr("Скопировать код темы")}
                  className={cardActionCls}
                >
                  <Icon cls="fa-solid fa-share-nodes text-[11.5px]" />
                </button>
                <button
                  onClick={() => deleteSaved(p.id)}
                  title={tr("Удалить тему")}
                  className={`${cardActionCls} hover:text-danger`}
                >
                  <Icon cls="fa-solid fa-xmark text-[12px]" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {}
        <Card>
          <Field
            label={tr("Анимация фона")}
            hint={tr("Фон двигается за интерфейсом. На слабом компьютере лучше выключить.")}
          >
            <Toggle value={anim} onChange={onAnim} />
          </Field>
          <Field
            label={tr("Живой фон")}
            hint={tr("Каждая тема приходит со своим. Выбранный здесь сохраняется вместе с темой и уезжает в её код.")}
            column
          >
            <BackgroundPicker value={bg} onChange={setBackground} />
          </Field>
        </Card>

        {theme.id === "custom" && (
          <>
            {}
            <Card>
              <Field
                label={tr("Акцент")}
                hint={tr("Кнопки, иконки, выделение. Оттенки для наведения и нажатия считаются сами.")}
              >
                <ColorPicker
                  value={theme.seed.accent}
                  onChange={(v) => setSeed({ accent: v })}
                />
              </Field>
              <Field
                label={tr("Фон")}
                hint={tr("Панели, карточки и границы выводятся из него ступенями. Светлый фон делает тему светлой.")}
              >
                <ColorPicker value={theme.seed.base} onChange={(v) => setSeed({ base: v })} />
              </Field>
              <Field
                label={tr("Текст")}
                hint={tr("По умолчанию подбирается под яркость фона.")}
              >
                <ColorPicker
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
                  <div className="text-sm font-medium text-text">{tr("Отдельные цвета")}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-muted">
                    {Object.keys(theme.overrides).length > 0
                      ? tr("Изменено вручную: {n}", { n: Object.keys(theme.overrides).length })
                      : tr("Все цвета собираются автоматически")}
                  </div>
                </div>
                <Icon
                  cls={`fa-solid fa-chevron-down text-[12.5px] text-muted transition-transform ${
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
                          <div className="text-[13px] text-text">{tr(t.label)}</div>
                          {t.hint && (
                            <div className="text-[12px] text-muted">{tr(t.hint)}</div>
                          )}
                        </div>
                        {overridden && (
                          <button
                            onClick={() => setToken(t.key, null)}
                            title={tr("Вернуть автоматический цвет")}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:text-accent"
                          >
                            <Icon cls="fa-solid fa-rotate-left text-[12px]" />
                          </button>
                        )}
                        <ColorPicker
                          value={pal[t.key]}
                          onChange={(v) => setToken(t.key, v)}
                        />
                      </div>
                    );
                  })}
                  {Object.keys(theme.overrides).length > 0 && (
                    <button
                      onClick={resetTokens}
                      className="mt-1 text-[12px] text-muted underline-offset-2 transition-colors hover:text-accent hover:underline"
                    >
                      {tr("Сбросить все ручные правки")}
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
              className="btn-accent flex shrink-0 items-center gap-2 rounded-[12px] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              <Icon cls="fa-solid fa-floppy-disk" />
              {tr("Сохранить")}
            </button>
          </div>
        </Card>

        {}
        <Card>
          <Field
            label={tr("Поделиться темой")}
            hint={tr("Код можно отправить другу — он вставит его сюда и получит ровно эти цвета.")}
            column
          >
            <div className="flex items-center gap-2">
              <input
                className={`${inputCls} font-mono text-[12px]`}
                value={shareCode}
                spellCheck={false}
                placeholder="aciron-theme-1:…"
                onChange={(e) => setShareCode(e.target.value)}
              />
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(
                    exportTheme(presetName.trim() || tr("Тема"), palette, bg)
                  );
                  toast(tr("Код текущей темы скопирован"), "success");
                }}
                title={tr("Скопировать код текущей темы")}
                className={iconBtnCls}
              >
                <Icon cls="fa-solid fa-copy text-[12.5px]" />
              </button>
              <button
                onClick={() => {
                  const parsed = importTheme(shareCode);
                  if (!parsed) {
                    toast(tr("Код темы не распознан"), "error");
                    return;
                  }

                  const id = savePreset(parsed.name, parsed.palette, parsed.background);
                  applySaved({
                    id,
                    name: parsed.name,
                    palette: parsed.palette,
                    background: parsed.background,
                  });
                  setShareCode("");
                  toast(tr("Тема «{name}» добавлена", { name: parsed.name }), "success");
                }}
                disabled={!shareCode.trim()}
                className="flex shrink-0 items-center gap-2 rounded-[12px] border border-line bg-white/[0.04] px-3 py-2.5 text-sm font-medium text-text transition-colors hover:border-line-strong hover:text-accent disabled:opacity-40"
              >
                <Icon cls="fa-solid fa-file-import text-[12.5px]" />
                {tr("Применить")}
              </button>
            </div>
          </Field>
        </Card>
    </>
  );
}
