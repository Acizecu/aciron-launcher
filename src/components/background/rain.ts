import { rand, type Scene } from "./types";

type Streak = { x: number; y: number; len: number; speed: number; a: number; near: boolean };

const COUNT = 110;

const SLANT = 0.2;

const REACH = 200;

export function makeRain(): Scene {
  const streaks: Streak[] = [];
  let W = 0;
  let H = 0;

  const spawn = (s: Streak, atTop: boolean) => {
    const depth = rand(0.15, 1);
    s.x = rand(-0.1, 1.1) * W;
    s.y = atTop ? rand(-H * 0.3, 0) : rand(0, H);
    s.len = 12 + depth * 44;
    s.speed = 340 + depth * 820;
    s.a = 0.025 + depth * 0.075;
    s.near = depth > 0.45;
  };

  return {
    resize(w, h) {
      W = w;
      H = h;
      if (streaks.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const s = {} as Streak;
          spawn(s, false);
          streaks.push(s);
        }
      }
    },

    frame(ctx, dt, w, h, paint, pointer) {
      ctx.fillStyle = paint.bg;
      ctx.fillRect(0, 0, w, h);

      const haze = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      haze.addColorStop(0, `rgba(${paint.glow},${paint.light ? 0.07 : 0.05})`);
      haze.addColorStop(1, `rgba(${paint.glow},0)`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h * 0.7);

      for (const s of streaks) {
        let wind = 0;
        if (pointer.inside) {
          const dx = s.x - pointer.x;
          const dy = s.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH) wind = (1 - Math.sqrt(d2) / REACH) * Math.sign(dx || 1) * 130;
        }
        s.x += (s.speed * SLANT + wind) * dt;
        s.y += s.speed * dt;
        if (s.y - s.len > h) spawn(s, true);
      }

      ctx.save();
      ctx.lineCap = "round";
      for (const s of streaks) {
        const layers: [number, number][] = s.near ? [[1.4, 1]] : [[3, 0.35], [1, 0.8]];
        for (const [width, ak] of layers) {
          ctx.strokeStyle = `rgba(${paint.glow},${s.a * ak})`;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.len * SLANT, s.y - s.len);
          ctx.stroke();
        }
      }
      ctx.lineCap = "butt";
      ctx.restore();
    },
  };
}
