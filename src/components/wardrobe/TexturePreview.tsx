import { useEffect, useRef } from "react";
import type { SkinModel } from "./playerModel";

export default function TexturePreview({
  url,
  kind,
  model = "classic",
  scale = 6,
  className = "",
}: {
  url: string;
  kind: "skin" | "cape";
  model?: SkinModel;

  scale?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  const armW = model === "slim" ? 3 : 4;
  const box = kind === "cape" ? { w: 10, h: 16 } : { w: 8 + armW * 2, h: 20 };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !url) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      const legacy = img.naturalHeight === 32 && kind === "skin";
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const put = (
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        mirror = false
      ) => {
        ctx.save();
        if (mirror) {
          ctx.translate((dx + sw) * scale, dy * scale);
          ctx.scale(-1, 1);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
        } else {
          ctx.drawImage(img, sx, sy, sw, sh, dx * scale, dy * scale, sw * scale, sh * scale);
        }
        ctx.restore();
      };

      if (kind === "cape") {

        put(1, 1, 10, 16, 0, 0);
        return;
      }

      const cx = armW;

      put(8, 8, 8, 8, cx, 0);
      put(40, 8, 8, 8, cx, 0);

      put(20, 20, 8, 12, cx, 8);
      if (!legacy) put(20, 36, 8, 12, cx, 8);

      put(44, 20, armW, 12, 0, 8);
      if (!legacy) put(44, 36, armW, 12, 0, 8);

      if (legacy) put(44, 20, armW, 12, cx + 8, 8, true);
      else {
        put(36, 52, armW, 12, cx + 8, 8);
        put(52, 52, armW, 12, cx + 8, 8);
      }
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url, kind, model, scale, armW]);

  return (
    <canvas
      ref={ref}
      width={box.w * scale}
      height={box.h * scale}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
