import { memo, useCallback, useEffect, useMemo, useState } from "react";
import ProfileModal from "./ProfileModal";
import Head from "./Head";
import { ContactAvatar, isVerified, PlusMark, VerifiedMark } from "./ContactAvatar";
import ConfirmModal from "./ConfirmModal";
import AddAccountModal from "./AddAccountModal";
import FriendSettingsModal, {
  loadFriendPrefs,
  STATUS_META,
  type FriendPrefs,
} from "./FriendSettingsModal";
import { useToast } from "../ToastContext";
import { t, useLang, ts } from "../i18n";
import { isMuted, onMutesChange } from "../mutes";
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
  contacts,
  patchFriends,
  PRESENCE_COLOR,
  presenceText,
  refreshFriends,
  restoreFriends,
  sortFriends,
  useFriends,
} from "../friends";
import { useChat } from "../chat";
import Icon from "./Icon";

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;

function human(e: unknown): string {
  const m = ts(String(e));
  if (m === "SESSION_EXPIRED") return t("Сессия Aciron ID истекла — войдите заново");
  if (m === "NO_ACIRON") return t("Для друзей нужен вход в Aciron ID");
  return m;
}

const IconBtn = memo(function IconBtn({
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
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] bg-bg text-muted transition-colors hover:text-text"
      style={color ? { color } : undefined}
    >
      <Icon cls={`fa-solid ${icon} text-[12.5px]`} />
    </button>
  );
});

const FriendRow = memo(function FriendRow({
  f,
  unread,
  onChat,
  onProfile,
  onRemove,
}: {
  f: Friend;
  unread: number;
  onChat: (id: string) => void;
  onProfile: (f: Friend) => void;
  onRemove: (f: Friend) => void;
}) {

  useLang();

  const [muted, setMutedState] = useState(() => isMuted(f.id));
  useEffect(() => onMutesChange(() => setMutedState(isMuted(f.id))), [f.id]);
  const color = PRESENCE_COLOR[f.presence.state];
  const playing = f.presence.inGame;
  return (
    <div className="group flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-white/[0.04]">
      {}
      <button
        onClick={() => onProfile(f)}
        title={t("Открыть профиль")}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className="shrink-0 rounded-full transition-shadow duration-500"
          style={{ boxShadow: `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${color}` }}
        >
          <ContactAvatar
            c={f}
            size={38}
            className={`rounded-full ${f.presence.state === "offline" ? "opacity-55" : ""}`}
          />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-text transition-colors group-hover:text-accent">
              {f.username}
            </span>
            {isVerified(f) && <VerifiedMark className="text-[11.5px]" />}
          {f.plus && <PlusMark />}
            {muted && (
              <Icon
                cls="fa-solid fa-bell-slash shrink-0 text-[9px] text-muted"
                title={t("Заглушён")}
              />
            )}
          </div>
          <div
            className="truncate text-[12px]"
            style={{ color: playing ? PRESENCE_COLOR.online : "var(--color-muted)" }}
            title={presenceText(f.presence)}
          >
            {presenceText(f.presence)}
          </div>
        </div>
      </button>

      {}
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11.5px] font-medium text-bg">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {}
      {}
      <div className="hidden shrink-0 gap-1 group-hover:flex">
        <IconBtn icon="fa-comment" title={t("Написать")} onClick={() => onChat(f.id)} />
        <IconBtn icon="fa-user-minus" title={t("Удалить из друзей")} onClick={() => onRemove(f)} />
      </div>
    </div>
  );
});

const PendingRow = memo(function PendingRow({
  u,
  incoming,
  onAccept,
  onDecline,
}: {
  u: PendingUser;
  incoming: boolean;
  onAccept: (u: PendingUser) => void;
  onDecline: (u: PendingUser) => void;
}) {
  useLang();
  return (
    <div className="flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-white/[0.04]">
      <Head skin={friendSkinUrl(u)} name={u.username} size={38} className="shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text">{u.username}</span>
          {u.verified && <VerifiedMark className="text-[11.5px]" />}
        </div>
        <div className="text-[12px] text-muted">{incoming ? t("Хочет добавить вас") : t("Заявка отправлена")}</div>
      </div>
      {incoming ? (
        <>
          <button
            title={t("Принять")}
            onClick={() => onAccept(u)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full btn-accent"
          >
            <Icon cls="fa-solid fa-check text-[12.5px]" />
          </button>
          <IconBtn icon="fa-xmark" title={t("Отклонить")} onClick={() => onDecline(u)} />
        </>
      ) : (
        <IconBtn icon="fa-xmark" title={t("Отменить заявку")} onClick={() => onDecline(u)} />
      )}
    </div>
  );
});

function Empty({ text }: { text: string }) {
  return <div className="rounded-[14px]  p-4 text-center text-[12.5px] text-muted">{text}</div>;
}

export default function FriendsPanel() {

  useLang();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const { unread } = useChat();

  const [profile, setProfile] = useState<Friend | null>(null);

  const openChat = useCallback(
    (userId: string) => window.dispatchEvent(new CustomEvent("aciron-open-chat", { detail: userId })),
    []
  );
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

  const friends = useMemo(() => (data ? sortFriends(data.friends) : []), [data?.friends]);
  const list = useMemo(
    () => friends.filter((f) => f.username.toLowerCase().includes(nick.toLowerCase())),
    [friends, nick]
  );
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  const canInvite = useMemo(
    () =>
      NICK_RE.test(nick) &&
      !contacts(data).some((f) => f.username.toLowerCase() === nick.toLowerCase()),
    [data, nick]
  );

  const actOpt = useCallback(
    async (
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
    },
    [toast]
  );

  const acceptIncoming = useCallback(
    (u: PendingUser) =>
      actOpt(
        (d) => ({ ...d, incoming: d.incoming.filter((x) => x.id !== u.id) }),
        () => friendRespond(u.id, true),
        t("{name} теперь у вас в друзьях", { name: u.username })
      ),
    [actOpt]
  );
  const declineIncoming = useCallback(
    (u: PendingUser) =>
      actOpt(
        (d) => ({ ...d, incoming: d.incoming.filter((x) => x.id !== u.id) }),
        () => friendRespond(u.id, false)
      ),
    [actOpt]
  );
  const cancelOutgoing = useCallback(
    (u: PendingUser) =>
      actOpt(
        (d) => ({ ...d, outgoing: d.outgoing.filter((x) => x.id !== u.id) }),
        () => friendCancel(u.id)
      ),
    [actOpt]
  );
  const noop = useCallback(() => {}, []);

  const invite = async () => {
    if (!canInvite || adding) return;
    setAdding(true);
    try {
      const status = await friendRequest(nick);
      toast(
        status === "accepted"
          ? t("{name} теперь у вас в друзьях", { name: nick })
          : t("Заявка отправлена {name}", { name: nick }),
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
      <div className="page-tabs mb-4">
        {(
          [
            ["friends", "Друзья"],
            ["requests", "Запросы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-active={tab === id}
            className="page-tab"
          >
            {t(label)}
            {id === "requests" && incoming.length > 0 && (
              <span className="tag tag-accent">
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
          placeholder={t("Найти друзей")}
          className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-white/[0.05] px-4 text-sm text-text transition-colors placeholder:text-muted hover:bg-white/[0.07] focus:border-accent/60 focus:bg-white/[0.06] focus:outline-none"
        />
        <button
          onClick={() => setSettings(true)}
          title={t("Профиль: статус и приватность")}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted transition-colors hover:bg-white/[0.08] hover:text-accent"
        >
          <Icon cls="fa-solid fa-user-gear text-sm" />
          {}
          <span
            className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-bg"
            style={{ background: STATUS_META[myStatus].color }}
          />
        </button>
      </div>

      <div className="-mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {needLogin ? (
          <div className="mx-2 rounded-[14px] bg-white/[0.03] p-4 text-center">
            <div className="mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-full bg-accent/12 text-accent">
              <Icon cls="fa-solid fa-user-group" />
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              {error === "SESSION_EXPIRED"
                ? t("Сессия Aciron ID истекла — войдите заново, чтобы вернуть список друзей.")
                : t("Друзья работают с аккаунтом Aciron ID — войдите, чтобы видеть, кто в игре.")}
            </p>
            <button
              onClick={() => setSignIn(true)}
              className="play-btn mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold"
            >
              {t("Войти в Aciron ID")}
            </button>
          </div>
        ) : error && !data ? (
          <div className="mx-2 rounded-[14px] bg-white/[0.03] p-4 text-center">
            <p className="text-[12.5px] leading-relaxed text-muted">{error}</p>
            <button
              onClick={refreshFriends}
              className="mt-3 w-full rounded-[12px] border border-line px-4 py-2 text-[12.5px] text-muted transition-colors hover:text-text"
            >
              {t("Повторить")}
            </button>
          </div>
        ) : loading && !data ? (
          <div className="grid place-items-center py-6 text-muted">
            <Icon cls="fa-solid fa-spinner fa-spin" />
          </div>
        ) : tab === "requests" ? (
          incoming.length === 0 && outgoing.length === 0 ? (
            <Empty text={t("Заявок пока нет")} />
          ) : (
            <>
              {incoming.map((u) => (
                <PendingRow
                  key={u.id}
                  u={u}
                  incoming
                  onAccept={acceptIncoming}
                  onDecline={declineIncoming}
                />
              ))}
              {outgoing.map((u) => (
                <PendingRow
                  key={u.id}
                  u={u}
                  incoming={false}
                  onAccept={noop}
                  onDecline={cancelOutgoing}
                />
              ))}
            </>
          )
        ) : (
          <>
            {list.map((f) => (
              <FriendRow
                key={f.id}
                f={f}
                unread={unread[f.id] ?? 0}
                onChat={openChat}
                onProfile={setProfile}
                onRemove={setConfirm}
              />
            ))}
            {list.length === 0 && !canInvite && (
              <Empty text={nick ? t("Никого не нашлось") : t("Пока никого — найдите друзей по нику")} />
            )}
            {}
            {canInvite && (
              <button
                onClick={invite}
                disabled={adding}
                className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
              >
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
                  <Icon cls={`fa-solid ${adding ? "fa-spinner fa-spin" : "fa-user-plus"} text-sm`} />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold text-text">{nick}</span>
                  <span className="block text-[12px] text-muted">{t("Отправить заявку в друзья")}</span>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {profile && (
        <ProfileModal
          userId={profile.id}
          username={profile.username}

          onBlocked={() => {
            patchFriends((d) => ({
              ...d,
              friends: d.friends.filter((x) => x.id !== profile.id),
            }));
            refreshFriends();
          }}
          onClose={() => setProfile(null)}
        />
      )}

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
          title={t("Удалить из друзей")}
          message={t("Удалить {name} из друзей? Вернуться можно будет только новой заявкой.", {
            name: confirm.username,
          })}
          confirmLabel={t("Удалить")}
          confirmIcon="fa-user-minus"
          onConfirm={() =>
            actOpt(
              (d) => ({ ...d, friends: d.friends.filter((x) => x.id !== confirm.id) }),
              () => friendRemove(confirm.id),
              t("{name} удалён из друзей", { name: confirm.username })
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
