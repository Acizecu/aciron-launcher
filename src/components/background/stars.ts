import { fillBg, lightMode, rand, softLight, type Scene } from "./types";

type Star = {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  speed: number;
  depth: number;
  warm: boolean;
};
type Shot = { x: number; y: number; vx: number; vy: number; life: number; max: number; len: number };
type Cloud = { x: number; y: number; r: number; ci: number; alpha: number; drift: number };

const COUNT = 170;
const CLOUDS = 4;

export function makeStars(): Scene {
  const stars: Star[] = [];
  const shots: Shot[] = [];
  const clouds: Cloud[] = [];
  let W = 0;
  let H = 0;
  let time = 0;

  let px = 0;
  let py = 0;

  for (let i = 0; i < CLOUDS; i++) {
    clouds.push({
      x: 0.15 + (i % 2) * 0.55 + rand(-0.08, 0.08),
      y: 0.18 + Math.floor(i / 2) * 0.42 + rand(-0.08, 0.08),
      r: rand(0.35, 0.7),
      ci: i % 3,
      alpha: rand(0.035, 0.07),
      drift: rand(0.05, 0.12) * (Math.random() < 0.5 ? -1 : 1),
    });
  }

  const spawn = (s: Star, atTop: boolean) => {

    const depth = rand(0.2, 1);
    s.depth = depth;
    s.x = rand(0, W);
    s.y = atTop ? rand(-H * 0.2, 0) : rand(0, H);
    s.r = 0.5 + depth * 1.5;
    s.vy = 3 + depth * 16;
    s.phase = rand(0, Math.PI * 2);
    s.speed = rand(0.6, 2.2);

    s.warm = Math.random() < 0.2;
  };

  return {
    resize(w, h) {
      W = w;
      H = h;
      if (stars.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const s = {} as Star;
          spawn(s, false);
          stars.push(s);
        }
      }
    },

    frame(ctx, dt, w, h, paint, pointer) {
      time += dt;
      fillBg(ctx, w, h, paint);

      const tx = pointer.inside ? (pointer.x - w / 2) / w : 0;
      const ty = pointer.inside ? (pointer.y - h / 2) / h : 0;
      px += (tx - px) * Math.min(1, dt * 3);
      py += (ty - py) * Math.min(1, dt * 3);

      ctx.save();
      const k = lightMode(ctx, paint);
      for (const c of clouds) {
        softLight(
          ctx,
          c.x * w + Math.sin(time * c.drift) * w * 0.05 - px * 26,
          c.y * h + Math.cos(time * c.drift * 0.8) * h * 0.04 - py * 26,
          c.r * Math.max(w, h) * 0.5,
          paint.accents[c.ci] ?? paint.accents[0],
          c.alpha * k
        );
      }
      ctx.restore();

      for (const s of stars) {
        s.y += s.vy * dt;
        s.phase += s.speed * dt;
        if (s.y > h + 4) spawn(s, true);

        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.phase));
        const rgb = s.warm ? paint.glow : paint.text;
        const a = twinkle * (0.1 + s.r * 0.1);

        const x = s.x - px * 34 * s.depth;
        const y = s.y - py * 34 * s.depth;

        ctx.fillStyle = `rgba(${rgb},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.6) {

          const len = s.r * 4 * twinkle;
          ctx.strokeStyle = `rgba(${rgb},${a * 0.4})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - len, y);
          ctx.lineTo(x + len, y);
          ctx.moveTo(x, y - len);
          ctx.lineTo(x, y + len);
          ctx.stroke();
        }
      }

      if (shots.length < 2 && Math.random() < dt * 0.12) {
        shots.push({
          x: rand(0, w * 0.7),
          y: rand(0, h * 0.4),
          vx: rand(260, 420),
          vy: rand(90, 180),
          life: 0,
          max: rand(0.8, 1.4),
          len: rand(90, 190),
        });
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life += dt;
        const kk = 1 - s.life / s.max;
        if (kk <= 0 || s.x > w + s.len || s.y > h + s.len) {
          shots.splice(i, 1);
          continue;
        }

        const d = Math.hypot(s.vx, s.vy);
        const tailX = s.x - (s.vx / d) * s.len;
        const tailY = s.y - (s.vy / d) * s.len;
        const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
        grad.addColorStop(0, `rgba(${paint.glow},${0.4 * kk})`);
        grad.addColorStop(1, `rgba(${paint.glow},0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.fillStyle = `rgba(${paint.text},${0.45 * kk})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
