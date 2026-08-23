import { fillBg, glowFromBottom, rand, softLight, type Scene } from "./types";

type Dot = {
  x: number;
  y: number;
  vx: number;
  vy: number;

  bx: number;
  by: number;
  r: number;
};

const COUNT = 64;
const LINK = 150;
const LINK2 = LINK * LINK;

const PUSH = 130;
const PUSH2 = PUSH * PUSH;
const HOOK = 190;
const HOOK2 = HOOK * HOOK;

export function makeConstellation(): Scene {
  const dots: Dot[] = [];
  let W = 0;
  let H = 0;

  return {
    resize(w, h) {
      const prevW = W;
      const prevH = H;
      W = w;
      H = h;
      if (dots.length === 0) {
        for (let i = 0; i < COUNT; i++) {
          const vx = rand(-14, 14);
          const vy = rand(-14, 14);
          dots.push({ x: rand(0, w), y: rand(0, h), vx, vy, bx: vx, by: vy, r: rand(1, 2.4) });
        }
        return;
      }

      if (prevW > 0 && prevH > 0) {
        for (const d of dots) {
          d.x *= w / prevW;
          d.y *= h / prevH;
        }
      }
    },

    frame(ctx, dt, w, h, paint, pointer) {
      fillBg(ctx, w, h, paint);
      glowFromBottom(ctx, w, h, paint.glow, 0.055);

      for (const d of dots) {
        if (pointer.inside) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH2 && d2 > 0.01) {

            const dist = Math.sqrt(d2);
            const push = (1 - dist / PUSH) * 900 * dt;
            d.vx += (dx / dist) * push;
            d.vy += (dy / dist) * push;
          }
        }

        const back = Math.min(1, dt * 0.9);
        d.vx += (d.bx - d.vx) * back;
        d.vy += (d.by - d.vy) * back;

        d.x += d.vx * dt;
        d.y += d.vy * dt;

        if (d.x < 0) {
          d.x = 0;
          d.vx = -d.vx;
          d.bx = -d.bx;
        } else if (d.x > w) {
          d.x = w;
          d.vx = -d.vx;
          d.bx = -d.bx;
        }
        if (d.y < 0) {
          d.y = 0;
          d.vy = -d.vy;
          d.by = -d.by;
        } else if (d.y > h) {
          d.y = h;
          d.vy = -d.vy;
          d.by = -d.by;
        }
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK2) continue;
          const k = 1 - Math.sqrt(d2) / LINK;
          ctx.strokeStyle = `rgba(${paint.glow},${k * k * 0.14})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      if (pointer.inside) {
        softLight(ctx, pointer.x, pointer.y, PUSH * 1.3, paint.glow, 0.06);
        for (const d of dots) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > HOOK2) continue;
          const k = 1 - Math.sqrt(d2) / HOOK;
          ctx.strokeStyle = `rgba(${paint.glow},${k * k * 0.3})`;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
      }

      for (const d of dots) {
        ctx.fillStyle = `rgba(${paint.glow},0.26)`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}
