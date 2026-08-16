import { useEffect, useState } from "react";
import Modal from "./Modal";
import ConfirmModal from "./ConfirmModal";
import ActionMenu from "./ActionMenu";
import PlayerView from "./wardrobe/PlayerView";
import {
  ACIRON_ID_API,
  friendBlock,
  friendProfile,
  friendRemove,
  type FriendProfile,
} from "../api";
import { PRESENCE_COLOR, presenceText } from "../friends";
import { isMuted, onMutesChange, toggleMuted } from "../mutes";
import { useToast } from "../ToastContext";
import { dtf, t, ts } from "../i18n";

function playtime(secs: number): string {
  if (secs < 60) return t("меньше минуты");
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return t("{m} мин", { m });
  return m === 0 ? t("{h} ч", { h }) : t("{h} ч {m} мин", { h, m });
}

const joined = (ms: number) =>
  dtf({ day: "numeric", month: "long", year: "numeric" }).format(ms);

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
  onBlocked,
  onClose,
}: {
  userId: string;
  username: string;
  onBlocked?: () => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<FriendProfile | null>(null);
  const [error, setError] = useState("");
  const [muted, setMutedState] = useState(() => isMuted(userId));
  const [confirm, setConfirm] = useState<"block" | "remove" | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => onMutesChange(() => setMutedState(isMuted(userId))), [userId]);

  const name = p?.username ?? username;

  const part = async (kind: "block" | "remove") => {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === "block") {
        await friendBlock(userId);
        toast(t("{name} в чёрном списке", { name }), "success");
      } else {
        await friendRemove(userId);
        toast(t("{name} удалён из друзей", { name }), "success");
      }
      setConfirm(null);
      onBlocked?.();
      onClose();
    } catch (e) {
      toast(ts(String(e)), "error");
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    friendProfile(userId)
      .then((data) => alive && setP(data))
      .catch((e) => alive && setError(ts(String(e))));
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
              {muted && (
                <i
                  className="fa-solid fa-bell-slash shrink-0 text-[11px] text-muted"
                  title={t("Уведомления заглушены")}
                />
              )}
              <ActionMenu
                className="ml-auto"
                title={t("Действия")}
                items={[
                  {
                    icon: muted ? "fa-bell" : "fa-bell-slash",
                    label: muted ? t("Включить уведомления") : t("Заглушить"),
                    onClick: () => setMutedState(toggleMuted(userId)),
                  },
                  {
                    icon: "fa-user-minus",
                    label: t("Удалить из друзей"),
                    onClick: () => setConfirm("remove"),
                    danger: true,
                  },
                  {
                    icon: "fa-ban",
                    label: t("В чёрный список"),
                    onClick: () => setConfirm("block"),
                    danger: true,
                  },
                ]}
              />
            </div>
            <div className="text-xs text-muted">{presenceText(p.presence)}</div>

            <div className="mt-2 grid gap-2">
              {}
              <Stat
                label={t("Наиграно")}
                value={
                  p.totalPlaytimeSecs === null ? t("Скрыто") : playtime(p.totalPlaytimeSecs)
                }
              />
              <Stat
                label={t("С нами с")}
                value={p.createdAt === null ? t("Скрыто") : joined(p.createdAt)}
              />
              <Stat
                label={t("Облик")}
                value={
                  p.hasSkin
                    ? p.hasCape
                      ? t("Свой скин и плащ")
                      : t("Свой скин")
                    : p.hasCape
                    ? t("Свой плащ")
                    : t("Стандартный")
                }
              />
            </div>

          </div>
        </div>
      )}

      {confirm === "block" && (
        <ConfirmModal
          title={t("В чёрный список")}
          message={t(
            "Заблокировать {name}? Он пропадёт из друзей, и вы перестанете получать друг от друга сообщения и заявки.",
            { name },
          )}
          confirmLabel={t("Заблокировать")}
          confirmIcon="fa-ban"
          onConfirm={() => void part("block")}
          onClose={() => setConfirm(null)}
        />
      )}

      {confirm === "remove" && (
        <ConfirmModal
          title={t("Удалить из друзей")}
          message={t("Удалить {name} из друзей? Переписка останется, но заново добавить придётся по заявке.", {
            name,
          })}
          confirmLabel={t("Удалить")}
          confirmIcon="fa-user-minus"
          onConfirm={() => void part("remove")}
          onClose={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}
