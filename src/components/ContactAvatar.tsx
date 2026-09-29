import { Sparkles } from "lucide-react";
import Head from "./Head";
import AcironLogo from "./AcironLogo";
import { friendSkinUrl } from "../api";
import { useLang } from "../i18n";
import Icon from "./Icon";

export type ContactLike = {
  username: string;
  hasSkin: boolean;
  system?: boolean;
  verified?: boolean;
};

export function isVerified(c?: { system?: boolean; verified?: boolean } | null): boolean {
  return !!c && (!!c.system || !!c.verified);
}

export function ContactAvatar({
  c,
  size,
  className = "",
}: {
  c: ContactLike;
  size: number;
  className?: string;
}) {
  if (c.system) {
    return (
      <div
        className={`grid place-items-center ${className}`}
        style={{ width: size, height: size }}
      >
        <AcironLogo size={Math.round(size * 0.76)} />
      </div>
    );
  }
  return <Head skin={friendSkinUrl(c)} name={c.username} size={size} className={className} />;
}

export function PlusMark({ small = false }: { small?: boolean }) {
  return (
    <span
      title="Aciron Plus"
      className={`inline-flex shrink-0 items-center rounded-full font-bold uppercase tracking-[0.08em] text-[#2a1604] ${
        small ? "h-[14px] gap-0.5 px-1 text-[8px]" : "h-[17px] gap-1 px-1.5 text-[9.5px]"
      }`}
      style={{
        background: "linear-gradient(135deg, #ffd29a 0%, #ffb367 45%, #ff8f5a 100%)",
        boxShadow: "0 2px 8px rgba(255,160,90,0.3), inset 0 1px 0 rgba(255,255,255,0.45)",
      }}
    >
      <Sparkles size={small ? 8 : 10} strokeWidth={2.4} />
      Plus
    </span>
  );
}

export function VerifiedMark({ className = "" }: { className?: string }) {
  const { t } = useLang();
  return (
    <Icon
      cls={`fa-solid fa-circle-check shrink-0 text-accent ${className}`}
      title={t("Проверенный аккаунт")}
    />
  );
}
