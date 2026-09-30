import { useEffect, useRef } from "react";
import { backgroundOf, luminance, useTheme } from "../../ThemeContext";
import { useRenderPaused } from "../../hooks/useRenderPaused";
import { rgbTriple, type Paint, type Pointer, type Scene } from "./types";
import { BACKGROUNDS } from "./scenes";

export { BACKGROUNDS, backgroundId, DEFAULT_BACKGROUND, type BackgroundId } from "./scenes";

export default function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { state, palette } = useTheme();
  const id = backgroundOf(state);

  const paused = useRenderPaused();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const resumeRef = useRef<() => void>(() => {});

  const paintRef = useRef<Paint>({
    bg: "#000",
    bgRgb: "0,0,0",
    accents: [],
    glow: "",
    text: "",
    light: false,
  });
  paintRef.current = {
    bg: palette.bg,
    bgRgb: rgbTriple(palette.bg),
    accents: [
      rgbTriple(palette.accent),
      rgbTriple(palette.accentHover),
      rgbTriple(palette.accentActive),
    ],
    glow: rgbTriple(palette.accent),
    text: rgbTriple(palette.text),
    light: luminance(palette.bg) >= 0.5,
  };

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const scene: Scene = (BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]).make();
    let w = 0;
    let h = 0;
    let raf = 0;

    const pointer: Pointer = { x: 0, y: 0, inside: false };
    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };

    const resize = () => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w;
      cv.height = h;
      scene.resize(w, h);

      if (pausedRef.current) scene.frame(ctx, 0, w, h, paintRef.current, pointer);
    };
    resize();

    let last = performance.now();
    const frame = (now: number) => {
      if (pausedRef.current) {
        raf = 0;
        return;
      }

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      scene.frame(ctx, dt, w, h, paintRef.current, pointer);
      raf = requestAnimationFrame(frame);
    };
    const resume = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    resumeRef.current = resume;

    raf = requestAnimationFrame((now) => {
      scene.frame(ctx, 0, w, h, paintRef.current, pointer);
      raf = 0;
      if (!pausedRef.current) resume();
      last = now;
    });
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      resumeRef.current = () => {};
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [id]);

  useEffect(() => {
    if (!paused) resumeRef.current();
  }, [paused]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" />;
}
