import { useEffect, useMemo, useState } from "react";
import Head from "./Head";
import { friendSkinUrl, type ChatMessage, type Friend } from "../api";
import { onMessage, parseForward } from "../chat";
import { useFriends } from "../friends";
import { playNotification } from "../sound";
import { cardInDelay } from "../anim";

const LIFE_MS = 6000;
const SLIDE_MS = 220;

type Item = { key: number; msg: ChatMessage; from: string };

function Toast({
  item,
  friend,
  onOpen,
  onDone,
}: {
  item: Item;
  friend: Friend | undefined;
  onOpen: () => void;
  onDone: () => void;
}) {
  // Toast теперь презентационный: друг приходит пропсом из родителя (одна подписка
  // useFriends + один Map-lookup вместо подписки и .find() в КАЖДОМ тосте). Апдейт
  // списка друзей больше не ре-рендерит все активные тосты по отдельности.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const t = window.setTimeout(() => {
      setShown(false);
      window.setTimeout(onDone, SLIDE_MS);
    }, LIFE_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };

  }, []);

  return (
    <button
      onClick={onOpen}
      style={{
        transition: `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SLIDE_MS}ms`,
        transform: shown ? "translateX(0)" : "translateX(-120%)",
        opacity: shown ? 1 : 0,
        animationDelay: `${cardInDelay(0)}ms`,
      }}
      className="pointer-events-auto flex w-[280px] items-start gap-2.5 rounded-xl border border-border bg-panel p-2.5 text-left shadow-lg"
    >
      <Head
        skin={friend ? friendSkinUrl(friend) : ""}
        name={friend?.username ?? "?"}
        size={32}
        className="shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs font-semibold text-text">
          {friend?.username ?? "Новое сообщение"}
        </div>
        {}
        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">
          {parseForward(item.msg.body).text}
        </div>
      </div>
    </button>
  );
}

export default function ChatToasts({
  sound,
  onOpen,
}: {
  sound: boolean;
  onOpen: (userId: string) => void;
}) {
  const [queue, setQueue] = useState<Item[]>([]);
  const { data } = useFriends();
  // «Не беспокоить»: собственный статус присутствия dnd глушит всплывашки и звук.
  const dnd = data?.me?.status === "dnd";

  // Один раз строим индекс id→friend вместо линейного .find() в каждом тосте.
  const byId = useMemo(() => {
    const m = new Map<string, Friend>();
    for (const f of data?.friends ?? []) m.set(f.id, f);
    return m;
  }, [data?.friends]);

  useEffect(() => {
    let n = 0;
    return onMessage((msg, from) => {
      // «Не беспокоить»: не показываем всплывашку и не пищим.
      if (dnd) return;
      setQueue((q) => [...q, { key: ++n, msg, from }]);
      playNotification(sound);
    });
  }, [sound, dnd]);

  if (queue.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-4 top-14 z-[60] flex flex-col gap-2">
      {queue.map((it) => (
        <Toast
          key={it.key}
          item={it}
          friend={byId.get(it.from)}
          onOpen={() => {
            onOpen(it.from);
            setQueue((q) => q.filter((x) => x.key !== it.key));
          }}
          onDone={() => setQueue((q) => q.filter((x) => x.key !== it.key))}
        />
      ))}
    </div>
  );
}
