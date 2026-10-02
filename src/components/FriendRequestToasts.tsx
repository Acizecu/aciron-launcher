import { useEffect, useRef, useState } from "react";
import { useFriends } from "../friends";
import { playNotification } from "../sound";
import type { PendingUser } from "../api";

export function useFriendRequestQueue(sound: boolean, nextSeq: () => number) {
  const { data } = useFriends();

  const dnd = data?.me?.status === "dnd";
  const [queue, setQueue] = useState<{ user: PendingUser; seq: number }[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) {
      seen.current = null;
      return;
    }
    const ids = new Set(data.incoming.map((u) => u.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = data.incoming.filter((u) => !seen.current!.has(u.id));
    seen.current = ids;
    if (fresh.length === 0) return;

    if (dnd) return;

    setQueue((q) => [
      ...q,
      ...fresh.filter((u) => !q.some((x) => x.user.id === u.id)).map((user) => ({ user, seq: nextSeq() })),
    ]);
    playNotification(sound);
  }, [data, sound, dnd]);

  return {
    queue,
    drop: (id: string) => setQueue((q) => q.filter((x) => x.user.id !== id)),
  };
}
