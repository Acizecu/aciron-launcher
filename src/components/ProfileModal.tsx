import { useEffect, useState } from "react";
import Modal from "./Modal";
import PlayerView from "./wardrobe/PlayerView";
import { ACIRON_ID_API, friendProfile, type FriendProfile } from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";

function playtime(secs: number): string {
  if (secs < 60) return "меньше минуты";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

const joined = (ms: number) =>
  new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-text">{value}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex gap-4 p-5">
      <div className="h-[260px] w-[180px] shrink-0 animate-pulse rounded-xl bg-card" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="h-5 w-32 animate-pulse rounded bg-card" />
        <div className="h-3 w-24 animate-pulse rounded bg-card" />
        <div className="mt-2 h-14 animate-pulse rounded-xl bg-card" />
        <div className="h-14 animate-pulse rounded-xl bg-card" />
      </div>
    </div>
  );
}

export default function ProfileModal({
  userId,
  username,
  onClose,
}: {
  userId: string;
  username: string;
  onClose: () => void;
}) {
  const [p, setP] = useState<FriendProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    friendProfile(userId)
      .then((data) => alive && setP(data))
      .catch((e) => alive && setError(String(e).replace(/^Error:\s*/, "")));
    return () => {
      alive = false;
    };
  }, [userId]);

  const nick = (p?.username ?? username).toLowerCase();
  const skin = p?.hasSkin ? `${ACIRON_ID_API}/skins/${encodeURIComponent(nick)}.png` : "";
  const cape = p?.hasCape ? `${ACIRON_ID_API}/capes/${encodeURIComponent(nick)}.png` : null;

  return (
    <Modal title={p?.username ?? username} icon="fa-user" onClose={onClose}>
      {error ? (
        <div className="px-5 py-8 text-center text-sm text-muted">{error}</div>
      ) : !p ? (
        <Skeleton />
      ) : (
        <div className="flex gap-4 p-5">
          {}
          <div className="h-[260px] w-[180px] shrink-0 overflow-hidden rounded-xl bg-card/60">
            <PlayerView
              skinUrl={skin}
              capeUrl={cape}
              model={p.skinModel}
              className="h-full w-full"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-bold text-text">{p.username}</span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PRESENCE_COLOR[p.presence.state] }}
              />
            </div>
            <div className="text-xs text-muted">{presenceText(p.presence)}</div>

            <div className="mt-2 grid gap-2">
              <Stat label="Наиграно" value={playtime(p.totalPlaytimeSecs)} />
              <Stat label="С нами с" value={joined(p.createdAt)} />
              <Stat
                label="Облик"
                value={
                  p.hasSkin
                    ? p.hasCape
                      ? "Свой скин и плащ"
                      : "Свой скин"
                    : p.hasCape
                    ? "Свой плащ"
                    : "Стандартный"
                }
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
