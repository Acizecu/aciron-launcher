import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Head from "./Head";
import ProfileModal from "./ProfileModal";
import MessageMenu, { type MenuItem } from "./chat/MessageMenu";
import ForwardModal from "./chat/ForwardModal";
import { friendSkinUrl, getAccounts, MAX_MESSAGE, type Friend } from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";
import {
  discard,
  encodeForward,
  loadOlder,
  notifyTyping,
  openConversation,
  parseForward,
  remove,
  retry,
  send,
  setOpenConversation,
  useConversation,
  useTyping,
  type LocalMessage,
} from "../chat";
import { useToast } from "../ToastContext";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Форматтеры Intl создаём один раз на модуль: toLocaleTimeString/toLocaleDateString
// заново конструируют форматтер на каждый вызов, а в списке они дёргаются N раз за
// рендер. Результат вывода идентичен прежним вызовам с теми же опциями.
const TIME_FMT = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

const time = (ms: number) => TIME_FMT.format(ms);

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Сегодня";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return "Вчера";
  return DATE_FMT.format(d);
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

// memo + стабильные пропсы: набор текста в composer'е больше не ре-рендерит список
// сообщений (draft вынесен в отдельный Composer ниже), а при легитимном ре-рендере
// панели перерисовываются только те Bubble, чьи пропсы реально изменились. Колбэки
// приходят из useCallback родителя и вызываются с msg.id/msg, поэтому идентичны по
// ссылке между рендерами — иначе memo был бы бесполезен.
const Bubble = memo(function Bubble({
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
  onToggle: (id: string) => void;
  onMenu: (e: React.MouseEvent, msg: LocalMessage) => void;
}) {
  // Разбор маркера пересылки: forwardedFrom → шапка «Переслано от…», text → тело.
  const fwd = parseForward(msg.body);
  return (
    <div
      onContextMenu={(e) => onMenu(e, msg)}
      onClick={() => selecting && onToggle(msg.id)}
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
        {fwd.forwardedFrom && (
          <div
            className={`mb-1 flex items-center gap-1 border-l-2 pl-1.5 text-[11px] ${
              mine ? "border-bg/40 text-bg/70" : "border-accent/50 text-muted"
            }`}
          >
            <i className="fa-solid fa-share text-[9px]" />
            Переслано от {fwd.forwardedFrom}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm leading-snug">{fwd.text}</div>
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
});

// Композер вынесен в отдельный компонент: draft живёт здесь, поэтому нажатия клавиш
// ре-рендерят только этот маленький компонент, а не весь ChatPanel со списком
// сообщений. onSubmit получает готовый текст, ввод/лимит считаются локально —
// поведение (Enter=отправить, Shift+Enter=перенос, дизейбл при пустом/переполнении,
// очистка после отправки) сохранено 1-в-1.
const Composer = memo(function Composer({
  username,
  sending,
  onSubmit,
  onTyping,
}: {
  username: string;
  sending: boolean;
  onSubmit: (text: string) => void | Promise<void>;
  onTyping?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const over = draft.length > MAX_MESSAGE;

  // Внимание: submit НЕ проверяет `over` — как и раньше, Enter отправляет даже
  // сообщение сверх лимита (лимитом заблокирована только кнопка). Поведение 1-в-1.
  const submit = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    void onSubmit(text);
  };

  return (
    <div className="border-t border-border/70 px-5 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);
            // Сообщаем собеседнику о наборе (внутри троттлинг ~2.5с).
            if (e.target.value.trim()) onTyping?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={`Сообщение для ${username}`}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={submit}
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
  );
});

export default function ChatPanel({ friend }: { friend: Friend }) {
  const conv = useConversation(friend.id);
  const typing = useTyping(friend.id);
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
    // draft теперь живёт в <Composer key={friend.id}>: смена собеседника ремонтит
    // композер и очищает поле ввода так же, как раньше делал setDraft("").
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

  const submit = useCallback(
    async (text: string) => {
      if (!text || sending) return;
      setSending(true);
      wasAtBottom.current = true;
      try {
        await send(friend.id, text);
      } catch {
        toast("Сообщение не отправлено", "error");
      } finally {
        setSending(false);
      }
    },
    [friend.id, sending, toast]
  );

  const copy = useCallback(
    (ids: string[]) => {
      const text = conv.messages
        .filter((m) => ids.includes(m.id))
        .map((m) => m.body)
        .join("\n");
      void navigator.clipboard.writeText(text);
      toast(ids.length > 1 ? "Сообщения скопированы" : "Скопировано", "success");
    },
    [conv.messages, toast]
  );

  const del = useCallback(
    async (ids: string[]) => {
      try {
        const n = await remove(friend.id, ids);
        setSelected(new Set());
        if (n === 0) toast("Удалять можно только свои сообщения", "error");
      } catch (e) {
        toast(String(e).replace(/^Error:\s*/, ""), "error");
      }
    },
    [friend.id, toast]
  );

  // useCallback, чтобы onMenu приходил в мемоизированный Bubble стабильной ссылкой.
  // Зависит от selected (меняет пункты/множество для действий) — при смене выделения
  // список ре-рендерится осознанно (нужно показать галочки), но не при наборе текста.
  const openMenu = useCallback((e: React.MouseEvent, msg: LocalMessage) => {
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
  }, [selected, friend.id, copy, del, toast]);

  // Стабильный переключатель выделения (функциональный setSelected → пустые deps),
  // передаётся мемоизированному Bubble по ссылке, поэтому не рушит memo.
  const onToggle = useCallback((id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selecting = selected.size > 0;

  // Группировку/подписи дня считаем один раз на изменение сообщений, а не N*3 раз
  // за каждый рендер панели: at сообщений неизменны, вывод чисто производный, поэтому
  // useMemo по conv.messages даёт тот же результат без пересчёта на посторонних
  // ре-рендерах (выделение, отправка). Логика newDay/grouped идентична прежней.
  const rows = useMemo(
    () =>
      conv.messages.map((m, i) => {
        const prev = conv.messages[i - 1];
        const mine = m.from !== friend.id;
        const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
        const grouped =
          !newDay && !!prev && prev.from === m.from && m.at - prev.at < GROUP_WINDOW_MS;
        return { m, mine, newDay, grouped };
      }),
    [conv.messages, friend.id]
  );

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
            <div className="truncate text-[11px]">
              {typing ? (
                <span className="text-accent">печатает…</span>
              ) : (
                <span className="text-muted">{presenceText(friend.presence)}</span>
              )}
            </div>
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

        {rows.map(({ m, mine, newDay, grouped }) => (
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
              onToggle={onToggle}
              onMenu={openMenu}
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
        onSubmit={submit}
        onTyping={() => notifyTyping(friend.id)}
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
            // Моё отображаемое имя (для пересылки СВОИХ сообщений) — один раз.
            let myName = "Вы";
            try {
              const acc = await getAccounts();
              const me = acc.accounts.find((a) => a.id === acc.active);
              if (me) myName = me.aciron_name || me.username;
            } catch {
              /* имя не критично — оставим «Вы» */
            }
            try {
              for (const m of msgs) {
                // Автор: сообщение собеседника → его ник; иначе моё → myName.
                // Пересылка пересланного сохранит ПЕРВОГО автора (encodeForward
                // не оборачивает уже помеченное тело повторно).
                const author = m.from === friend.id ? friend.username : myName;
                await send(to, encodeForward(author, m.body));
              }
              toast(`Переслано: ${msgs.length}`, "success");
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
