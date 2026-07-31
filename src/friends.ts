
import { useSyncExternalStore } from "react";
import { cachePeek, friendsList, type FriendPresence, type FriendsData, type PresenceState } from "./api";

const POLL_MS = 15_000;

export type FriendsSnapshot = {
  data: FriendsData | null;

  error: string;
  loading: boolean;
};

// Мгновенный старт из сохранённого кэша (переживает перезапуск лаунчера).
let snap: FriendsSnapshot = { data: cachePeek<FriendsData>("friends") ?? null, error: "", loading: false };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

function emit(patch: Partial<FriendsSnapshot>) {
  snap = { ...snap, ...patch };
  for (const f of subs) f();
}

async function fetchOnce() {
  if (inflight) return;
  inflight = true;
  if (!snap.data) emit({ loading: true });
  try {
    emit({ data: await friendsList(), error: "", loading: false });
  } catch (e) {
    const msg = String(e).replace(/^Error:\s*/, "");

    emit({ data: msg === "NO_ACIRON" ? null : snap.data, error: msg, loading: false });
  } finally {
    inflight = false;
  }
}

export function refreshFriends() {
  void fetchOnce();
}

/**
 * Оптимистичное изменение состояния друзей: мгновенно применяет мутацию к
 * локальному снапшоту и возвращает предыдущее состояние как токен отката.
 * Фоновый запрос вызывающий делает сам; при ошибке — restoreFriends(prev).
 */
export function patchFriends(fn: (d: FriendsData) => FriendsData): FriendsData | null {
  if (!snap.data) return null;
  const prev = snap.data;
  emit({ data: fn(structuredClone(prev)) });
  return prev;
}

export function restoreFriends(prev: FriendsData | null) {
  if (prev) emit({ data: prev });
}

const onAccount = () => {
  snap = { data: null, error: "", loading: true };
  for (const f of subs) f();
  void fetchOnce();
};
const onFocus = () => void fetchOnce();

function start() {
  void fetchOnce();

  timer = setInterval(() => {
    if (!document.hidden) void fetchOnce();
  }, POLL_MS);
  window.addEventListener("aciron-account", onAccount);
  window.addEventListener("focus", onFocus);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("aciron-account", onAccount);
  window.removeEventListener("focus", onFocus);
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) start();
  return () => {
    subs.delete(cb);
    if (subs.size === 0) stop();
  };
}

export function useFriends(): FriendsSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snap,
    () => snap
  );
}

export const PRESENCE_COLOR: Record<PresenceState, string> = {
  online: "#22c55e",
  idle: "#eab308",
  dnd: "#ef4444",
  offline: "#6b7280",
};

export function presenceText(p: FriendPresence): string {
  if (p.state === "offline") return "Не в сети";
  if (p.inGame) {
    if (p.server) return `На сервере ${p.server}`;
    if (p.buildName) return `Играет: ${p.buildName}`;
    if (p.mcVersion) return `Играет в ${p.mcVersion}`;
    return "В игре";
  }
  if (p.state === "dnd") return "Не беспокоить";
  if (p.state === "idle") return "Нет на месте";
  return p.inLauncher ? "В лаунчере" : "В сети";
}

const RANK: Record<PresenceState, number> = { online: 1, idle: 2, dnd: 3, offline: 4 };

export function sortFriends(list: FriendsData["friends"]): FriendsData["friends"] {
  return [...list].sort((a, b) => {
    const ga = a.presence.inGame ? 0 : RANK[a.presence.state];
    const gb = b.presence.inGame ? 0 : RANK[b.presence.state];
    if (ga !== gb) return ga - gb;
    return a.username.localeCompare(b.username);
  });
}

