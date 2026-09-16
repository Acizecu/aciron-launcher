import { rand, type Scene } from "./types";

type Band = {

  level: number;
  amp: number;

  thick: number;

  len1: number;
  len2: number;
  len3: number;
  speed: number;
  alpha: number;
  ci: number;
  phase: number;
};

const BANDS = 7;

const STEP = 12;

export function makeWaves(): Scene {
  let time = 0;
  const bands: Band[] = [];

  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    bands.push({
      level: 0.22 + t * 0.6,
      amp: rand(0.03, 0.075),
      thick: rand(0.012, 0.05),
      len1: rand(0.8, 1.4),
      len2: rand(0.28, 0.5),
      len3: rand(0.12, 0.2),

      speed: rand(0.08, 0.26) * (i % 2 ? -1 : 1),
      alpha: rand(0.035, 0.085),
      ci: i % 3,
      phase: rand(0, Math.PI * 2),
    });
  }

  return {
    resize() {

    },

    frame(ctx, dt, w, h, paint) {
      time += dt;
      ctx.fillStyle = paint.bg;
      ctx.fillRect(0, 0, w, h);

      for (const b of bands) {
        const t = time * b.speed * 60;
        const k1 = (Math.PI * 2) / (w * b.len1);
        const k2 = (Math.PI * 2) / (w * b.len2);
        const k3 = (Math.PI * 2) / (w * b.len3);
        const amp = h * b.amp;
        const half = h * b.thick * 0.5;

        const pts: number[] = [];
        for (let x = 0; x <= w + STEP; x += STEP) {
          pts.push(
            h * b.level +
              Math.sin((x + t) * k1 + b.phase) * amp +
              Math.sin((x - t * 1.7) * k2 + b.phase * 2) * amp * 0.4 +
              Math.sin((x + t * 2.4) * k3 + b.phase * 3) * amp * 0.16
          );
        }

        ctx.beginPath();
        pts.forEach((y, i) => {
          const x = i * STEP;
          const th = half * (0.55 + 0.45 * Math.sin(x * k2 * 0.7 + time * 0.5 + b.phase));
          if (i === 0) ctx.moveTo(x, y - th);
          else ctx.lineTo(x, y - th);
        });
        for (let i = pts.length - 1; i >= 0; i--) {
          const x = i * STEP;
          const th = half * (0.55 + 0.45 * Math.sin(x * k2 * 0.7 + time * 0.5 + b.phase));
          ctx.lineTo(x, pts[i] + th);
        }
        ctx.closePath();

        const rgb = paint.accents[b.ci] ?? paint.accents[0];

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(0.5, `rgba(${rgb},${b.alpha})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        pts.forEach((y, i) => (i ? ctx.lineTo(i * STEP, y) : ctx.moveTo(0, y)));
        ctx.strokeStyle = `rgba(${rgb},${b.alpha * 1.35})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
  };
}
