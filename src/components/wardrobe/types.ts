
import type { SkinModelId } from "../../api";
import { t, ts } from "../../i18n";

export function human(e: unknown): string {
  const m = ts(String(e));
  if (m === "SESSION_EXPIRED") return t("Сессия Aciron ID истекла — войдите заново");
  if (m === "NO_ACIRON") return t("Гардероб доступен с аккаунтом Aciron ID");
  return m;
}

export type CapeOrigin = "license" | "own" | "mojang" | "aciron";

export const ORIGIN_LABEL: Record<CapeOrigin, string> = {
  get license() {
    return t("На аккаунте");
  },
  get own() {
    return t("Свой плащ");
  },
  get mojang() {
    return t("Дизайн Mojang");
  },
  get aciron() {
    return t("Дизайн Aciron");
  },
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
