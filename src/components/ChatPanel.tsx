import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Head from "./Head";
import ProfileModal from "./ProfileModal";
import MessageMenu, { type MenuItem } from "./chat/MessageMenu";
import ForwardModal from "./chat/ForwardModal";
import { friendSkinUrl, MAX_MESSAGE, type Friend } from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";
import {
  discard,
  loadOlder,
  openConversation,
  remove,
  retry,
  send,
  setOpenConversation,
  useConversation,
  type LocalMessage,
} from "../chat";
import { useToast } from "../ToastContext";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Сегодня";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function Ticks({ msg }: { msg: LocalMessage }) {
  if (msg.state === "sending") return <i className="fa-regular fa-clock" title="Отправляется" />;
  if (msg.state === "failed")
    return <i className="fa-solid fa-triangle-exclamation" title="Не отправлено" />;
  return (
    <i
      className={`fa-solid ${msg.read ? "fa-check-double" : "fa-check"}`}
      title={msg.read ? "Прочитано" : "Доставлено"}
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

function Bubble({
  msg,
  mine,
  grouped,
  selected,
  selecting,
  onToggle,
  onMenu,
}: {
  msg: LocalMessage;
  mine: boolean;
  grouped: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onMenu}
      onClick={() => selecting && onToggle()}
      className={`flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-2"} ${
        selecting ? "cursor-pointer" : ""
      } ${selected ? "rounded-lg bg-accent/10" : ""}`}
    >
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
        <div className="whitespace-pre-wrap break-words text-sm leading-snug">{msg.body}</div>
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            mine ? "text-bg/60" : "text-muted"
          }`}
        >
          {time(msg.at)}
          {mine && <Ticks msg={msg} />}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({ friend }: { friend: Friend }) {
  const conv = useConversation(friend.id);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [forward, setForward] = useState<string[] | null>(null);
  const [profile, setProfile] = useState(false);
  const toast = useToast();

  const scroller = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const wasAtBottom = useRef(true);

  const keepHeight = useRef<number | null>(null);

  useEffect(() => {
    setOpenConversation(friend.id);
    void openConversation(friend.id);
    setDraft("");
    setSelected(new Set());
    return () => setOpenConversation(null);
  }, [friend.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepHeight.current !== null) {
      el.scrollTop = el.scrollHeight - keepHeight.current;
      keepHeight.current = null;
      return;
    }
    if (wasAtBottom.current) bottom.current?.scrollIntoView({ block: "end" });
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

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);

    setDraft("");
    wasAtBottom.current = true;
    try {
      await send(friend.id, text);
    } catch {

      toast("Сообщение не отправлено", "error");
    } finally {
      setSending(false);
    }
  };

  const copy = (ids: string[]) => {
    const text = conv.messages
      .filter((m) => ids.includes(m.id))
      .map((m) => m.body)
      .join("\n");
    void navigator.clipboard.writeText(text);
    toast(ids.length > 1 ? "Сообщения скопированы" : "Скопировано", "success");
  };

  const del = async (ids: string[]) => {
    try {
      const n = await remove(friend.id, ids);
      setSelected(new Set());
      if (n === 0) toast("Удалять можно только свои сообщения", "error");
    } catch (e) {
      toast(String(e).replace(/^Error:\s*/, ""), "error");
    }
  };

  const openMenu = (e: React.MouseEvent, msg: LocalMessage) => {
    e.preventDefault();

    const ids = selected.has(msg.id) ? [...selected] : [msg.id];
    const mine = msg.from !== friend.id;
    const items: MenuItem[] = [
      { icon: "fa-copy", label: ids.length > 1 ? "Копировать выбранные" : "Копировать", onClick: () => copy(ids) },
      { icon: "fa-share", label: "Переслать", onClick: () => setForward(ids) },
      {
        icon: "fa-check-double",
        label: selected.has(msg.id) ? "Снять выделение" : "Выделить",
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
        label: "Отправить снова",
        onClick: () => void retry(friend.id, msg.id).catch(() => toast("Снова не вышло", "error")),
      });
      items.push({ icon: "fa-xmark", label: "Убрать", danger: true, onClick: () => discard(friend.id, msg.id) });
    } else if (mine) {
      items.push({
        icon: "fa-trash",
        label: ids.length > 1 ? `Удалить (${ids.length})` : "Удалить",
        danger: true,
        onClick: () => void del(ids),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const selecting = selected.size > 0;
  const over = draft.length > MAX_MESSAGE;

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {}
      <div className="flex items-center gap-3 border-b border-border/70 px-5 py-3">
        <button
          onClick={() => setProfile(true)}
          title="Открыть профиль"
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
            <div className="truncate text-[11px] text-muted">{presenceText(friend.presence)}</div>
          </div>
        </button>

        {selecting && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 text-[11px] text-muted">Выбрано: {selected.size}</span>
            <button
              onClick={() => copy([...selected])}
              title="Копировать"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-copy text-xs" />
            </button>
            <button
              onClick={() => setForward([...selected])}
              title="Переслать"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-accent"
            >
              <i className="fa-solid fa-share text-xs" />
            </button>
            <button
              onClick={() => void del([...selected])}
              title="Удалить свои из выбранных"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-[#f87171]"
            >
              <i className="fa-solid fa-trash text-xs" />
            </button>
            <button
              onClick={() => setSelected(new Set())}
              title="Снять выделение"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:text-text"
            >
              <i className="fa-solid fa-xmark text-xs" />
            </button>
          </div>
        )}
      </div>

      {}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
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
                Здесь пока пусто. Напишите {friend.username} первым.
              </div>
            </div>
          </div>
        )}

        {conv.more && conv.messages.length > 0 && (
          <div className="pb-2 text-center text-[11px] text-muted">
            {conv.loading ? "Загружаем…" : "Прокрутите вверх, чтобы показать раннее"}
          </div>
        )}

        {conv.messages.map((m, i) => {
          const prev = conv.messages[i - 1];
          const mine = m.from !== friend.id;
          const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
          const grouped =
            !newDay && !!prev && prev.from === m.from && m.at - prev.at < GROUP_WINDOW_MS;
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 text-center text-[11px] text-muted">{dayLabel(m.at)}</div>
              )}
              <Bubble
                msg={m}
                mine={mine}
                grouped={grouped}
                selected={selected.has(m.id)}
                selecting={selecting}
                onToggle={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(m.id)) n.delete(m.id);
                    else n.add(m.id);
                    return n;
                  })
                }
                onMenu={(e) => openMenu(e, m)}
              />
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {}
      <div className="border-t border-border/70 px-5 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={`Сообщение для ${friend.username}`}
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => void submit()}
            disabled={!draft.trim() || over}
            title="Отправить"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-accent text-bg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <i className="fa-solid fa-paper-plane text-sm" />
          </button>
        </div>
        {over && (
          <div className="mt-1.5 text-[11px] text-[#fca5a5]">
            Слишком длинное: {draft.length} из {MAX_MESSAGE}
          </div>
        )}
      </div>

      {menu && <MessageMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {forward && (
        <ForwardModal
          count={forward.length}
          onClose={() => setForward(null)}
          onPick={async (to) => {
            const texts = conv.messages.filter((m) => forward.includes(m.id)).map((m) => m.body);
            setForward(null);
            setSelected(new Set());
            try {

              for (const t of texts) await send(to, t);
              toast(`Переслано: ${texts.length}`, "success");
            } catch (e) {
              toast(String(e).replace(/^Error:\s*/, ""), "error");
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
