import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Head from "./Head";
import ProfileModal from "./ProfileModal";
import MessageMenu, { type MenuItem } from "./chat/MessageMenu";
import ForwardModal from "./chat/ForwardModal";
import TypingDots from "./chat/TypingDots";
import LoadingDots from "./LoadingDots";
import EmojiPicker from "./chat/EmojiPicker";
import Twemoji from "./chat/Twemoji";
import { friendSkinUrl, getAccounts, MAX_MESSAGE, type Friend } from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";
import ReactionPicker from "./chat/ReactionPicker";
import {
  discard,
  encodeForward,
  encodeReply,
  loadOlder,
  myReaction,
  notifyTyping,
  openConversation,
  parseForward,
  parseReply,
  react,
  remove,
  retry,
  send,
  setOpenConversation,
  splitReactions,
  useConversation,
  useTyping,
  type LocalMessage,
  type Reaction,
} from "../chat";
import { useToast } from "../ToastContext";
import { dtf, t, useLang, ts } from "../i18n";

type ReplyTarget = { id: string; author: string; text: string };

const GROUP_WINDOW_MS = 5 * 60 * 1000;

const time = (ms: number) => dtf({ hour: "2-digit", minute: "2-digit" }).format(ms);

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return t("Сегодня");
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return t("Вчера");
  return dtf({ day: "numeric", month: "long" }).format(d);
}

function Ticks({ msg }: { msg: LocalMessage }) {
  if (msg.state === "sending") return <i className="fa-regular fa-clock" title={t("Отправляется")} />;
  if (msg.state === "failed")
    return <i className="fa-solid fa-triangle-exclamation" title={t("Не отправлено")} />;
  return (
    <i
      className={`fa-solid ${msg.read ? "fa-check-double" : "fa-check"}`}
      title={msg.read ? t("Прочитано") : t("Доставлено")}
    />
  );
}

function MessagesSkeleton() {

  const rows = [
    { mine: false, w: "58%" },
    { mine: true, w: "42%" },
    { mine: false, w: "72%" },
    { mine: false, w: "35%" },
    { mine: true, w: "64%" },
  ];
  return (
    <div className="space-y-3 py-2">
      {rows.map((r, i) => (
        <div key={i} className={`flex ${r.mine ? "justify-end" : "justify-start"}`}>
          <div
            className="h-10 animate-pulse rounded-2xl bg-card"
            style={{ width: r.w, animationDelay: `${i * 80}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

const Bubble = memo(function Bubble({
  msg,
  mine,
  grouped,
  selected,
  selecting,
  onToggle,
  onMenu,
  onReply,
  reactions,
  onReact,
}: {
  msg: LocalMessage;
  mine: boolean;
  grouped: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: string) => void;
  onMenu: (e: React.MouseEvent, msg: LocalMessage) => void;
  onReply: (msg: LocalMessage) => void;
  reactions?: Reaction[];
  onReact: (msg: LocalMessage, emoji: string) => void;
}) {

  useLang();

  const fwd = parseForward(msg.body);
  const rep = parseReply(fwd.text);
  return (
    <div
      onContextMenu={(e) => onMenu(e, msg)}
      onClick={() => selecting && onToggle(msg.id)}
      onDoubleClick={() => !selecting && onReply(msg)}
      className={`group flex items-center ${mine ? "justify-end" : "justify-start"} ${
        grouped ? "mt-0.5" : "mt-2"
      } ${selecting ? "cursor-pointer" : ""} ${selected ? "rounded-lg bg-accent/10" : ""}`}
    >
      {}
      {mine && !selecting && (
        <ReactionPicker current={myReaction(reactions)} onPick={(e) => onReact(msg, e)} />
      )}
      {selecting && (
        <span
          className={`mr-2 mt-2 grid h-4 w-4 shrink-0 place-items-center self-start rounded-full border ${
            selected ? "border-accent bg-accent text-bg" : "border-border"
          }`}
        >
          {selected && <i className="fa-solid fa-check text-[8px]" />}
        </span>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 ${
          mine ? "bg-accent text-bg" : "bg-card text-text"
        } ${msg.state === "failed" ? "opacity-60" : ""} ${
          grouped ? (mine ? "rounded-tr-md" : "rounded-tl-md") : ""
        }`}
      >
        {}
        {fwd.forwardedFrom && (
          <div
            className={`mb-1 flex items-center gap-1 border-l-2 pl-1.5 text-[11px] ${
              mine ? "border-bg/40 text-bg/70" : "border-accent/50 text-muted"
            }`}
          >
            <i className="fa-solid fa-share text-[9px]" />
            {t("Переслано от {name}", { name: fwd.forwardedFrom })}
          </div>
        )}
        {}
        {rep.replyTo && (
          <div
            className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] leading-tight ${
              mine ? "border-bg/40 bg-bg/10 text-bg/75" : "border-accent/60 bg-bg/40 text-muted"
            }`}
          >
            <div className={`font-semibold ${mine ? "text-bg/90" : "text-accent"}`}>
              {rep.replyTo.author}
            </div>
            <div className="selectable truncate">
              <Twemoji text={rep.replyTo.text} />
            </div>
          </div>
        )}
        {}
        <div className="selectable whitespace-pre-wrap break-words text-sm leading-snug">
          <Twemoji text={rep.text} />
        </div>
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            mine ? "text-bg/60" : "text-muted"
          }`}
        >
          {time(msg.at)}
          {mine && <Ticks msg={msg} />}
        </div>

        {}
        {reactions && reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(msg, r.emoji);
                }}
                title={r.mine ? t("Убрать свою реакцию") : t("Поставить такую же")}
                className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
                  r.mine
                    ? mine
                      ? "bg-bg/25 text-bg"
                      : "bg-accent/20 text-accent"
                    : mine
                    ? "bg-bg/10 text-bg/80 hover:bg-bg/20"
                    : "bg-bg/60 text-muted hover:bg-bg"
                }`}
              >
                <Twemoji text={r.emoji} />
                {r.count > 1 && <span className="tabular-nums">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {!mine && !selecting && (
        <ReactionPicker current={myReaction(reactions)} onPick={(e) => onReact(msg, e)} />
      )}
    </div>
  );
});

const Composer = memo(function Composer({
  username,
  sending,
  reply,
  onSubmit,
  onTyping,
  onCancelReply,
}: {
  username: string;
  sending: boolean;
  reply: ReplyTarget | null;
  onSubmit: (text: string) => void | Promise<void>;
  onTyping?: () => void;
  onCancelReply: () => void;
}) {

  useLang();
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const over = draft.length > MAX_MESSAGE;

  useEffect(() => {
    if (reply) area.current?.focus();
  }, [reply]);

  const insert = (emoji: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : draft.length;
    setDraft((d) => d.slice(0, at) + emoji + d.slice(el ? el.selectionEnd : d.length));

    requestAnimationFrame(() => {
      el?.focus();
      const pos = at + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    void onSubmit(text);
  };

  return (
    <div className="border-t border-border/70 px-5 py-3">
      {}
      {reply && (
        <div className="msg-in mb-2 flex items-center gap-2 rounded-lg border-l-2 border-accent bg-card/70 px-2.5 py-1.5">
          <i className="fa-solid fa-reply text-[10px] text-accent" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[11px] font-semibold text-accent">{reply.author}</div>
            <div className="truncate text-[11px] text-muted">{reply.text || "…"}</div>
          </div>
          <button
            onClick={onCancelReply}
            title={t("Отменить ответ")}
            className="shrink-0 text-muted transition-colors hover:text-text"
          >
            <i className="fa-solid fa-xmark text-xs" />
          </button>
        </div>
      )}
      <div className="relative flex items-end gap-2">
        <textarea
          ref={area}
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);

            if (e.target.value.trim()) onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && reply) {
              e.preventDefault();
              onCancelReply();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("Сообщение для {name}", { name: username })}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => setPicker((v) => !v)}
          title={t("Эмодзи")}
          className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl transition-colors ${
            picker ? "text-accent" : "text-muted hover:text-text"
          }`}
        >
          <i className="fa-regular fa-face-smile text-base" />
        </button>
        {picker && (
          <EmojiPicker onPick={insert} onClose={() => setPicker(false)} />
        )}
        <button
          onClick={submit}
          disabled={!draft.trim() || over}
          title={t("Отправить")}
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-accent text-bg transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <i className="fa-solid fa-paper-plane text-sm" />
        </button>
      </div>
      {over && (
        <div className="mt-1.5 text-[11px] text-[#fca5a5]">
          {t("Слишком длинное: {n} из {max}", { n: draft.length, max: MAX_MESSAGE })}
        </div>
      )}
    </div>
  );
});

export default function ChatPanel({ friend }: { friend: Friend }) {
  const { t } = useLang();
  const conv = useConversation(friend.id);
  const typing = useTyping(friend.id);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [forward, setForward] = useState<string[] | null>(null);
  const [profile, setProfile] = useState(false);
  const toast = useToast();

  const scroller = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const wasAtBottom = useRef(true);

  const mountAt = useRef(Date.now());

  const keepHeight = useRef<number | null>(null);

  const [myName, setMyName] = useState(t("Вы"));
  useEffect(() => {
    void getAccounts()
      .then((acc) => {
        const me = acc.accounts.find((a) => a.id === acc.active);
        if (me) setMyName(me.aciron_name || me.username);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setReply(null);
    setOpenConversation(friend.id);
    void openConversation(friend.id);

    setSelected(new Set());
    return () => setOpenConversation(null);
  }, [friend.id]);

  const prevHeight = useRef(0);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepHeight.current !== null) {
      el.scrollTop = el.scrollHeight - keepHeight.current;
      keepHeight.current = null;
      prevHeight.current = el.scrollHeight;
      return;
    }
    if (!wasAtBottom.current) {
      prevHeight.current = el.scrollHeight;
      return;
    }

    const grew = el.scrollHeight - prevHeight.current;
    prevHeight.current = el.scrollHeight;

    const smooth = grew > 0 && grew < 320;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [conv.messages]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (el.scrollTop < 40 && conv.more && !conv.loading) {
      keepHeight.current = el.scrollHeight;
      void loadOlder(friend.id);
    }
  };

  const submit = useCallback(
    async (text: string) => {
      if (!text || sending) return;
      setSending(true);
      wasAtBottom.current = true;

      const body = reply ? encodeReply(reply.author, reply.text, text) : text;
      setReply(null);
      try {
        await send(friend.id, body);
      } catch {
        toast(t("Сообщение не отправлено"), "error");
      } finally {
        setSending(false);
      }
    },
    [friend.id, reply, sending, toast]
  );

  const startReply = useCallback(
    (msg: LocalMessage) => {
      const shown = parseForward(msg.body);
      const author = msg.from === friend.id ? friend.username : myName;
      setReply({
        id: msg.id,
        author,
        text: parseReply(shown.text).text.replace(/\s+/g, " ").trim(),
      });
    },
    [friend.id, friend.username, myName]
  );

  const copy = useCallback(
    (ids: string[]) => {
      const text = conv.messages
        .filter((m) => ids.includes(m.id))
        .map((m) => m.body)
        .join("\n");
      void navigator.clipboard.writeText(text);
      toast(ids.length > 1 ? t("Сообщения скопированы") : t("Скопировано"), "success");
    },
    [conv.messages, toast]
  );

  const del = useCallback(
    async (ids: string[]) => {
      try {
        const n = await remove(friend.id, ids);
        setSelected(new Set());
        if (n === 0) toast(t("Удалять можно только свои сообщения"), "error");
      } catch (e) {
        toast(ts(String(e)), "error");
      }
    },
    [friend.id, toast]
  );

  const openMenu = useCallback((e: React.MouseEvent, msg: LocalMessage) => {
    e.preventDefault();

    const ids = selected.has(msg.id) ? [...selected] : [msg.id];
    const mine = msg.from !== friend.id;
    const items: MenuItem[] = [
      { icon: "fa-reply", label: t("Ответить"), onClick: () => startReply(msg) },
      { icon: "fa-copy", label: ids.length > 1 ? t("Копировать выбранные") : t("Копировать"), onClick: () => copy(ids) },
      { icon: "fa-share", label: t("Переслать"), onClick: () => setForward(ids) },
      {
        icon: "fa-check-double",
        label: selected.has(msg.id) ? t("Снять выделение") : t("Выделить"),
        onClick: () =>
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(msg.id)) n.delete(msg.id);
            else n.add(msg.id);
            return n;
          }),
      },
    ];
    if (msg.state === "failed") {
      items.push({
        icon: "fa-rotate-right",
        label: t("Отправить снова"),
        onClick: () => void retry(friend.id, msg.id).catch(() => toast(t("Снова не вышло"), "error")),
      });
      items.push({ icon: "fa-xmark", label: t("Убрать"), danger: true, onClick: () => discard(friend.id, msg.id) });
    } else if (mine) {
      items.push({
        icon: "fa-trash",
        label: ids.length > 1 ? t("Удалить ({n})", { n: ids.length }) : t("Удалить"),
        danger: true,
        onClick: () => void del(ids),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, [selected, friend.id, copy, del, startReply, toast]);

  const onToggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selecting = selected.size > 0;

  const { visible, reactions } = useMemo(
    () => splitReactions(conv.messages, friend.id),
    [conv.messages, friend.id]
  );

  const onReact = useCallback(
    (msg: LocalMessage, emoji: string) => {
      void react(friend.id, msg.id, emoji, myReaction(reactions[msg.id])).catch((e) =>
        toast(ts(String(e)), "error")
      );
    },
    [friend.id, reactions, toast]
  );

  const rows = useMemo(
    () =>
      visible.map((m, i) => {
        const prev = visible[i - 1];
        const mine = m.from !== friend.id;

        const prevMine = prev ? prev.from !== friend.id : false;
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
        const grouped =
          !newDay && !!prev && prevMine === mine && m.at - prev.at < GROUP_WINDOW_MS;
        return { m, mine, newDay, grouped };
      }),
    [visible, friend.id]
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {}
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <button
          onClick={() => setProfile(true)}
          title={t("Открыть профиль")}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Head
            skin={friendSkinUrl(friend)}
            name={friend.username}
            size={36}
            className="shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text hover:text-accent">
                {friend.username}
              </span>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: PRESENCE_COLOR[friend.presence.state] }}
              />
            </div>
            <div className="truncate text-[11px]">
              {typing ? (
                <TypingDots />
              ) : (
                <span className="text-muted">{presenceText(friend.presence)}</span>
              )}
            </div>
          </div>
        </button>

        {selecting && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 text-[11px] text-muted">
              {t("Выбрано: {n}", { n: selected.size })}
            </span>
            <button
              onClick={() => copy([...selected])}
              title={t("Копировать")}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-copy text-xs" />
            </button>
            <button
              onClick={() => setForward([...selected])}
              title={t("Переслать")}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-share text-xs" />
            </button>
            <button
              onClick={() => void del([...selected])}
              title={t("Удалить свои из выбранных")}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-[#f87171]"
            >
              <i className="fa-solid fa-trash text-xs" />
            </button>
            <button
              onClick={() => setSelected(new Set())}
              title={t("Снять выделение")}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>
        )}
      </div>

      {}
      {}
      <div
        ref={scroller}
        onScroll={onScroll}
        style={{ overflowAnchor: "none" }}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
      >
        {conv.loading && conv.messages.length === 0 && <MessagesSkeleton />}
        {conv.error && (
          <div className="rounded-xl bg-[#ef4444]/10 px-4 py-3 text-xs text-[#fca5a5]">
            {conv.error}
          </div>
        )}
        {!conv.loading && conv.messages.length === 0 && !conv.error && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <i className="fa-regular fa-comments mb-3 block text-3xl text-muted/50" />
              <div className="text-sm text-muted">
                {t("Здесь пока пусто. Напишите {who} первым.", { who: friend.username })}
              </div>
            </div>
          </div>
        )}

        {conv.more && conv.messages.length > 0 && (
          <div className="pb-2 text-center text-[11px] text-muted">
            {conv.loading ? (
              <>
                {t("Загружаем")}
                <LoadingDots className="ml-1" />
              </>
            ) : (
              t("Прокрутите вверх, чтобы показать раннее")
            )}
          </div>
        )}

        {rows.map(({ m, mine, newDay, grouped }) => (
          <div
            key={m.localId ?? m.id}
            className={m.at >= mountAt.current ? "msg-in" : undefined}
          >
            {newDay && (
              <div className="my-3 text-center text-[11px] text-muted">{dayLabel(m.at)}</div>
            )}
            <Bubble
              msg={m}
              mine={mine}
              grouped={grouped}
              selected={selected.has(m.id)}
              selecting={selecting}
              onToggle={onToggle}
              onMenu={openMenu}
              onReply={startReply}
              reactions={reactions[m.id]}
              onReact={onReact}
            />
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {}
      <Composer
        key={friend.id}
        username={friend.username}
        sending={sending}
        reply={reply}
        onSubmit={submit}
        onTyping={() => notifyTyping(friend.id)}
        onCancelReply={() => setReply(null)}
      />

      {menu && <MessageMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {forward && (
        <ForwardModal
          count={forward.length}
          onClose={() => setForward(null)}
          onPick={async (to) => {
            const msgs = conv.messages.filter((m) => forward.includes(m.id));
            setForward(null);
            setSelected(new Set());

            try {
              for (const m of msgs) {

                const author = m.from === friend.id ? friend.username : myName;
                await send(to, encodeForward(author, m.body));
              }
              toast(t("Переслано: {n}", { n: msgs.length }), "success");
            } catch (e) {
              toast(ts(String(e)), "error");
            }
          }}
        />
      )}
      {profile && (
        <ProfileModal userId={friend.id} username={friend.username} onClose={() => setProfile(false)} />
      )}
    </section>
  );
}
