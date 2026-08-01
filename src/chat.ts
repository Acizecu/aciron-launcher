
import { useSyncExternalStore } from "react";
import {
  cachePeek,
  cacheSet,
  chatDelete,
  chatHistory,
  chatMarkRead,
  chatOverview,
  chatSend,
  isTauri,
  type ChatMessage,
} from "./api";

export type SendState = "sending" | "failed";

export type LocalMessage = ChatMessage & {

  state?: SendState;
};

export type Conversation = {
  messages: LocalMessage[];

  more: boolean;
  loading: boolean;
  error: string;
};

const EMPTY: Conversation = { messages: [], more: false, loading: false, error: "" };

const key = (userId: string) => `chat:${userId}`;

const PAGE = 50;

type State = {

  byUser: Record<string, Conversation>;

  unread: Record<string, number>;

  last: Record<string, number>;
};

let state: State = { byUser: {}, unread: {}, last: {} };
const subs = new Set<() => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  for (const f of subs) f();
}

function patch(userId: string, conv: Partial<Conversation>) {
  const prev = state.byUser[userId] ?? EMPTY;
  const next = { ...prev, ...conv };
  emit({ byUser: { ...state.byUser, [userId]: next } });

  if (conv.messages) {
    cacheSet(
      key(userId),
      next.messages.filter((m) => !m.state).slice(-PAGE)
    );
  }
}

function touch(userId: string, at: number) {
  if ((state.last[userId] ?? 0) >= at) return;
  emit({ last: { ...state.last, [userId]: at } });
}

let openWith: string | null = null;

export function setOpenConversation(userId: string | null) {
  openWith = userId;
  if (userId) {

    if (state.unread[userId]) {
      const rest = { ...state.unread };
      delete rest[userId];
      emit({ unread: rest });
    }
    void chatMarkRead(userId).catch(() => {});
  }
}

export async function openConversation(userId: string): Promise<void> {
  const cached = cachePeek<LocalMessage[]>(key(userId));
  const conv = state.byUser[userId];
  const known = conv?.messages.length ? conv.messages : cached ?? [];

  patch(userId, {
    messages: known,

    loading: known.length === 0,
    error: "",
  });

  try {
    const fresh = await chatHistory(userId);

    const pending = (state.byUser[userId]?.messages ?? []).filter((m) => m.state);
    patch(userId, {
      messages: [...fresh, ...pending],
      more: fresh.length >= PAGE,
      loading: false,
      error: "",
    });
  } catch (e) {
    patch(userId, { loading: false, error: String(e).replace(/^Error:\s*/, "") });
  }
}

export async function loadOlder(userId: string): Promise<void> {
  const conv = state.byUser[userId];
  if (!conv || conv.loading || !conv.more || conv.messages.length === 0) return;
  patch(userId, { loading: true });
  try {
    const older = await chatHistory(userId, conv.messages[0].id);
    patch(userId, {
      messages: [...older, ...conv.messages],
      more: older.length >= PAGE,
      loading: false,
    });
  } catch (e) {
    patch(userId, { loading: false, error: String(e).replace(/^Error:\s*/, "") });
  }
}

const tempId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function send(userId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;

  const conv = state.byUser[userId];
  const temp: LocalMessage | null = conv
    ? {
        id: tempId(),
        from: "",
        to: userId,
        body: text,
        at: Date.now(),
        read: false,
        state: "sending",
      }
    : null;
  if (conv && temp) patch(userId, { messages: [...conv.messages, temp] });

  touch(userId, Date.now());

  try {
    const real = await chatSend(userId, text);
    if (temp) replaceTemp(userId, temp.id, real);
  } catch (e) {
    if (temp) setState(userId, temp.id, "failed");
    throw e;
  }
}

export async function retry(userId: string, tempMessageId: string): Promise<void> {
  const conv = state.byUser[userId];
  const msg = conv?.messages.find((m) => m.id === tempMessageId);
  if (!msg || msg.state !== "failed") return;
  setState(userId, tempMessageId, "sending");
  try {
    const real = await chatSend(userId, msg.body);
    replaceTemp(userId, tempMessageId, real);
  } catch (e) {
    setState(userId, tempMessageId, "failed");
    throw e;
  }
}

export function discard(userId: string, tempMessageId: string) {
  const conv = state.byUser[userId];
  if (!conv) return;
  patch(userId, { messages: conv.messages.filter((m) => m.id !== tempMessageId) });
}

function setState(userId: string, id: string, s: SendState) {
  const conv = state.byUser[userId];
  if (!conv) return;
  patch(userId, {
    messages: conv.messages.map((m) => (m.id === id ? { ...m, state: s } : m)),
  });
}

function replaceTemp(userId: string, tempMessageId: string, real: ChatMessage) {
  const conv = state.byUser[userId];
  if (!conv) return;

  const already = conv.messages.some((m) => m.id === real.id);
  patch(userId, {
    messages: already
      ? conv.messages.filter((m) => m.id !== tempMessageId)
      : conv.messages.map((m) => (m.id === tempMessageId ? { ...real } : m)),
  });
}

export async function remove(userId: string, ids: string[]): Promise<number> {

  const local = ids.filter((id) => id.startsWith("tmp-"));
  for (const id of local) discard(userId, id);

  const remote = ids.filter((id) => !id.startsWith("tmp-"));
  if (remote.length === 0) return local.length;

  const done = await chatDelete(remote);
  dropIds(done);
  return done.length + local.length;
}

function dropIds(ids: string[]) {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  const next: Record<string, Conversation> = {};
  for (const [uid, conv] of Object.entries(state.byUser)) {
    const kept = conv.messages.filter((m) => !gone.has(m.id));
    next[uid] = kept.length === conv.messages.length ? conv : { ...conv, messages: kept };
    if (kept.length !== conv.messages.length) {
      cacheSet(key(uid), kept.filter((m) => !m.state).slice(-PAGE));
    }
  }
  emit({ byUser: next });
}

function append(other: string, msg: ChatMessage) {
  const conv = state.byUser[other];

  if (!conv) return;

  if (conv.messages.some((m) => m.id === msg.id)) return;
  patch(other, { messages: [...conv.messages, msg] });
}

function receive(other: string, msg: ChatMessage) {
  append(other, msg);

  touch(other, msg.at);

  const incoming = msg.from === other;
  if (!incoming) return;
  if (openWith === other) {

    void chatMarkRead(other).catch(() => {});
    return;
  }
  emit({ unread: { ...state.unread, [other]: (state.unread[other] ?? 0) + 1 } });
}

function markTheirsRead(byUserId: string) {
  const conv = state.byUser[byUserId];
  if (!conv) return;
  patch(byUserId, { messages: conv.messages.map((m) => ({ ...m, read: true })) });
}

let unlisten: (() => void) | undefined;

const arrivals = new Set<(m: ChatMessage, from: string) => void>();

export function onMessage(cb: (m: ChatMessage, from: string) => void): () => void {
  arrivals.add(cb);
  return () => arrivals.delete(cb);
}

function listen(): () => void {
  if (!isTauri) return () => {};
  let dead = false;
  const offs: (() => void)[] = [];
  void (async () => {
    const { listen: on } = await import("@tauri-apps/api/event");
    const a = await on<{ with: string; message: ChatMessage }>("chat-message", (e) => {
      const { with: other, message } = e.payload;
      receive(other, message);

      if (message.from === other) for (const cb of arrivals) cb(message, other);
    });
    const b = await on<string>("chat-read", (e) => markTheirsRead(e.payload));
    const c = await on<string[]>("chat-deleted", (e) => dropIds(e.payload ?? []));
    if (dead) {
      a();
      b();
      c();
    } else {
      offs.push(a, b, c);
    }
  })();
  return () => {
    dead = true;
    for (const off of offs) off();
  };
}

function start() {
  unlisten = listen();

  void chatOverview()
    .then(({ unread, last }) => emit({ unread, last }))
    .catch(() => {});
}

function stop() {
  unlisten?.();
  unlisten = undefined;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) start();
  return () => {
    subs.delete(cb);
    if (subs.size === 0) stop();
  };
}

export function useChat(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state
  );
}

export function useConversation(userId: string): Conversation {
  const s = useChat();
  return s.byUser[userId] ?? EMPTY;
}
