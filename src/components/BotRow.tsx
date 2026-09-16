import { memo } from "react";
import { ContactAvatar, VerifiedMark } from "./ContactAvatar";
import { type Friend } from "../api";
import { cardInDelay } from "../anim";
import { useLang } from "../i18n";

const BotRow = memo(function BotRow({
  bot,
  unread,
  active = false,
  size = 38,
  index = 0,
  className = "",
  onClick,
}: {
  bot: Friend;
  unread: number;

  active?: boolean;
  size?: number;

  index?: number;
  className?: string;
  onClick: () => void;
}) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      title={t("Открыть переписку")}
      style={cardInDelay(index)}
      className={`card-in flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${className}`}
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <i
          className="fa-solid fa-thumbtack w-2.5 text-center text-[9px] text-muted"
          title={t("Закреплено")}
        />
        <ContactAvatar c={bot} size={size} className="shrink-0 rounded-lg" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-sm font-semibold ${active ? "text-accent" : "text-text"}`}
          >
            {bot.username}
          </span>
          <VerifiedMark className="text-[10px]" />
        </div>
        <div className="truncate text-[11px] text-muted">{t("Официальные уведомления")}</div>
      </div>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
});

export default BotRow;
