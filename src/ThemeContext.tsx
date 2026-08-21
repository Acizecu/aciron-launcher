import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t as tr } from "./i18n";

export type Palette = {
  bg: string;
  panel: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  ctrlHover: string;
};

const TOKEN_DEFS: { key: keyof Palette; label: string; hint: string }[] = [
  { key: "bg", label: "Фон окна", hint: "самый нижний слой" },
  { key: "panel", label: "Панели", hint: "боковое меню, нижняя панель" },
  { key: "card", label: "Карточки", hint: "карточки, поля ввода" },
  { key: "border", label: "Границы", hint: "рамки и разделители" },
  { key: "text", label: "Текст", hint: "основной" },
  { key: "muted", label: "Текст тусклый", hint: "подписи и подсказки" },
  { key: "accent", label: "Акцент", hint: "кнопки, иконки, выделение" },
  { key: "accentHover", label: "Акцент: наведение", hint: "" },
  { key: "accentActive", label: "Акцент: нажатие", hint: "" },
  { key: "ctrlHover", label: "Кнопки окна", hint: "заливка при наведении" },
];

export const TOKENS: { key: keyof Palette; label: string; hint: string }[] = TOKEN_DEFS.map(
  (d) => ({
    key: d.key,
    get label() {
      return tr(d.label);
    },
    get hint() {
      return d.hint ? tr(d.hint) : "";
    },
  })
);

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("");
}

export function normalizeHex(input: string): string | null {
  const h = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(h) && !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const [r, g, b] = hexToRgb(h);
  return rgbToHex(r, g, b);
}

function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function contrast(a: string, b: string): number {
  const lin = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lin(a), lin(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export type ThemeSeed = {

  accent: string;

  base: string;

  text?: string;

  muted?: string;
};

export function buildPalette(seed: ThemeSeed): Palette {
  const dark = luminance(seed.base) < 0.5;
  const step = (k: number) => shade(seed.base, dark ? k : -k);
  const text = seed.text ?? (dark ? "#d9d9d9" : "#1b1b1e");
  return {
    bg: seed.base,
    panel: step(0.05),
    card: step(0.09),
    border: step(0.15),
    ctrlHover: step(0.09),
    text,
    muted: seed.muted ?? shade(text, dark ? -0.42 : 0.42),
    accent: seed.accent,
    accentHover: shade(seed.accent, 0.16),
    accentActive: shade(seed.accent, -0.16),
  };
}

export type PresetId =
  | "standard"
  | "amethyst"
  | "ocean"
  | "dracula"
  | "forest"
  | "rose"
  | "carbon"
  | "nord"
  | "sand"
  | "daylight";

export type ThemeId = PresetId | "custom";

export const PRESET_LIST: { id: PresetId; label: string; seed: ThemeSeed }[] = [
  { id: "standard", label: "Aciron", seed: { accent: "#f5a96b", base: "#131315" } },
  { id: "amethyst", label: "Amethyst", seed: { accent: "#a855f7", base: "#141019" } },
  { id: "ocean", label: "Ocean", seed: { accent: "#38bdf8", base: "#0e161d" } },
  { id: "dracula", label: "Dracula", seed: { accent: "#bd93f9", base: "#191a26" } },
  { id: "forest", label: "Forest", seed: { accent: "#4ade80", base: "#101711" } },
  { id: "rose", label: "Rosé", seed: { accent: "#fb7185", base: "#191114" } },
  { id: "carbon", label: "Carbon", seed: { accent: "#9ca3af", base: "#0d0d0e" } },
  { id: "nord", label: "Nord", seed: { accent: "#88c0d0", base: "#2e3440" } },
  { id: "sand", label: "Sand", seed: { accent: "#b4762c", base: "#f2ede4" } },
  { id: "daylight", label: "Daylight", seed: { accent: "#2563eb", base: "#f6f7f9" } },
];

export const PRESETS: Record<PresetId, Palette> = Object.fromEntries(
  PRESET_LIST.map((t) => [t.id, buildPalette(t.seed)])
) as Record<PresetId, Palette>;

export const SURFACE = PRESETS.standard;

export type SavedPreset = { id: string; name: string; palette: Palette };

type ThemeState = {
  id: ThemeId;

  seed: ThemeSeed;

  overrides: Partial<Palette>;
  saved: SavedPreset[];

  activeSavedId: string | null;
};

const STORAGE_KEY = "aciron:theme";

const DEFAULT_STATE: ThemeState = {
  id: "standard",
  seed: { accent: "#6366f1", base: "#131315" },
  overrides: {},
  saved: [],
  activeSavedId: null,
};

export function splitPalette(p: Palette): { seed: ThemeSeed; overrides: Partial<Palette> } {
  const seed: ThemeSeed = { accent: p.accent, base: p.bg, text: p.text, muted: p.muted };
  const derived = buildPalette(seed);
  const overrides: Partial<Palette> = {};
  for (const k of Object.keys(p) as (keyof Palette)[]) {
    if (p[k] !== derived[k]) overrides[k] = p[k];
  }
  return { seed, overrides };
}

export function customPalette(s: ThemeState): Palette {
  return { ...buildPalette(s.seed), ...s.overrides };
}

export function paletteOf(s: ThemeState): Palette {
  return s.id === "custom" ? customPalette(s) : PRESETS[s.id] ?? PRESETS.standard;
}

function load(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const old = JSON.parse(raw) as Partial<ThemeState> & {
      customAccent?: string;
      saved?: (SavedPreset | { id: string; name: string; accent: string })[];
    };

    const seed: ThemeSeed = old.seed ?? {
      accent: old.customAccent || DEFAULT_STATE.seed.accent,
      base: DEFAULT_STATE.seed.base,
    };

    const saved: SavedPreset[] = (old.saved ?? []).map((p) => {
      if ("palette" in p && p.palette) return p as SavedPreset;
      const legacy = p as unknown as { id: string; name: string; accent: string };
      return {
        id: legacy.id,
        name: legacy.name,
        palette: buildPalette({ accent: legacy.accent, base: DEFAULT_STATE.seed.base }),
      };
    });

    const id = ((old.id as string) === "dark" ? "amethyst" : old.id) as ThemeId | undefined;

    const activeSavedId =
      old.activeSavedId && saved.some((p) => p.id === old.activeSavedId)
        ? old.activeSavedId
        : null;

    let overrides = old.overrides ?? {};
    let seedFinal = seed;
    const keys = Object.keys(buildPalette(seed)) as (keyof Palette)[];
    if (keys.every((k) => overrides[k] !== undefined)) {
      const split = splitPalette(overrides as Palette);
      seedFinal = split.seed;
      overrides = split.overrides;
    }

    return {
      id: id && (id === "custom" || id in PRESETS) ? id : DEFAULT_STATE.id,
      seed: seedFinal,
      overrides,
      saved,
      activeSavedId,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function applyPalette(p: Palette) {
  const root = document.documentElement;
  const map: Record<string, string> = {
    "--color-bg": p.bg,
    "--color-panel": p.panel,
    "--color-card": p.card,
    "--color-border": p.border,
    "--color-text": p.text,
    "--color-muted": p.muted,
    "--color-accent": p.accent,
    "--color-accent-hover": p.accentHover,
    "--color-accent-active": p.accentActive,
    "--color-ctrl-hover": p.ctrlHover,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);

  const light = luminance(p.bg) >= 0.5;
  root.style.colorScheme = light ? "light" : "dark";
  root.dataset.scheme = light ? "light" : "dark";
}

const SHARE_PREFIX = "aciron-theme-1:";

export function exportTheme(name: string, palette: Palette): string {
  const json = JSON.stringify({ n: name, p: palette });
  return SHARE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

export function importTheme(code: string): { name: string; palette: Palette } | null {
  try {
    const body = code.trim().replace(new RegExp("^" + SHARE_PREFIX, "i"), "");
    const json = decodeURIComponent(escape(atob(body)));
    const data = JSON.parse(json) as { n?: string; p?: Partial<Palette> };
    if (!data.p) return null;

    const out: Partial<Palette> = {};
    for (const { key } of TOKENS) {
      const v = data.p[key];
      const hex = typeof v === "string" ? normalizeHex(v) : null;
      if (!hex) return null;
      out[key] = hex;
    }
    return { name: (data.n || tr("Тема")).slice(0, 24), palette: out as Palette };
  } catch {
    return null;
  }
}

type Ctx = {
  state: ThemeState;
  palette: Palette;
  saved: SavedPreset[];
  setTheme: (id: ThemeId) => void;

  setSeed: (patch: Partial<ThemeSeed>) => void;

  setToken: (key: keyof Palette, value: string | null) => void;

  resetTokens: () => void;

  savePreset: (name: string, palette?: Palette) => string;
  applySaved: (p: SavedPreset) => void;
  deleteSaved: (id: string) => void;
  renameSaved: (id: string, name: string) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(load);

  const palette = useMemo(() => paletteOf(state), [state]);

  useEffect(() => {
    applyPalette(palette);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [palette, state]);

  const setTheme = useCallback(
    (id: ThemeId) => setState((s) => ({ ...s, id, activeSavedId: null })),
    []
  );

  const setSeed = useCallback(
    (patch: Partial<ThemeSeed>) =>
      setState((s) => ({
        ...s,
        id: "custom",
        seed: { ...s.seed, ...patch },
        activeSavedId: null,
      })),
    []
  );

  const setToken = useCallback((key: keyof Palette, val: string | null) => {
    setState((s) => {
      const overrides = { ...s.overrides };
      if (val === null) delete overrides[key];
      else overrides[key] = val;
      return { ...s, id: "custom", overrides, activeSavedId: null };
    });
  }, []);

  const resetTokens = useCallback(
    () => setState((s) => ({ ...s, overrides: {}, activeSavedId: null })),
    []
  );

  const savePreset = useCallback((name: string, pal?: Palette) => {
    const id = String(Date.now());
    setState((s) => ({
      ...s,
      saved: [
        ...s.saved,
        {
          id,
          name: name.trim().slice(0, 24) || tr("Без названия"),
          palette: pal ?? paletteOf(s),
        },
      ],

      activeSavedId: pal ? s.activeSavedId : id,
    }));
    return id;
  }, []);

  const applySaved = useCallback(
    (p: SavedPreset) =>
      setState((s) => {
        const { seed, overrides } = splitPalette(p.palette);
        return { ...s, id: "custom", seed, overrides, activeSavedId: p.id };
      }),
    []
  );

  const deleteSaved = useCallback(
    (id: string) =>
      setState((s) => ({
        ...s,
        saved: s.saved.filter((p) => p.id !== id),

        activeSavedId: s.activeSavedId === id ? null : s.activeSavedId,
      })),
    []
  );

  const renameSaved = useCallback(
    (id: string, name: string) =>
      setState((s) => ({
        ...s,
        saved: s.saved.map((p) =>
          p.id === id ? { ...p, name: name.trim().slice(0, 24) || p.name } : p
        ),
      })),
    []
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      palette,
      saved: state.saved,
      setTheme,
      setSeed,
      setToken,
      resetTokens,
      savePreset,
      applySaved,
      deleteSaved,
      renameSaved,
    }),
    [
      state,
      palette,
      setTheme,
      setSeed,
      setToken,
      resetTokens,
      savePreset,
      applySaved,
      deleteSaved,
      renameSaved,
    ]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}

export function initThemeEarly() {
  applyPalette(paletteOf(load()));
}
