import { useEffect, useMemo, useState } from "react";
import Head from "./Head";
import ChatPanel from "./ChatPanel";
import TypingDots from "./chat/TypingDots";
import { friendSkinUrl, type Friend } from "../api";
import { PRESENCE_COLOR, presenceText, sortFriends, useFriends } from "../friends";
import { useChat, useTyping } from "../chat";

function ChatRow({
  f,
  active,
  unread,
  onClick,
}: {
  f: Friend;
  active: boolean;
  unread: number;
  onClick: () => void;
}) {
  // Пока человек печатает — вместо присутствия («Не активен») показываем бегущие
  // точки: строка списка и так самое заметное место, где ждут ответа.
  const typing = useTyping(f.id);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
        active ? "bg-accent/10" : "hover:bg-card"
      }`}
    >
      <Head
        skin={friendSkinUrl(f)}
        name={f.username}
        size={38}
        className={`shrink-0 rounded-lg ${f.presence.state === "offline" ? "opacity-50" : ""}`}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span
            className={`truncate text-sm ${
              active ? "font-semibold text-accent" : "font-semibold text-text"
            }`}
          >
            {f.username}
          </span>
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: PRESENCE_COLOR[f.presence.state] }}
          />
        </div>
        <div className="truncate text-[11px]">
          {typing ? (
            <TypingDots />
          ) : (
            <span className="text-muted">{presenceText(f.presence)}</span>
          )}
        </div>
      </div>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

export default function FriendsPage() {
  const { data, error, loading } = useFriends();
  const { unread, last } = useChat();
  const [openId, setOpenId] = useState<string | null>(null);

  const friends = useMemo(() => {
    const base = sortFriends(data?.friends ?? []);
    return base
      .map((f, i) => ({ f, i, at: last[f.id] ?? 0 }))
      .sort((a, b) => (b.at !== a.at ? b.at - a.at : a.i - b.i))
      .map((x) => x.f);
  }, [data, last]);

  useEffect(() => {
    if (!data) return;
    if (openId && !friends.some((f) => f.id === openId)) setOpenId(null);
  }, [data, friends, openId]);

  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setOpenId(id);
    };
    window.addEventListener("aciron-open-chat", open);
    return () => window.removeEventListener("aciron-open-chat", open);
  }, []);

  const open = friends.find((f) => f.id === openId) ?? null;

  if (loading && !data) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <i className="fa-solid fa-spinner fa-spin" />
      </div>
    );
  }

  if (error === "NO_ACIRON" || error === "SESSION_EXPIRED") {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-card text-3xl text-accent">
            <i className="fa-solid fa-user-group" />
          </div>
          <h2 className="text-xl font-bold text-text">Друзья</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {error === "NO_ACIRON"
              ? "Переписка доступна с аккаунтом Aciron ID — войдите в него на главной."
              : "Сессия Aciron ID истекла — войдите заново."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-border/70">
        <div className="px-4 pb-2 pt-4 text-[20px] font-light text-text">Переписки</div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {friends.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs leading-relaxed text-muted">
              Друзей пока нет. Добавить можно на главной — в панели справа.
            </div>
          ) : (
            friends.map((f) => (
              <ChatRow
                key={f.id}
                f={f}
                active={f.id === openId}
                unread={unread[f.id] ?? 0}
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
          <div>
            <i className="fa-regular fa-comments mb-3 block text-4xl text-muted/40" />
            <div className="text-sm text-muted">Выберите, с кем поговорить</div>
          </div>
        </div>
      )}
    </div>
  );
}
