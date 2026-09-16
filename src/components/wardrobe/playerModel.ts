
import * as THREE from "three";

export type SkinModel = "classic" | "slim";

export type BoneName =
  | "Main"
  | "Body"
  | "Head"
  | "RightArm"
  | "LeftArm"
  | "RightLeg"
  | "LeftLeg"
  | "Cape";

const UV_INSET = 0.02;

function setBoxUv(
  geo: THREE.BoxGeometry,
  u: number,
  v: number,
  w: number,
  h: number,
  d: number,
  texW: number,
  texH: number
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  const face = (x: number, y: number, fw: number, fh: number, flipV = false) => {
    const e = UV_INSET;
    const x0 = (x + e) / texW;
    const x1 = (x + fw - e) / texW;
    const y0 = 1 - (y + e) / texH;
    const y1 = 1 - (y + fh - e) / texH;

    return flipV ? [x0, y1, x1, y1, x0, y0, x1, y0] : [x0, y0, x1, y0, x0, y1, x1, y1];
  };

  const faces = [
    face(u + d + w, v + d, d, h),
    face(u, v + d, d, h),
    face(u + d, v, w, d),

    face(u + d + w, v, w, d, true),
    face(u + d, v + d, w, h),
    face(u + d + w + d, v + d, w, h),
  ];

  faces.forEach((f, i) => {
    for (let k = 0; k < 4; k++) uv.setXY(i * 4 + k, f[k * 2], f[k * 2 + 1]);
  });
  uv.needsUpdate = true;
}

export type PlayerRig = {
  root: THREE.Group;
  bones: Record<BoneName, THREE.Group>;
  dispose: () => void;
};

function textureFrom(image: HTMLImageElement): THREE.Texture {
  const t = new THREE.Texture(image);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

type Cube = {

  center: [number, number, number];
  size: [number, number, number];
  uv: [number, number];
  inflate?: number;
};

export type BackItem = "cape" | "elytra";

export function buildPlayer(
  skin: HTMLImageElement,
  model: SkinModel,
  cape: HTMLImageElement | null,
  back: BackItem = "cape"
): PlayerRig {
  const texW = 64;
  const texH = skin.naturalHeight === 32 ? 32 : 64;
  const legacy = texH === 32;

  const tex = textureFrom(skin);
  const base = new THREE.MeshLambertMaterial({ map: tex });

  const overlay = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const bones = {} as Record<BoneName, THREE.Group>;

  const bone = (
    name: BoneName,
    pivot: [number, number, number],
    parent: BoneName | null,
    cubes: Cube[] = []
  ) => {
    const g = new THREE.Group();
    const p = parent ? bones[parent] : null;
    const origin = parent ? (p!.userData.pivot as number[]) : [0, 0, 0];
    g.position.set(pivot[0] - origin[0], pivot[1] - origin[1], pivot[2] - origin[2]);
    g.userData.pivot = pivot;

    for (const c of cubes) {
      const inf = c.inflate ?? 0;
      const [w, h, d] = c.size;
      const geo = new THREE.BoxGeometry(w + inf * 2, h + inf * 2, d + inf * 2);
      setBoxUv(geo, c.uv[0], c.uv[1], w, h, d, texW, texH);
      const mesh = new THREE.Mesh(geo, inf > 0 ? overlay : base);
      mesh.position.set(c.center[0] - pivot[0], c.center[1] - pivot[1], c.center[2] - pivot[2]);
      g.add(mesh);
    }

    bones[name] = g;
    (p ?? null)?.add(g);
    return g;
  };

  const armW = model === "slim" ? 3 : 4;

  const armX = 4 + armW / 2;

  const layer = (c: Cube): Cube[] => (legacy ? [] : [c]);

  const root = new THREE.Group();
  const main = bone("Main", [0, 0, 0], null);
  root.add(main);

  bone("Body", [0, 12, 0], "Main", [
    { center: [0, 18, 0], size: [8, 12, 4], uv: [16, 16] },
    ...layer({ center: [0, 18, 0], size: [8, 12, 4], uv: [16, 32], inflate: 0.25 }),
  ]);

  bone("Head", [0, 24, 0], "Body", [
    { center: [0, 28, 0], size: [8, 8, 8], uv: [0, 0] },
    { center: [0, 28, 0], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 },
  ]);

  bone("RightArm", [-4, 23, 0], "Body", [
    { center: [-armX, 18, 0], size: [armW, 12, 4], uv: [40, 16] },
    ...layer({ center: [-armX, 18, 0], size: [armW, 12, 4], uv: [40, 32], inflate: 0.25 }),
  ]);

  bone("LeftArm", [4, 23, 0], "Body", [
    { center: [armX, 18, 0], size: [armW, 12, 4], uv: legacy ? [40, 16] : [32, 48] },
    ...layer({ center: [armX, 18, 0], size: [armW, 12, 4], uv: [48, 48], inflate: 0.25 }),
  ]);

  bone("RightLeg", [-1.9, 12, 0], "Main", [
    { center: [-1.9, 6, 0], size: [4, 12, 4], uv: [0, 16] },
    ...layer({ center: [-1.9, 6, 0], size: [4, 12, 4], uv: [0, 32], inflate: 0.25 }),
  ]);

  bone("LeftLeg", [1.9, 12, 0], "Main", [
    { center: [1.9, 6, 0], size: [4, 12, 4], uv: legacy ? [0, 16] : [16, 48] },
    ...layer({ center: [1.9, 6, 0], size: [4, 12, 4], uv: [0, 48], inflate: 0.25 }),
  ]);

  if (legacy) {

    bones.LeftArm.scale.x = -1;
    bones.LeftLeg.scale.x = -1;
  }

  const backParts: { dispose: () => void }[] = [];

  const capeBone = bone("Cape", [0, 24, -2], "Body");
  if (cape) {
    const ctex = textureFrom(cape);
    backParts.push(ctex);

    if (back === "elytra") {

      const wingMat = new THREE.MeshLambertMaterial({
        map: ctex,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.05,
      });
      backParts.push(wingMat);

      const wing = (dir: 1 | -1) => {
        const geo = new THREE.BoxGeometry(10, 20, 2);
        setBoxUv(geo, 22, 0, 10, 20, 2, 64, 32);
        const mesh = new THREE.Mesh(geo, wingMat);

        mesh.position.set(-5 * dir, -10, -1);
        mesh.scale.x = -dir;

        mesh.position.z -= dir * 0.02;

        const g = new THREE.Group();
        g.add(mesh);
        g.position.x = dir * 5;

        g.position.y = -2;

        g.rotation.z = -0.2618 * dir;
        g.rotation.x = 0.2618;
        return g;
      };

      capeBone.add(wing(1), wing(-1));
    } else {
      const cgeo = new THREE.BoxGeometry(10, 16, 1);
      setBoxUv(cgeo, 0, 0, 10, 16, 1, 64, 32);
      const cmat = new THREE.MeshLambertMaterial({ map: ctex });
      backParts.push(cmat);
      const mesh = new THREE.Mesh(cgeo, cmat);

      mesh.position.set(0, -8, 0);
      mesh.rotation.y = Math.PI;
      capeBone.rotation.x = 0.18;
      capeBone.add(mesh);
    }
  }

  return {
    root,
    bones,
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      base.dispose();
      overlay.dispose();
      tex.dispose();
      for (const p of backParts) p.dispose();
    },
  };
}
