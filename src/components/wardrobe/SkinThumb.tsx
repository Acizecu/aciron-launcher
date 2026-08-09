import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildPlayer, type SkinModel } from "./playerModel";

const YAW = 0.7;
const PITCH = 0.06;

const SHOTS = {

  full: { w: 192, h: 256, y: 0, dist: 74 },

  bust: { w: 224, h: 200, y: 5.5, dist: 46 },
} as const;

export type ThumbShot = keyof typeof SHOTS;

type Shared = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
};

let shared: Shared | null = null;

function stage(): Shared {
  if (shared) return shared;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();

  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(0.6, 1, 1.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-1, 0.4, -0.8);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);

  const pivot = new THREE.Group();
  pivot.rotation.y = YAW;
  pivot.rotation.x = PITCH;
  scene.add(pivot);

  shared = { renderer, scene, camera, pivot };
  return shared;
}

const thumbCache = new Map<string, string>();
const cacheKey = (url: string, model: SkinModel, shot: ThumbShot) => `${url}|${model}|${shot}`;

function paintCached(target: HTMLCanvasElement, dataUrl: string) {
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataUrl;
}

function snapshot(
  target: HTMLCanvasElement,
  skin: HTMLImageElement,
  model: SkinModel,
  shot: ThumbShot
): string | null {
  const s = stage();
  const { w, h, y, dist } = SHOTS[shot];
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h;
  s.camera.position.set(0, y, dist);
  s.camera.lookAt(0, y, 0);
  s.camera.updateProjectionMatrix();

  const rig = buildPlayer(skin, model, null);
  rig.root.position.y = -16;
  s.pivot.add(rig.root);
  try {
    s.renderer.render(s.scene, s.camera);
    const ctx = target.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(s.renderer.domElement, 0, 0);
    }

    try {
      return s.renderer.domElement.toDataURL("image/png");
    } catch {
      return null;
    }
  } finally {

    s.pivot.remove(rig.root);
    rig.dispose();
  }
}

export default function SkinThumb({
  url,
  model = "classic",
  shot = "bust",
  className = "",
}: {
  url: string;
  model?: SkinModel;

  shot?: ThumbShot;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = SHOTS[shot];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !url) return;

    const key = cacheKey(url, model, shot);

    const cached = thumbCache.get(key);
    if (cached) {
      paintCached(canvas, cached);
      return;
    }

    let alive = true;
    let started = false;

    const build = () => {
      if (started || !alive) return;
      started = true;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!alive) return;
        const dataUrl = snapshot(canvas, img, model, shot);
        if (dataUrl) thumbCache.set(key, dataUrl);
      };
      img.src = url;
    };

    if (typeof IntersectionObserver === "undefined") {
      build();
      return () => {
        alive = false;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            build();
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(canvas);

    return () => {
      alive = false;
      io.disconnect();
    };
  }, [url, model, shot]);

  return <canvas ref={ref} width={w} height={h} className={className} />;
}
