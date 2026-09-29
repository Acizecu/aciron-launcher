

export type CapeAnimation = {
  sheetUrl: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;

  mode?: string | null;

  order?: string | null;
};

export function frameAt(anim: Pick<CapeAnimation, "frames" | "fps" | "mode" | "order">, t: number): number {
  const sequence = anim.order
    ? anim.order
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < anim.frames)
    : [];
  const n = sequence.length || anim.frames;
  if (n <= 1) return sequence[0] ?? 0;
  const step = Math.floor(Math.max(0, t) * Math.max(1, anim.fps));
  let i: number;
  switch ((anim.mode || "LOOP").toUpperCase()) {
    case "ONCE":
      i = Math.min(step, n - 1);
      break;
    case "PINGPONG": {
      const period = 2 * n - 2;
      const k = step % period;
      i = k < n ? k : period - k;
      break;
    }
    default:
      i = step % n;
  }
  return sequence.length ? sequence[i] : i;
}

export class SpriteCape {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly columns: number;
  private current = -1;

  constructor(
    private readonly sheet: HTMLImageElement,
    private readonly anim: CapeAnimation
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = anim.frameWidth;
    this.canvas.height = anim.frameHeight;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.columns = Math.max(1, Math.floor(sheet.naturalWidth / anim.frameWidth));
    this.draw(0);
  }

  draw(t: number): boolean {
    const f = frameAt(this.anim, t);
    if (f === this.current) return false;
    this.current = f;
    const sx = (f % this.columns) * this.anim.frameWidth;
    const sy = Math.floor(f / this.columns) * this.anim.frameHeight;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(
      this.sheet,
      sx,
      sy,
      this.anim.frameWidth,
      this.anim.frameHeight,
      0,
      0,
      this.anim.frameWidth,
      this.anim.frameHeight
    );
    return true;
  }
}
