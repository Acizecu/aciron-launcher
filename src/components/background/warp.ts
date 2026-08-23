import { fillBg, lightMode, rand, softLight, type Scene } from "./types";

type Star = {
  angle: number;

  r: number;
  speed: number;
  size: number;
  ci: number;
};

const COUNT = 130;

const BORN = 0.02;

const BLUR_FROM = 0.7;

const SHARP: [number, number][] = [[1, 1]];
const SOFT: [number, number][] = [
  [3.5, 0.16],
  [2, 0.3],
  [1, 0.75],
];

export function makeWarp(): Scene {
  const stars: Star[] = [];
  let far = 0;

  const spawn = (s: Star, atCenter: boolean) => {
    s.angle = rand(0, Math.PI * 2);
    s.r = atCenter ? rand(BORN, 0.14) : rand(BORN, 1);
    s.speed = rand(2.6, 5.2);
    s.size = rand(0.5, 1.6);
    s.ci = Math.random() < 0.35 ? Math.floor(rand(0, 3)) : -1;
  };

  return {
    resize(w, h) {
      far = Math.hypot(w, h) * 0.55;
      if (stars.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const s = {} as Star;
          spawn(s, false);
          stars.push(s);
        }
      }
    },

    frame(ctx, dt, w, h, paint) {
      fillBg(ctx, w, h, paint);
      far = Math.hypot(w, h) * 0.55;
      const cx = w / 2;
      const cy = h / 2;

      for (const s of stars) {
        s.r += s.r * s.speed * dt;
        if (s.r > 1.15) spawn(s, true);
      }

      ctx.save();
      const k = lightMode(ctx, paint);
      softLight(ctx, cx, cy, far * 0.75, paint.glow, 0.06 * k);
      ctx.lineCap = "round";

      for (const s of stars) {
        const cos = Math.cos(s.angle);
        const sin = Math.sin(s.angle);

        const tail = Math.min(s.r * (0.1 + s.speed * 0.05), s.r - BORN);
        const a = Math.min(1, s.r * 3) * 0.2 * k;
        const width = s.size * (0.3 + s.r * 0.7);
        const rgb = s.ci >= 0 ? paint.accents[s.ci] : paint.text;

        const x1 = cx + cos * (s.r - tail) * far;
        const y1 = cy + sin * (s.r - tail) * far;
        const x2 = cx + cos * s.r * far;
        const y2 = cy + sin * s.r * far;

        const layers = s.r > BLUR_FROM ? SOFT : SHARP;
        for (const [wk, ak] of layers) {
          ctx.strokeStyle = `rgba(${rgb},${a * ak})`;
          ctx.lineWidth = width * wk;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";
      ctx.restore();
    },
  };
}
