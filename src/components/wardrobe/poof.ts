import * as THREE from "three";

const COUNT = 170;
const LIFE = 1.15;
const SIZE = 2.0;

const BODY_H = 34;
const BODY_R = 7;

const SHADES = [0xffffff, 0xf4f4f4, 0xe6e6e6, 0xd4d4d4, 0xc0c0c0];

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  scale: number;
  born: number;
};

export type Poof = {
  object: THREE.Object3D;

  update(now: number): boolean;
  dispose(): void;
};

export function createPoof(origin: THREE.Vector3): Poof {
  const geometry = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.frustumCulled = false;

  const start = performance.now() / 1000;
  const parts: Particle[] = [];
  const tint = new THREE.Color();

  for (let i = 0; i < COUNT; i++) {

    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * BODY_R;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = (Math.random() - 0.5) * BODY_H;

    const scale = 0.3 + Math.pow(Math.random(), 2.4) * 2.3;

    const drag = 1.5 / (1 + scale);

    parts.push({
      pos: new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z),

      vel: new THREE.Vector3(
        Math.cos(a) * (3 + Math.random() * 7) * drag,
        (2 + Math.random() * 7) * drag,
        Math.sin(a) * (3 + Math.random() * 7) * drag
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 5 * drag,
        (Math.random() - 0.5) * 5 * drag,
        (Math.random() - 0.5) * 5 * drag
      ),
      rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      scale,

      born: start + Math.random() * 0.2,
    });

    tint.setHex(SHADES[(Math.random() * SHADES.length) | 0]);
    mesh.setColorAt(i, tint);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const dummy = new THREE.Object3D();
  let last = start;

  return {
    object: mesh,
    update(now: number) {
      const dt = Math.min(0.05, now - last);
      last = now;
      let alive = 0;

      for (let i = 0; i < COUNT; i++) {
        const p = parts[i];
        const age = now - p.born;
        if (age < 0 || age > LIFE) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          if (age < 0) alive++;
          continue;
        }
        alive++;

        p.vel.multiplyScalar(1 - 2.2 * dt);
        p.vel.y -= 6 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;

        const k = age / LIFE;
        dummy.position.copy(p.pos);
        dummy.rotation.copy(p.rot);
        dummy.scale.setScalar(p.scale * (1 - k * k));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;

      const t = (now - start) / LIFE;
      material.opacity = 0.95 * Math.max(0, 1 - Math.pow(t, 2.2));
      return alive > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
