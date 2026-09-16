import clickUrl from "./assets/sounds/ui_click.ogg";
import hoverUrl from "./assets/sounds/ui_hover.ogg";

const VOLUME = { click: 0.35, hover: 0.18 };

const HOVER_THROTTLE = 60;

export type SfxPrefs = { click: boolean; hover: boolean };

const PREFS_KEY = "aciron:sfx";
const DEFAULT_PREFS: SfxPrefs = { click: true, hover: true };

let prefs: SfxPrefs = (() => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {

  }
  return DEFAULT_PREFS;
})();

export function getSfxPrefs(): SfxPrefs {
  return prefs;
}

export function setSfxPrefs(patch: Partial<SfxPrefs>) {
  prefs = { ...prefs, ...patch };
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

const CLICKABLE = "button, a[href], [role='button']";

let ctx: AudioContext | null = null;
let ctxFailed = false;
const buffers = new Map<string, AudioBuffer>();

function audioCtx(): AudioContext | null {
  if (ctx || ctxFailed) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    ctxFailed = true;
  }
  return ctx;
}

async function load(key: string, url: string) {
  const c = audioCtx();
  if (!c || buffers.has(key)) return;
  try {
    const data = await (await fetch(url)).arrayBuffer();
    buffers.set(key, await c.decodeAudioData(data));
  } catch {

  }
}

function play(key: string, volume: number) {
  const c = audioCtx();
  const buf = c && buffers.get(key);
  if (!c || !buf) return;

  if (c.state === "suspended") void c.resume().catch(() => {});
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(c.destination);
  src.start();
}

export function playClick() {
  if (!prefs.click) return;
  play("click", VOLUME.click);
}

export function playHover() {
  if (!prefs.hover) return;
  play("hover", VOLUME.hover);
}

function clickable(target: EventTarget | null): Element | null {
  const el = (target as Element | null)?.closest?.(CLICKABLE) ?? null;
  if (!el) return null;
  if ((el as HTMLButtonElement).disabled) return null;
  if (el.getAttribute("aria-disabled") === "true") return null;
  if (el.closest("[data-no-sound]")) return null;
  return el;
}

export function initUiSounds() {
  void load("click", clickUrl);
  void load("hover", hoverUrl);

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      if (clickable(e.target)) playClick();
    },
    true
  );

  let last: Element | null = null;
  let lastAt = 0;
  document.addEventListener(
    "pointerover",
    (e) => {
      const el = clickable(e.target);
      if (el === last) return;
      last = el;
      if (!el) return;
      const now = performance.now();
      if (now - lastAt < HOVER_THROTTLE) return;
      lastAt = now;
      playHover();
    },
    true
  );
}
