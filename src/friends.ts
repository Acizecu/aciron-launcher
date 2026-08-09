
import { useSyncExternalStore } from "react";
import { dtf, t, ts } from "./i18n";
import {
  cachePeek,
  friendsList,
  isTauri,
  type FriendPresence,
  type FriendsData,
  type PresenceState,
} from "./api";

const POLL_MS = 90_000;

export type FriendsSnapshot = {
  data: FriendsData | null;

  error: string;
  loading: boolean;
};

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
    const msg = ts(String(e));

    emit({ data: msg === "NO_ACIRON" ? null : snap.data, error: msg, loading: false });
  } finally {
    inflight = false;
  }
}

export function refreshFriends() {
  void fetchOnce();
}

export function patchFriends(fn: (d: FriendsData) => FriendsData): FriendsData | null {
  if (!snap.data) return null;
  const prev = snap.data;

  emit({ data: fn(prev) });
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

function listenRealtime(): () => void {
  if (!isTauri) return () => {};
  let dead = false;
  let un: (() => void) | undefined;
  void (async () => {
    const { listen } = await import("@tauri-apps/api/event");

    const fn = await listen("friends-changed", () => void fetchOnce());
    if (dead) fn();
    else un = fn;
  })();
  return () => {
    dead = true;
    un?.();
  };
}

let unlistenRealtime: (() => void) | undefined;

function start() {
  void fetchOnce();

  timer = setInterval(() => {
    if (!document.hidden) void fetchOnce();
  }, POLL_MS);
  window.addEventListener("aciron-account", onAccount);
  window.addEventListener("focus", onFocus);
  unlistenRealtime = listenRealtime();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("aciron-account", onAccount);
  window.removeEventListener("focus", onFocus);
  unlistenRealtime?.();
  unlistenRealtime = undefined;
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

function lastSeenText(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return t("только что");
  if (mins < 60) return t("{n} мин. назад", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("{n} ч. назад", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("вчера");
  if (days < 7) return t("{n} дн. назад", { n: days });
  return dtf({ day: "numeric", month: "long" }).format(at);
}

export function presenceText(p: FriendPresence): string {
  if (p.state === "offline") {
    return p.lastSeen ? t("Был в сети {when}", { when: lastSeenText(p.lastSeen) }) : t("Не в сети");
  }
  if (p.inGame) {
    if (p.server) return t("На сервере {server}", { server: p.server });
    if (p.buildName) return t("Играет: {name}", { name: p.buildName });
    if (p.mcVersion) return t("Играет в {version}", { version: p.mcVersion });
    return t("В игре");
  }
  if (p.state === "dnd") return t("Не беспокоить");
  if (p.state === "idle") return t("Нет на месте");
  return p.inLauncher ? t("В лаунчере") : t("В сети");
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

