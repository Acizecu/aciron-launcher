import { useEffect, useRef, useState } from "react";
import FriendRequestToast from "./FriendRequestToast";
import { useFriends } from "../friends";
import { playNotification } from "../sound";
import type { PendingUser } from "../api";

export default function FriendRequestToasts({ sound }: { sound: boolean }) {
  const { data } = useFriends();

  const dnd = data?.me?.status === "dnd";
  const [queue, setQueue] = useState<PendingUser[]>([]);
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

    setQueue((q) => [...q, ...fresh.filter((u) => !q.some((x) => x.id === u.id))]);
    playNotification(sound);
  }, [data, sound, dnd]);

  if (queue.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-4 top-14 z-[60] flex flex-col gap-2">
      {queue.map((u) => (
        <FriendRequestToast
          key={u.id}
          user={u}
          onDone={() => setQueue((q) => q.filter((x) => x.id !== u.id))}
        />
      ))}
    </div>
  );
}
