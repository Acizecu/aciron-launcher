
import type { SkinModelId } from "../../api";

export function human(e: unknown): string {
  const m = String(e).replace(/^Error:\s*/, "");
  if (m === "SESSION_EXPIRED") return "Сессия Aciron ID истекла — войдите заново";
  if (m === "NO_ACIRON") return "Гардероб доступен с аккаунтом Aciron ID";
  return m;
}

export type CapeOrigin = "license" | "own" | "mojang" | "aciron";

export const ORIGIN_LABEL: Record<CapeOrigin, string> = {
  license: "На аккаунте",
  own: "Свой плащ",
  mojang: "Дизайн Mojang",
  aciron: "Дизайн Aciron",
};

export type CapeEntry = {
  key: string;
  name: string;
  url: string;
  origin: CapeOrigin;
  active: boolean;
  apply: () => Promise<unknown>;

  remove?: () => void;
};

export type Instant = {
  skinKey?: string;
  skinUrl?: string;
  model?: SkinModelId;
  capeKey?: string;
  capeUrl?: string | null;
};
