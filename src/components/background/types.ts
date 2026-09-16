

export type Paint = {

  bg: string;

  bgRgb: string;

  accents: string[];

  glow: string;

  text: string;

  light: boolean;
};

export type Pointer = {
  x: number;
  y: number;

  inside: boolean;
};

export type Scene = {

  resize(w: number, h: number): void;
  frame(
    ctx: CanvasRenderingContext2D,
    dt: number,
    w: number,
    h: number,
    paint: Paint,
    pointer: Pointer
  ): void;
};

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function rgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

export function fillBg(ctx: CanvasRenderingContext2D, w: number, h: number, paint: Paint) {
  ctx.fillStyle = paint.bg;
  ctx.fillRect(0, 0, w, h);
}

export function glowFromBottom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  glow: string,
  strength = 0.13
) {
  const grad = ctx.createLinearGradient(0, h, 0, h * 0.3);
  grad.addColorStop(0, `rgba(${glow},${strength})`);
  grad.addColorStop(0.5, `rgba(${glow},${strength * 0.38})`);
  grad.addColorStop(1, `rgba(${glow},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export function softLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rgb: string,
  alpha: number
) {
  if (alpha <= 0.001 || r <= 0) return;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.45, `rgba(${rgb},${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function lightMode(ctx: CanvasRenderingContext2D, paint: Paint): number {
  ctx.globalCompositeOperation = paint.light ? "source-over" : "lighter";
  return paint.light ? 1.5 : 1;
}
