import { fillBg, lightMode, rand, type Scene } from "./types";

type Cell = { x: number; y: number; phase: number };

const R = 34;
const SQRT3 = Math.sqrt(3);

const REACH = 170;

export function makeHex(): Scene {
  let cells: Cell[] = [];
  let time = 0;

  const build = (w: number, h: number) => {
    cells = [];

    const dx = R * 1.5;
    const dy = R * SQRT3;
    for (let i = -1; i * dx < w + dx; i++) {
      for (let j = -1; j * dy < h + dy; j++) {
        cells.push({
          x: i * dx,
          y: j * dy + (i % 2 ? dy / 2 : 0),
          phase: rand(0, Math.PI * 2),
        });
      }
    }
  };

  const path = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  return {
    resize: build,

    frame(ctx, dt, w, h, paint, pointer) {
      time += dt;
      fillBg(ctx, w, h, paint);
      if (cells.length === 0) build(w, h);

      const s1x = w * (0.5 + 0.42 * Math.sin(time * 0.19));
      const s1y = h * (0.5 + 0.38 * Math.cos(time * 0.13));
      const s2x = w * (0.5 + 0.45 * Math.cos(time * 0.11 + 2));
      const s2y = h * (0.5 + 0.4 * Math.sin(time * 0.17 + 1));

      ctx.save();
      const k = lightMode(ctx, paint);
      ctx.lineWidth = 1;

      for (const c of cells) {
        const d1 = Math.hypot(c.x - s1x, c.y - s1y);
        const d2 = Math.hypot(c.x - s2x, c.y - s2y);

        let lit =
          Math.max(0, Math.sin(time * 1.5 - d1 * 0.014 + c.phase * 0.15)) ** 3 * 0.6 +
          Math.max(0, Math.sin(time * 1.1 - d2 * 0.011)) ** 3 * 0.4;

        if (pointer.inside) {
          const dp = Math.hypot(c.x - pointer.x, c.y - pointer.y);
          if (dp < REACH) lit += (1 - dp / REACH) ** 2 * 1.4;
        }

        const rgb = paint.accents[0];

        ctx.strokeStyle = `rgba(${rgb},${(0.03 + lit * 0.14) * k})`;
        path(ctx, c.x, c.y, R * 0.92);
        ctx.stroke();

        if (lit > 0.04) {
          ctx.fillStyle = `rgba(${rgb},${Math.min(0.18, lit * 0.1) * k})`;
          ctx.fill();
        }
      }
      ctx.restore();

      const edge = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.25,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7
      );
      edge.addColorStop(0, `rgba(${paint.bgRgb},0)`);
      edge.addColorStop(1, `rgba(${paint.bgRgb},0.85)`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    },
  };
}
