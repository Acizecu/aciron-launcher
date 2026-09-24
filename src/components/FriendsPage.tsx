import { useEffect, useMemo, useState } from "react";
import { ContactAvatar, isVerified, VerifiedMark } from "./ContactAvatar";
import BotRow from "./BotRow";
import ChatPanel from "./ChatPanel";
import TypingDots from "./chat/TypingDots";
import { type Friend } from "../api";
import { contacts, PRESENCE_COLOR, presenceText, sortFriends, useFriends } from "../friends";
import { useChat, useTyping } from "../chat";
import { cardInDelay } from "../anim";
import { locale, useLang } from "../i18n";
import Icon from "./Icon";

function shortTime(at: number): string {
  const d = new Date(at);
  const now = new Date();
  const today = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale(), today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(d);
}

function ChatRow({
  f,
  active,
  unread,
  at,
  index,
  onClick,
}: {
  f: Friend;
  active: boolean;
  unread: number;

  at: number;
  index: number;
  onClick: () => void;
}) {

  const typing = useTyping(f.id);

  return (
    <button
      onClick={onClick}
      style={cardInDelay(index)}
      className={`card-in relative flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors duration-300 ${
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"
      }`}
    >
      {}
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-transform duration-300 ease-[var(--ease-out-quint)] ${
          active ? "scale-y-100" : "scale-y-0"
        }`}
      />
      <span className="flex shrink-0 items-center">
        <span
          className="shrink-0 rounded-full transition-shadow duration-500"
          style={{ boxShadow: `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${PRESENCE_COLOR[f.presence.state]}` }}
        >
          <ContactAvatar
            c={f}
            size={36}
            className={`rounded-full ${f.presence.state === "offline" ? "opacity-55" : ""}`}
          />
        </span>
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-text">{f.username}</span>
          {isVerified(f) && <VerifiedMark className="text-[11.5px]" />}
          {at > 0 && <span className="ml-auto shrink-0 pl-2 text-[11.5px] text-muted">{shortTime(at)}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 truncate text-[12.5px]">
          {typing ? (
            <TypingDots />
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted">{presenceText(f.presence)}</span>
          )}
          {unread > 0 && (
            <span className="pop ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-semibold text-bg">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function FriendsPage() {
  const { t } = useLang();
  const { data, error, loading } = useFriends();
  const { unread, last } = useChat();

  const [openId, setOpenId] = useState<string | null>(() => {
    const w = window as unknown as { __acironOpenChat?: string };
    const id = w.__acironOpenChat ?? null;
    w.__acironOpenChat = undefined;
    return id;
  });

  const friends = useMemo(() => {
    const base = sortFriends(data?.friends ?? []);
    return base
      .map((f, i) => ({ f, i, at: last[f.id] ?? 0 }))
      .sort((a, b) => (b.at !== a.at ? b.at - a.at : a.i - b.i))
      .map((x) => x.f);
  }, [data, last]);

  const bots = data?.bots ?? [];

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shownFriends = q ? friends.filter((f) => f.username.toLowerCase().includes(q)) : friends;
  const shownBots = q ? bots.filter((b) => b.username.toLowerCase().includes(q)) : bots;

  useEffect(() => {
    if (!data) return;
    if (openId && !contacts(data).some((f) => f.id === openId)) setOpenId(null);
  }, [data, openId]);

  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;

      (window as unknown as { __acironOpenChat?: string }).__acironOpenChat = undefined;
      setOpenId(id);
    };
    window.addEventListener("aciron-open-chat", open);
    return () => window.removeEventListener("aciron-open-chat", open);
  }, []);

  const open = contacts(data).find((f) => f.id === openId) ?? null;

  if (loading && !data) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <Icon cls="fa-solid fa-spinner fa-spin" />
      </div>
    );
  }

  if (error === "NO_ACIRON" || error === "SESSION_EXPIRED") {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-accent/12 text-3xl text-accent">
            <Icon cls="fa-solid fa-user-group" />
          </div>
          <h2 className="text-xl font-semibold text-text">{t("Друзья")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {error === "NO_ACIRON"
              ? t("Переписка доступна с аккаунтом Aciron ID — войдите в него на главной.")
              : t("Сессия Aciron ID истекла — войдите заново.")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-line">
        <div className="px-5 pb-3 pt-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-text">{t("Переписки")}</h1>
          <div className="field-wrap mt-3 flex h-10 items-center gap-2 px-3.5">
            <Icon cls="fa-solid fa-magnifying-glass text-[14px] text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Найти переписку")}
              className="w-full bg-transparent text-[13.5px] text-text outline-none placeholder:text-muted"
            />
            {query && (
              <button onClick={() => setQuery("")} title={t("Очистить")} className="text-muted transition-colors hover:text-text">
                <Icon cls="fa-solid fa-xmark text-[13px]" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {}
          {shownBots.map((b, i) => (
            <BotRow
              key={b.id}
              bot={b}
              index={i}
              unread={unread[b.id] ?? 0}
              active={b.id === openId}
              className={b.id === openId ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"}
              onClick={() => setOpenId(b.id)}
            />
          ))}
          {friends.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] leading-relaxed text-muted">
              {t("Друзей пока нет. Добавить можно на главной — в панели справа.")}
            </div>
          ) : shownFriends.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-muted">{t("Ничего не найдено")}</div>
          ) : (
            shownFriends.map((f, i) => (
              <ChatRow
                key={f.id}
                f={f}
                index={i + bots.length}
                active={f.id === openId}
                unread={unread[f.id] ?? 0}
                at={last[f.id] ?? 0}
                onClick={() => setOpenId(f.id)}
              />
            ))
          )}
        </div>
      </aside>

      {open ? (

        <ChatPanel key={open.id} friend={open} />
      ) : (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="page-in">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/[0.04] text-muted">
              <Icon cls="fa-regular fa-comments text-[26px]" />
            </span>
            <div className="text-[15px] font-medium text-text">{t("Выберите, с кем поговорить")}</div>
            <div className="mt-1 text-[13px] text-muted">{t("Переписки с друзьями — слева")}</div>
          </div>
        </div>
      )}
    </div>
  );
}
