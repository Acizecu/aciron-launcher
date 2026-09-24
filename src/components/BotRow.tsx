import { memo } from "react";
import { ContactAvatar, VerifiedMark } from "./ContactAvatar";
import { type Friend } from "../api";
import { cardInDelay } from "../anim";
import { useLang } from "../i18n";
import Icon from "./Icon";

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
      className={`card-in relative flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors duration-300 ${className}`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-transform duration-300 ease-[var(--ease-out-quint)] ${
          active ? "scale-y-100" : "scale-y-0"
        }`}
      />
      <ContactAvatar c={bot} size={size} className="shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-text">{bot.username}</span>
          <VerifiedMark className="text-[11.5px]" />
          <span className="ml-auto shrink-0 pl-2 text-muted" title={t("Закреплено")}>
            <Icon cls="fa-solid fa-thumbtack text-[12px]" />
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12.5px]">
          <span className="min-w-0 flex-1 truncate text-muted">{t("Официальные уведомления")}</span>
          {unread > 0 && (
            <span className="pop grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-semibold text-bg">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

export default BotRow;
