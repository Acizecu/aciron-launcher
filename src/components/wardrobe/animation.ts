
import type { BoneName, PlayerRig } from "./playerModel";

type Vec3 = [number, number, number];
type RawFrame = number | string | (number | string)[] | { pre?: unknown; post?: unknown };

type Channel = { times: number[]; values: Vec3[] };
type BoneTrack = { rotation?: Channel; position?: Channel; scale?: Channel };

export type Animation = {
  name: string;
  length: number;
  loop: boolean;
  bones: Partial<Record<BoneName, BoneTrack>>;
};

const num = (v: unknown): number => {
  if (typeof v === "number") return v;

  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

function toVec3(raw: RawFrame): Vec3 {
  if (Array.isArray(raw)) return [num(raw[0]), num(raw[1]), num(raw[2])];
  if (raw && typeof raw === "object") {
    const o = raw as { post?: unknown; pre?: unknown };
    return toVec3((o.post ?? o.pre) as RawFrame);
  }
  const n = num(raw);
  return [n, n, n];
}

function toChannel(raw: unknown): Channel | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw) || typeof raw === "number" || typeof raw === "string") {
    return { times: [0], values: [toVec3(raw as RawFrame)] };
  }
  const entries = Object.entries(raw as Record<string, RawFrame>)
    .map(([t, v]) => [parseFloat(t), toVec3(v)] as const)
    .filter(([t]) => Number.isFinite(t))
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return undefined;
  return { times: entries.map((e) => e[0]), values: entries.map((e) => e[1]) };
}

export function parseAnimations(json: unknown): Animation[] {
  const src = (json as { animations?: Record<string, unknown> })?.animations;
  if (!src) return [];
  return Object.entries(src).map(([name, a]) => {
    const anim = a as {
      animation_length?: number;
      loop?: boolean | string;
      bones?: Record<string, Record<string, unknown>>;
    };
    const bones: Animation["bones"] = {};
    for (const [bone, track] of Object.entries(anim.bones || {})) {
      bones[bone as BoneName] = {
        rotation: toChannel(track.rotation),
        position: toChannel(track.position),
        scale: toChannel(track.scale),
      };
    }
    return {
      name,
      length: anim.animation_length ?? 1,
      loop: anim.loop === true || anim.loop === "loop",
      bones,
    };
  });
}

function sample(ch: Channel, t: number): Vec3 {
  const { times, values } = ch;
  if (t <= times[0]) return values[0];
  const last = times.length - 1;
  if (t >= times[last]) return values[last];
  let i = 0;
  while (i < last && times[i + 1] < t) i++;
  const span = times[i + 1] - times[i] || 1;
  const k = (t - times[i]) / span;
  const a = values[i];
  const b = values[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const DEG = Math.PI / 180;

export function applyAnimation(rig: PlayerRig, anim: Animation, time: number) {
  const t = anim.loop && anim.length > 0 ? time % anim.length : Math.min(time, anim.length);
  for (const [name, track] of Object.entries(anim.bones)) {
    const bone = rig.bones[name as BoneName];
    if (!bone || !track) continue;
    if (track.rotation) {
      const [x, y, z] = sample(track.rotation, t);
      bone.rotation.set(x * DEG, -y * DEG, -z * DEG);
    }
    if (track.position) {

      const [x, y, z] = sample(track.position, t);
      bone.position.set(bone.userData.baseX + x, bone.userData.baseY + y, bone.userData.baseZ - z);
    }
    if (track.scale) {
      const [x, y, z] = sample(track.scale, t);
      bone.scale.set(x || 1, y || 1, z || 1);
    }
  }
}

export function rememberBasePose(rig: PlayerRig) {
  for (const bone of Object.values(rig.bones)) {
    bone.userData.baseX = bone.position.x;
    bone.userData.baseY = bone.position.y;
    bone.userData.baseZ = bone.position.z;
  }
}

const ease = (k: number) => k * k * (3 - 2 * k);

function noise(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const ACT_PERIOD = 6.5;

function envelope(local: number, rise: number, hold: number): number {
  if (local < rise) return ease(local / rise);
  if (local < rise + hold) return 1;
  if (local < rise * 2 + hold) return 1 - ease((local - rise - hold) / rise);
  return 0;
}

type IdleAct = {

  headYaw: number;
  headPitch: number;
  headRoll: number;

  bodyRoll: number;
  bodyYaw: number;

  rightArmX: number;
  leftArmX: number;
  rightArmZ: number;
  leftArmZ: number;

  rightLegX: number;
  leftLegX: number;

  lift: number;
};

const REST: IdleAct = {
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  bodyRoll: 0,
  bodyYaw: 0,
  rightArmX: 0,
  leftArmX: 0,
  rightArmZ: 0,
  leftArmZ: 0,
  rightLegX: 0,
  leftLegX: 0,
  lift: 0,
};

function idleAct(t: number): IdleAct {
  const seg = Math.floor(t / ACT_PERIOD);
  const local = t - seg * ACT_PERIOD;
  const pick = noise(seg);
  if (pick < 0.28) return REST;

  const dir = noise(seg + 0.5) < 0.5 ? -1 : 1;
  const r = noise(seg + 1.5);

  if (pick < 0.50) {

    const k = envelope(local, 0.75, 1.6);
    return { ...REST, headYaw: dir * (0.35 + r * 0.5) * k, headPitch: (r - 0.5) * 0.16 * k };
  }
  if (pick < 0.62) {

    const k = envelope(local, 1.1, 2.4);
    return {
      ...REST,
      bodyRoll: dir * 0.06 * k,
      bodyYaw: dir * 0.05 * k,
      headRoll: -dir * 0.05 * k,
      rightLegX: dir > 0 ? 0.1 * k : 0,
      leftLegX: dir > 0 ? 0 : 0.1 * k,
    };
  }
  if (pick < 0.70) {

    const k = envelope(local, 0.28, 0.12);
    const k2 = envelope(Math.max(0, local - 0.75), 0.28, 0.12);
    return { ...REST, headPitch: 0.22 * (k + k2 * 0.7) };
  }
  if (pick < 0.76) {

    const k = envelope(local, 0.85, 1.9);
    const side = dir > 0 ? "right" : "left";
    return {
      ...REST,
      headPitch: 0.3 * k,
      headYaw: (side === "right" ? -0.28 : 0.28) * k,
      rightArmX: side === "right" ? -0.95 * k : 0,
      leftArmX: side === "left" ? -0.95 * k : 0,
      rightArmZ: side === "right" ? 0.3 * k : 0,
      leftArmZ: side === "left" ? -0.3 * k : 0,
    };
  }
  if (pick < 0.82) {

    const k = envelope(local, 0.9, 1.2);
    return {
      ...REST,
      rightArmX: 0.5 * k,
      leftArmX: 0.5 * k,
      rightArmZ: -0.22 * k,
      leftArmZ: 0.22 * k,
      headPitch: -0.16 * k,
    };
  }
  if (pick < 0.87) {

    const k = envelope(local, 0.6, 1.0);
    return { ...REST, lift: 0.9 * k, headPitch: -0.05 * k, rightLegX: -0.05 * k, leftLegX: -0.05 * k };
  }
  if (pick < 0.91) {

    const k = envelope(local, 0.22, 0.18);
    const k2 = envelope(Math.max(0, local - 0.45), 0.22, 0.18);
    const swing = (k + k2) * 0.45;
    return dir > 0
      ? { ...REST, rightArmX: -swing, rightArmZ: 0.12 * swing }
      : { ...REST, leftArmX: -swing, leftArmZ: -0.12 * swing };
  }
  if (pick < 0.95) {

    const k = envelope(local, 1.0, 2.2);
    return {
      ...REST,
      headYaw: dir * 1.05 * k,
      headPitch: 0.06 * k,
      bodyYaw: dir * 0.22 * k,
      bodyRoll: -dir * 0.03 * k,
    };
  }
  if (pick < 0.98) {

    const k = envelope(local, 0.5, 0.9);
    return {
      ...REST,
      rightLegX: dir > 0 ? -0.34 * k : 0.12 * k,
      leftLegX: dir > 0 ? 0.12 * k : -0.34 * k,
      bodyRoll: -dir * 0.03 * k,
      lift: 0.3 * k,
    };
  }

  const k = envelope(local, 1.2, 2.6);
  return { ...REST, headRoll: dir * 0.34 * k, headYaw: dir * 0.12 * k, bodyRoll: dir * 0.02 * k };
}

export function idlePose(rig: PlayerRig, time: number) {
  const t = time;
  const breathe = Math.sin(t * 1.6) * 0.5;
  const act = idleAct(t);

  rig.bones.Body.position.y = rig.bones.Body.userData.baseY + breathe * 0.12;
  rig.bones.Body.rotation.z = act.bodyRoll;
  rig.bones.Body.rotation.y = act.bodyYaw;

  rig.bones.Main.position.y = rig.bones.Main.userData.baseY + act.lift;

  rig.bones.Head.rotation.y = Math.sin(t * 0.5) * 0.06 + act.headYaw;
  rig.bones.Head.rotation.x = Math.sin(t * 0.7) * 0.04 + act.headPitch;
  rig.bones.Head.rotation.z = act.headRoll;

  const splay = 0.06 + Math.sin(t * 1.2) * 0.02;
  rig.bones.RightArm.rotation.z = -splay + act.rightArmZ;
  rig.bones.LeftArm.rotation.z = splay + act.leftArmZ;

  const sway = Math.sin(t * 1.6) * 0.045;
  rig.bones.RightArm.rotation.x = -sway + act.rightArmX;
  rig.bones.LeftArm.rotation.x = sway + act.leftArmX;

  rig.bones.RightLeg.rotation.x = sway * 0.5 + act.rightLegX;
  rig.bones.LeftLeg.rotation.x = -sway * 0.5 + act.leftLegX;

  rig.bones.Cape.rotation.x = 0.18 + Math.sin(t * 1.1) * 0.05 + act.lift * 0.06;
}
