import { fillBg, lightMode, rand, softLight, type Scene } from "./types";

type Ember = {
  x: number;
  y: number;
  vy: number;

  phase: number;
  sway: number;
  r: number;
  life: number;
  max: number;
  ci: number;
};

const COUNT = 70;

export function makeEmbers(): Scene {
  const embers: Ember[] = [];
  let W = 0;
  let H = 0;
  let time = 0;

  const spawn = (e: Ember, atBottom: boolean) => {
    e.x = rand(-0.05, 1.05) * W;
    e.y = atBottom ? H + rand(0, H * 0.25) : rand(0, H);
    e.vy = rand(18, 62);
    e.phase = rand(0, Math.PI * 2);
    e.sway = rand(8, 30);
    e.r = rand(0.8, 2.4);
    e.max = rand(4, 9);
    e.life = atBottom ? 0 : rand(0, e.max * 0.6);
    e.ci = Math.floor(rand(0, 3));
  };

  return {
    resize(w, h) {
      W = w;
      H = h;
      if (embers.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const e = {} as Ember;
          spawn(e, false);
          embers.push(e);
        }
      }
    },

    frame(ctx, dt, w, h, paint, pointer) {
      time += dt;
      fillBg(ctx, w, h, paint);

      ctx.save();
      const k = lightMode(ctx, paint);
      softLight(ctx, w * 0.5, h * 1.02, Math.max(w, h) * 0.55, paint.glow, 0.09 * k);

      for (const e of embers) {
        e.life += dt;
        if (e.life > e.max || e.y < -10) {
          spawn(e, true);
          continue;
        }
        e.y -= e.vy * dt;

        const wind = Math.sin(time * 0.35 + e.y * 0.004) * 14;
        e.x += (wind + Math.sin(time * 1.6 + e.phase) * e.sway) * dt;

        if (pointer.inside) {
          const dx = e.x - pointer.x;
          const dy = e.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 150 * 150 && d2 > 1) {
            const dist = Math.sqrt(d2);
            const f = (1 - dist / 150) * 120 * dt;
            e.x += (dx / dist) * f;
            e.y -= f * 0.6;
          }
        }

        const t = e.life / e.max;
        const glow = Math.sin(Math.min(1, t * 1.1) * Math.PI);
        const a = glow * 0.36 * k;
        if (a < 0.01) continue;
        const rgb = paint.accents[e.ci] ?? paint.accents[0];
        softLight(ctx, e.x, e.y, e.r * 5, rgb, a * 0.22);
        ctx.fillStyle = `rgba(${rgb},${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * (0.3 + glow * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
