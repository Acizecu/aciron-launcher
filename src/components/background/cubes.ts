import { fillBg, glowFromBottom, rand, type Scene } from "./types";

type Cube = {
  x: number;
  y: number;
  base: number;
  vy: number;
  rot: number;
  vrot: number;
  ci: number;
  depth: number;
  sway: number;
  swayAmp: number;
};

type Spark = { x: number; y: number; vy: number; life: number; max: number };

const COUNT = 34;

export function makeCubes(): Scene {
  const cubes: Cube[] = [];
  const sparks: Spark[] = [];
  let W = 0;
  let H = 0;

  const spawn = (c: Cube, atBottom: boolean) => {
    c.depth = rand(0.25, 1);
    c.base = rand(14, 58) * (0.5 + c.depth * 0.6);
    c.x = rand(0, W);
    c.y = atBottom ? H + rand(0, H * 0.4) : rand(0, H);
    c.vy = rand(8, 30) * (0.4 + c.depth);
    c.rot = rand(0, Math.PI);
    c.vrot = rand(-0.25, 0.25);
    c.ci = Math.floor(rand(0, 3));
    c.sway = rand(0, Math.PI * 2);
    c.swayAmp = rand(6, 26) * c.depth;
  };

  const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + s, y, x + s, y + s, r);
    ctx.arcTo(x + s, y + s, x, y + s, r);
    ctx.arcTo(x, y + s, x, y, r);
    ctx.arcTo(x, y, x + s, y, r);
    ctx.closePath();
  };

  return {
    resize(w, h) {
      W = w;
      H = h;
      if (cubes.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const c = {} as Cube;
          spawn(c, false);
          cubes.push(c);
        }
      }
    },

    frame(ctx, dt, w, h, paint) {
      fillBg(ctx, w, h, paint);
      glowFromBottom(ctx, w, h, paint.glow);

      for (const c of cubes) {
        c.y -= c.vy * dt;
        c.rot += c.vrot * dt;
        c.sway += dt * 0.6;

        const prog = Math.max(0, Math.min(1, c.y / h));
        const size = c.base * (0.3 + 0.7 * prog);
        const alpha = prog * prog * 0.16 * (0.35 + c.depth * 0.65);
        if (alpha > 0.002) {
          const rgb = paint.accents[c.ci] ?? paint.accents[0];
          ctx.save();
          ctx.translate(c.x + Math.sin(c.sway) * c.swayAmp, c.y);
          ctx.rotate(c.rot);

          ctx.shadowColor = `rgba(${rgb},${alpha})`;
          ctx.shadowBlur = size * 0.5;
          ctx.fillStyle = `rgba(${rgb},${alpha})`;
          rr(ctx, -size / 2, -size / 2, size, size * 0.22);
          ctx.fill();

          if (c.depth > 0.7) {
            ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
            rr(ctx, -size / 2 + size * 0.14, -size / 2 + size * 0.14, size * 0.26, size * 0.1);
            ctx.fill();
          }
          ctx.restore();
        }
        if (c.y < -c.base) spawn(c, true);
      }

      if (sparks.length < 14 && Math.random() < dt * 2.2) {
        sparks.push({ x: rand(0, w), y: h + 10, vy: rand(40, 90), life: 0, max: rand(2.5, 5) });
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.y -= s.vy * dt;
        s.life += dt;
        const k = 1 - s.life / s.max;
        if (k <= 0 || s.y < -10) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(${paint.glow},${0.5 * k})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
