import { useEffect, useState } from "react";
import Head from "./Head";
import ConfirmModal from "./ConfirmModal";
import AddAccountModal from "./AddAccountModal";
import FriendSettingsModal, {
  loadFriendPrefs,
  STATUS_META,
  type FriendPrefs,
} from "./FriendSettingsModal";
import { useToast } from "../ToastContext";
import {
  friendCancel,
  friendRemove,
  friendRequest,
  friendRespond,
  friendSkinUrl,
  setPresencePrivacy,
  type Friend,
  type FriendsData,
  type PendingUser,
} from "../api";
import {
  patchFriends,
  PRESENCE_COLOR,
  presenceText,
  refreshFriends,
  restoreFriends,
  sortFriends,
  useFriends,
} from "../friends";

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;

function human(e: unknown): string {
  const m = String(e).replace(/^Error:\s*/, "");
  if (m === "SESSION_EXPIRED") return "Сессия Aciron ID истекла — войдите заново";
  if (m === "NO_ACIRON") return "Для друзей нужен вход в Aciron ID";
  return m;
}

function IconBtn({
  icon,
  title,
  color,
  onClick,
}: {
  icon: string;
  title: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg text-muted transition-colors hover:text-text"
      style={color ? { color } : undefined}
    >
      <i className={`fa-solid ${icon} text-xs`} />
    </button>
  );
}

function FriendRow({ f, onRemove }: { f: Friend; onRemove: () => void }) {
  const color = PRESENCE_COLOR[f.presence.state];
  const playing = f.presence.inGame;
  return (
    <div className="group flex items-center gap-3 rounded-xl bg-card p-2.5">
      <Head
        skin={friendSkinUrl(f)}
        name={f.username}
        size={40}
        className={`shrink-0 rounded-lg ${f.presence.state === "offline" ? "opacity-50" : ""}`}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text">{f.username}</span>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        </div>
        <div
          className="truncate text-[11px]"
          style={{ color: playing ? PRESENCE_COLOR.online : "var(--color-muted)" }}
          title={presenceText(f.presence)}
        >
          {presenceText(f.presence)}
        </div>
      </div>
      {}
      <div className="hidden group-hover:block">
        <IconBtn icon="fa-user-minus" title="Удалить из друзей" onClick={onRemove} />
      </div>
    </div>
  );
}

function PendingRow({
  u,
  incoming,
  onAccept,
  onDecline,
}: {
  u: PendingUser;
  incoming: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-2.5">
      <Head skin={friendSkinUrl(u)} name={u.username} size={40} className="shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-text">{u.username}</div>
        <div className="text-[11px] text-muted">{incoming ? "Хочет добавить вас" : "Заявка отправлена"}</div>
      </div>
      {incoming ? (
        <>
          <button
            title="Принять"
            onClick={onAccept}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-bg transition-colors hover:bg-accent-hover"
          >
            <i className="fa-solid fa-check text-xs" />
          </button>
          <IconBtn icon="fa-xmark" title="Отклонить" onClick={onDecline} />
        </>
      ) : (
        <IconBtn icon="fa-xmark" title="Отменить заявку" onClick={onDecline} />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl  p-4 text-center text-xs text-muted">{text}</div>;
}

export default function FriendsPanel() {
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [prefs, setPrefs] = useState<FriendPrefs>(loadFriendPrefs);
  const [confirm, setConfirm] = useState<Friend | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const { data, error, loading } = useFriends();

  useEffect(() => {
    setPresencePrivacy(prefs.showGame, prefs.showServer).catch(() => {});
  }, [prefs.showGame, prefs.showServer]);

  const nick = query.trim();
  const friends = data ? sortFriends(data.friends) : [];
  const list = friends.filter((f) => f.username.toLowerCase().includes(nick.toLowerCase()));
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  const canInvite =
    NICK_RE.test(nick) && !friends.some((f) => f.username.toLowerCase() === nick.toLowerCase());

  // Оптимистично: строка исчезает/меняется сразу, запрос — в фоне, откат при ошибке.
  const actOpt = async (
    mutate: (d: FriendsData) => FriendsData,
    fn: () => Promise<unknown>,
    ok?: string
  ) => {
    const prev = patchFriends(mutate);
    try {
      await fn();
      if (ok) toast(ok, "success");
      refreshFriends();
    } catch (e) {
      restoreFriends(prev);
      toast(human(e), "error");
    }
  };

  const invite = async () => {
    if (!canInvite || adding) return;
    setAdding(true);
    try {
      const status = await friendRequest(nick);
      toast(
        status === "accepted" ? `${nick} теперь у вас в друзьях` : `Заявка отправлена ${nick}`,
        "success"
      );
      setQuery("");
      refreshFriends();
    } catch (e) {
      toast(human(e), "error");
    } finally {
      setAdding(false);
    }
  };

  const myStatus = data?.me.status ?? prefs.status;

  const needLogin = error === "NO_ACIRON" || error === "SESSION_EXPIRED";

  return (
    <aside className="flex w-[240px] shrink-0 flex-col">
      {}
      <div className="mb-4 flex items-baseline gap-4">
        {(
          [
            ["friends", "Друзья"],
            ["requests", "Запросы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative text-[20px] font-light transition-colors ${
              tab === id ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {label}
            {id === "requests" && incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-bold text-bg">
                {incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
          placeholder="Найти друзей"
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => setSettings(true)}
          title="Профиль: статус и приватность"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-muted transition-colors hover:text-accent"
        >
          <i className="fa-solid fa-user-gear text-sm" />
          {}
          <span
            className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-card"
            style={{ background: STATUS_META[myStatus].color }}
          />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5">
        {needLogin ? (
          <div className="rounded-xl bg-card p-4 text-center">
            <div className="mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-xl bg-bg text-accent">
              <i className="fa-solid fa-user-group" />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {error === "SESSION_EXPIRED"
                ? "Сессия Aciron ID истекла — войдите заново, чтобы вернуть список друзей."
                : "Друзья работают с аккаунтом Aciron ID — войдите, чтобы видеть, кто в игре."}
            </p>
            <button
              onClick={() => setSignIn(true)}
              className="mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-bold text-bg transition-colors hover:bg-accent-hover"
            >
              Войти в Aciron ID
            </button>
          </div>
        ) : error && !data ? (
          <div className="rounded-xl bg-card p-4 text-center">
            <p className="text-xs leading-relaxed text-muted">{error}</p>
            <button
              onClick={refreshFriends}
              className="mt-3 w-full rounded-lg border border-border px-4 py-2 text-xs text-muted transition-colors hover:text-text"
            >
              Повторить
            </button>
          </div>
        ) : loading && !data ? (
          <div className="grid place-items-center py-6 text-muted">
            <i className="fa-solid fa-spinner fa-spin" />
          </div>
        ) : tab === "requests" ? (
          incoming.length === 0 && outgoing.length === 0 ? (
            <Empty text="Заявок пока нет" />
          ) : (
            <>
              {incoming.map((u) => (
                <PendingRow
                  key={u.id}
                  u={u}
                  incoming
                  onAccept={() =>
                    actOpt(
                      (d) => ({ ...d, incoming: d.incoming.filter((x) => x.id !== u.id) }),
                      () => friendRespond(u.id, true),
                      `${u.username} теперь у вас в друзьях`
                    )
                  }
                  onDecline={() =>
                    actOpt(
                      (d) => ({ ...d, incoming: d.incoming.filter((x) => x.id !== u.id) }),
                      () => friendRespond(u.id, false)
                    )
                  }
                />
              ))}
              {outgoing.map((u) => (
                <PendingRow
                  key={u.id}
                  u={u}
                  incoming={false}
                  onAccept={() => {}}
                  onDecline={() =>
                    actOpt(
                      (d) => ({ ...d, outgoing: d.outgoing.filter((x) => x.id !== u.id) }),
                      () => friendCancel(u.id)
                    )
                  }
                />
              ))}
            </>
          )
        ) : (
          <>
            {list.map((f) => (
              <FriendRow key={f.id} f={f} onRemove={() => setConfirm(f)} />
            ))}
            {list.length === 0 && !canInvite && (
              <Empty text={nick ? "Никого не нашлось" : "Пока никого — найдите друзей по нику"} />
            )}
            {}
            {canInvite && (
              <button
                onClick={invite}
                disabled={adding}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-2.5 text-left transition-colors hover:border-accent/60 disabled:opacity-60"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg text-accent">
                  <i className={`fa-solid ${adding ? "fa-spinner fa-spin" : "fa-user-plus"} text-sm`} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold text-text">{nick}</span>
                  <span className="block text-[11px] text-muted">Отправить заявку в друзья</span>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {settings && (
        <FriendSettingsModal
          prefs={prefs}
          onChange={setPrefs}
          serverStatus={data?.me.status}
          acceptRequests={data?.me.acceptRequests}
          onClose={() => setSettings(false)}
        />
      )}

      {confirm && (
        <ConfirmModal
          title="Удалить из друзей"
          message={`Удалить ${confirm.username} из друзей? Вернуться можно будет только новой заявкой.`}
          confirmLabel="Удалить"
          confirmIcon="fa-user-minus"
          onConfirm={() =>
            actOpt(
              (d) => ({ ...d, friends: d.friends.filter((x) => x.id !== confirm.id) }),
              () => friendRemove(confirm.id),
              `${confirm.username} удалён из друзей`
            )
          }
          onClose={() => setConfirm(null)}
        />
      )}

      {signIn && (
        <AddAccountModal
          initialStep="aciron"
          onAdded={refreshFriends}
          onClose={() => setSignIn(false)}
        />
      )}
    </aside>
  );
}
