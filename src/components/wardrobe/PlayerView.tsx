import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildPlayer, type SkinModel } from "./playerModel";
import { applyAnimation, idlePose, rememberBasePose, type Animation } from "./animation";
import { createPoof, type Poof } from "./poof";

const ZOOM_MIN = 0.72;
const ZOOM_MAX = 1.45;
const ZOOM_STEP = 0.08;

const FIT_H = 37;
const FIT_W = 26;

const LOOK_Y = 0;

const VFOV = 30;
const DEG = Math.PI / 180;

export default function PlayerView({
  skinUrl,
  capeUrl,
  model,
  animation,
  className = "",
}: {
  skinUrl: string;
  capeUrl?: string | null;
  model: SkinModel;

  animation?: Animation | null;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  const angle = useRef({ yaw: -0.45, pitch: 0 });

  const zoom = useRef(1);
  const animRef = useRef<Animation | null>(null);
  animRef.current = animation ?? null;

  const mounted = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:grab";

    scene.add(new THREE.AmbientLight(0xffffff, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.6, 1, 1.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-1, 0.4, -0.8);
    scene.add(fill);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let rig: ReturnType<typeof buildPlayer> | null = null;
    let alive = true;
    let poof: Poof | null = null;

    const load = (url: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });

    void Promise.all([load(skinUrl), load(capeUrl || "")]).then(([skin, cape]) => {
      if (!alive || !skin) return;
      rig = buildPlayer(skin, model, cape);
      rememberBasePose(rig);

      rig.root.position.y = -16;
      pivot.add(rig.root);

      if (mounted.current) {
        poof?.dispose();
        poof = createPoof(new THREE.Vector3(0, 0, 0));
        pivot.add(poof.object);
      }
      mounted.current = true;
    });

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      angle.current.yaw += (e.clientX - lastX) * 0.01;

      angle.current.pitch = Math.max(
        -0.5,
        Math.min(0.5, angle.current.pitch + (e.clientY - lastY) * 0.006)
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture?.(e.pointerId);
      renderer.domElement.style.cursor = "grab";
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, zoom.current + Math.sign(e.deltaY) * ZOOM_STEP)
      );
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

    let baseDist = 78;
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const vfov = VFOV * DEG;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      baseDist = Math.max(FIT_H / 2 / Math.tan(vfov / 2), FIT_W / 2 / Math.tan(hfov / 2));
    };
    resize();
    camera.position.set(0, LOOK_Y, baseDist);
    camera.lookAt(0, LOOK_Y, 0);
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      pivot.rotation.y = angle.current.yaw;
      pivot.rotation.x = angle.current.pitch;

      const want = baseDist * zoom.current;
      camera.position.z += (want - camera.position.z) * 0.18;
      if (rig) {
        if (animRef.current) applyAnimation(rig, animRef.current, t);
        else idlePose(rig, t);
      }
      if (poof && !poof.update(performance.now() / 1000)) {
        pivot.remove(poof.object);
        poof.dispose();
        poof = null;
      }
      renderer.render(scene, camera);
    };

    let running = false;
    let visibleInView = true;
    const shouldRun = () => alive && visibleInView && !document.hidden;
    const startLoop = () => {
      if (running || !shouldRun()) return;
      running = true;
      tick();
    };
    const stopLoop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    };
    const syncLoop = () => (shouldRun() ? startLoop() : stopLoop());

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visibleInView = e.isIntersecting;
      syncLoop();
    });
    io.observe(host);

    startLoop();

    return () => {
      alive = false;
      stopLoop();
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      renderer.domElement.removeEventListener("wheel", wheel);
      poof?.dispose();
      rig?.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };

  }, [skinUrl, capeUrl, model]);

  return <div ref={hostRef} className={className} />;
}
