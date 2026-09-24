import { fillBg, softLight, lightMode, type Scene } from "./types";

export function makeGlow(): Scene {
  let t = 0;

  return {
    resize() {

    },

    frame(ctx, dt, w, h, paint) {
      t += dt;
      fillBg(ctx, w, h, paint);
      const k = lightMode(ctx, paint);

      const breath = (Math.sin(t * ((Math.PI * 2) / 140)) + 1) / 2;

      softLight(ctx, w * (0.56 + breath * 0.04), -h * 0.18, Math.max(w, h) * 0.62, paint.glow, (0.065 + breath * 0.02) * k);

      softLight(ctx, w * 1.02, h * 1.04, Math.max(w, h) * 0.42, paint.glow, (0.035 + (1 - breath) * 0.015) * k);

      ctx.globalCompositeOperation = "source-over";
    },
  };
}
