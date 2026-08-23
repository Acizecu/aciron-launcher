import { lightMode, rand, softLight, type Scene } from "./types";

type Curtain = {

  level: number;
  amp: number;

  height: number;
  len1: number;
  len2: number;
  speed: number;
  alpha: number;
  ci: number;
  phase: number;
};

type Star = { x: number; y: number; r: number; phase: number; speed: number };

const CURTAINS = 3;
const STARS = 90;

const STEP = 16;
const STRIA = 7;

export function makeAurora(): Scene {
  const curtains: Curtain[] = [];
  const stars: Star[] = [];
  let time = 0;
  let W = 0;
  let H = 0;

  for (let i = 0; i < CURTAINS; i++) {
    curtains.push({
      level: 0.34 + i * 0.13 + rand(-0.03, 0.03),
      amp: rand(0.04, 0.09),
      height: rand(0.24, 0.4),
      len1: rand(0.7, 1.3),
      len2: rand(0.25, 0.45),
      speed: rand(0.05, 0.14) * (i % 2 ? -1 : 1),
      alpha: rand(0.045, 0.085),
      ci: i % 3,
      phase: rand(0, Math.PI * 2),
    });
  }

  const reseed = (w: number, h: number) => {
    W = w;
    H = h;
    stars.length = 0;
    for (let i = 0; i < STARS; i++) {
      stars.push({
        x: rand(0, w),

        y: rand(0, h * 0.6),
        r: rand(0.4, 1.3),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.5, 1.8),
      });
    }
  };

  return {
    resize: reseed,

    frame(ctx, dt, w, h, paint) {
      time += dt;
      if (w !== W || h !== H) reseed(w, h);

      ctx.fillStyle = paint.bg;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.phase += s.speed * dt;
        const a = (0.07 + 0.14 * (0.5 + 0.5 * Math.sin(s.phase))) * (paint.light ? 0.5 : 1);
        ctx.fillStyle = `rgba(${paint.text},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      const k = lightMode(ctx, paint);

      for (const c of curtains) {
        const t = time * c.speed * 60;
        const k1 = (Math.PI * 2) / (w * c.len1);
        const k2 = (Math.PI * 2) / (w * c.len2);
        const amp = h * c.amp;
        const rgb = paint.accents[c.ci] ?? paint.accents[0];

        const hem: number[] = [];
        const tall: number[] = [];
        for (let x = 0; x <= w + STEP; x += STEP) {
          hem.push(
            h * c.level +
              Math.sin((x + t) * k1 + c.phase) * amp +
              Math.sin((x - t * 1.6) * k2 + c.phase * 2) * amp * 0.4
          );
          tall.push(
            h * c.height * (0.55 + 0.45 * Math.sin(x * k2 * 0.8 + time * 0.4 + c.phase * 1.5))
          );
        }
        const at = (x: number, arr: number[]) => arr[Math.min(arr.length - 1, Math.round(x / STEP))];

        ctx.save();
        ctx.beginPath();
        hem.forEach((y, i) => (i ? ctx.lineTo(i * STEP, y) : ctx.moveTo(0, y)));
        for (let i = hem.length - 1; i >= 0; i--) ctx.lineTo(i * STEP, hem[i] - tall[i]);
        ctx.closePath();
        ctx.clip();

        const top = Math.min(...hem.map((y, i) => y - tall[i]));
        const bottom = Math.max(...hem);
        const grad = ctx.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(0.55, `rgba(${rgb},${c.alpha * k * 0.55})`);
        grad.addColorStop(1, `rgba(${rgb},${c.alpha * k})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, top, w, bottom - top);

        for (let x = 0; x <= w; x += STRIA) {
          const n =
            Math.sin(x * 0.021 + time * 0.7 + c.phase) * 0.5 +
            Math.sin(x * 0.053 - time * 0.4) * 0.3 +
            Math.sin(x * 0.011 + time * 0.15) * 0.2;
          const a = Math.max(0, n) * c.alpha * k * 0.5;
          if (a < 0.004) continue;
          ctx.fillStyle = `rgba(${rgb},${a})`;
          const y = at(x, hem);
          ctx.fillRect(x, y - at(x, tall), STRIA * 0.55, at(x, tall));
        }

        ctx.strokeStyle = `rgba(${rgb},${c.alpha * k * 1.3})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        hem.forEach((y, i) => (i ? ctx.lineTo(i * STEP, y) : ctx.moveTo(0, y)));
        ctx.stroke();
        ctx.restore();
      }

      softLight(ctx, w * 0.5, h * 1.05, Math.max(w, h) * 0.6, paint.glow, 0.07 * k);
      ctx.restore();
    },
  };
}
