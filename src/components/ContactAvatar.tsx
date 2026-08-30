import Head from "./Head";
import AcironLogo from "./AcironLogo";
import { friendSkinUrl } from "../api";
import { useLang } from "../i18n";

export type ContactLike = { username: string; hasSkin: boolean; system?: boolean };

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

export function VerifiedMark({ className = "" }: { className?: string }) {
  const { t } = useLang();
  return (
    <i
      className={`fa-solid fa-circle-check shrink-0 text-accent ${className}`}
      title={t("Проверенный аккаунт")}
    />
  );
}
