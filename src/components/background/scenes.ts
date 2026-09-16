import type { Scene } from "./types";
import { makeCubes } from "./cubes";
import { makeAurora } from "./aurora";
import { makeStars } from "./stars";
import { makeWaves } from "./waves";
import { makeConstellation } from "./constellation";
import { makeRain } from "./rain";
import { makeHex } from "./hex";
import { makeWarp } from "./warp";
import { makeEmbers } from "./embers";

export const BACKGROUNDS: {
  id: string;
  icon: string;
  make: () => Scene;
}[] = [
  { id: "cubes", icon: "fa-solid fa-cubes", make: makeCubes },
  { id: "aurora", icon: "fa-solid fa-wand-magic-sparkles", make: makeAurora },
  { id: "stars", icon: "fa-solid fa-star", make: makeStars },
  { id: "waves", icon: "fa-solid fa-water", make: makeWaves },
  { id: "constellation", icon: "fa-solid fa-circle-nodes", make: makeConstellation },
  { id: "rain", icon: "fa-solid fa-cloud-rain", make: makeRain },
  { id: "hex", icon: "fa-solid fa-cubes-stacked", make: makeHex },
  { id: "warp", icon: "fa-solid fa-meteor", make: makeWarp },
  { id: "embers", icon: "fa-solid fa-fire", make: makeEmbers },
];

export type BackgroundId =
  | "cubes"
  | "aurora"
  | "stars"
  | "waves"
  | "constellation"
  | "embers"
  | "rain"
  | "hex"
  | "warp";

export const DEFAULT_BACKGROUND: BackgroundId = "cubes";

export function backgroundId(raw: string | null | undefined): BackgroundId {
  return isBackgroundId(raw) ? raw : DEFAULT_BACKGROUND;
}

export function isBackgroundId(raw: unknown): raw is BackgroundId {
  return typeof raw === "string" && BACKGROUNDS.some((b) => b.id === raw);
}
