

const KEY = "aciron:muted";

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {

  }
  return new Set();
}

let muted = read();

const subs = new Set<() => void>();

export function onMutesChange(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function isMuted(userId: string): boolean {
  return muted.has(userId);
}

export function mutedIds(): string[] {
  return [...muted];
}

export function setMuted(userId: string, on: boolean) {
  const next = new Set(muted);
  if (on) next.add(userId);
  else next.delete(userId);
  muted = next;
  localStorage.setItem(KEY, JSON.stringify([...next]));
  for (const cb of subs) cb();
}

export function toggleMuted(userId: string): boolean {
  const on = !isMuted(userId);
  setMuted(userId, on);
  return on;
}
