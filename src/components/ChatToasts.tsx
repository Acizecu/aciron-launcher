import { useEffect, useMemo, useRef, useState } from "react";
import { ContactAvatar, isVerified, PlusMark, VerifiedMark } from "./ContactAvatar";
import { type ChatMessage, type Friend } from "../api";
import { onMessage, parseForward, parseReply } from "../chat";
import NotifyStack, { type StackEntry } from "./NotifyStack";
import FriendRequestToast from "./FriendRequestToast";
import { useFriendRequestQueue } from "./FriendRequestToasts";
import { useWindowFocused } from "../windowFocus";
import { contacts, useFriends } from "../friends";
import { playNotification } from "../sound";
import { cardInDelay } from "../anim";
import { isMuted } from "../mutes";
import { useLang } from "../i18n";

const LIFE_MS = 6000;
const SLIDE_MS = 220;

type Item = { key: number; msg: ChatMessage; from: string; seq: number };

function Toast({
  item,
  friend,
  onOpen,
  onDone,
  hold,
}: {
  item: Item;
  friend: Friend | undefined;
  onOpen: () => void;
  onDone: () => void;

  hold: boolean;
}) {

  const { t } = useLang();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (hold) return;
    const t = window.setTimeout(() => {
      setShown(false);
      window.setTimeout(onDone, SLIDE_MS);
    }, LIFE_MS);
    return () => window.clearTimeout(t);
  }, [hold]);

  const preview = parseReply(parseForward(item.msg.body).text).text.trim();

  return (
    <button
      onClick={onOpen}
      style={{
        transition: `transform ${SLIDE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SLIDE_MS}ms`,
        transform: shown ? "translateX(0)" : "translateX(-120%)",
        opacity: shown ? 1 : 0,
        animationDelay: `${cardInDelay(0)}ms`,
      }}
      className="pointer-events-auto flex w-full items-start gap-2.5 rounded-[16px] bg-popover shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] p-2.5 text-left"
    >
      {}
      <ContactAvatar
        c={friend ?? { username: "?", hasSkin: false }}
        size={32}
        className="shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium text-text">
            {friend?.username ?? t("Новое сообщение")}
          </span>
          {isVerified(friend) && <VerifiedMark className="text-[9px]" />}
          {friend?.plus && <PlusMark small />}
        </div>
        {}
        <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">
          {preview || (item.msg.attachments?.length ? t("Картинка") : "")}
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
  const [hovered, setHovered] = useState(false);
  const focused = useWindowFocused();
  const hold = hovered || !focused;

  const seq = useRef(0);
  const requests = useFriendRequestQueue(sound, () => ++seq.current);

  const [barBottom, setBarBottom] = useState(0);
  const { data } = useFriends();

  const dnd = data?.me?.status === "dnd";

  const byId = useMemo(() => {
    const m = new Map<string, Friend>();
    for (const f of contacts(data)) m.set(f.id, f);
    return m;
  }, [data]);

  useEffect(() => {
    let n = 0;
    return onMessage((msg, from) => {

      if (dnd) return;

      if (isMuted(from)) return;
      setQueue((q) => [...q, { key: ++n, msg, from, seq: ++seq.current }]);
      playNotification(sound);
    });
  }, [sound, dnd]);

  useEffect(() => {
    const on = (e: Event) => setBarBottom(Number((e as CustomEvent).detail) || 0);
    window.addEventListener("aciron-announce-bar", on);
    return () => window.removeEventListener("aciron-announce-bar", on);
  }, []);

  const entries: (StackEntry & { seq: number })[] = [
    ...queue.map((it) => ({
      key: `m${it.key}`,
      seq: it.seq,
      node: (
        <Toast
          item={it}
          friend={byId.get(it.from)}
          hold={hold}
          onOpen={() => {
            onOpen(it.from);
            setQueue((q) => q.filter((x) => x.key !== it.key));
          }}
          onDone={() => setQueue((q) => q.filter((x) => x.key !== it.key))}
        />
      ),
    })),
    ...requests.queue.map((r) => ({
      key: `f${r.user.id}`,
      seq: r.seq,
      node: <FriendRequestToast user={r.user} hold={hold} onDone={() => requests.drop(r.user.id)} />,
    })),
  ].sort((a, b) => a.seq - b.seq);

  return (
    <NotifyStack
      entries={entries}
      width={300}
      onHoverChange={setHovered}
      style={barBottom > 0 ? { top: barBottom + 8 } : undefined}
      className="fixed left-4 top-14 z-[60]"
    />
  );
}
