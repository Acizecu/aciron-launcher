import { useEffect, useState } from "react";
import Modal from "./Modal";
import Head from "./Head";
import { useToast } from "../ToastContext";
import { patchFriends, restoreFriends } from "../friends";
import {
  getAccounts,
  headSkinUrl,
  setAcceptRequests,
  setPresenceStatus,
  type Account,
  type PresenceStatus,
} from "../api";

export type { PresenceStatus };

export type FriendPrefs = {

  status: PresenceStatus;

  showGame: boolean;

  showServer: boolean;

  acceptRequests: boolean;
};

const PREFS_KEY = "aciron:friend-prefs";

export const DEFAULT_PREFS: FriendPrefs = {
  status: "online",
  showGame: true,
  showServer: true,
  acceptRequests: true,
};

export function loadFriendPrefs(): FriendPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {

  }
  return DEFAULT_PREFS;
}

function savePrefs(p: FriendPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

export const STATUS_META: Record<
  PresenceStatus,
  { label: string; color: string; hint: string }
> = {
  online: { label: "В сети", color: "#22c55e", hint: "Друзья видят, что вы в лаунчере" },
  idle: { label: "Нет на месте", color: "#eab308", hint: "Ставится автоматически при простое" },
  dnd: { label: "Не беспокоить", color: "#ef4444", hint: "Уведомления от друзей не приходят" },
  invisible: { label: "Невидимка", color: "#6b7280", hint: "Для друзей вы офлайн" },
};

function Toggle({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function FriendSettingsModal({
  prefs,
  onChange,
  onClose,
  serverStatus,
  acceptRequests,
}: {
  prefs: FriendPrefs;
  onChange: (p: FriendPrefs) => void;
  onClose: () => void;

  serverStatus?: PresenceStatus;

  acceptRequests?: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const status = serverStatus ?? prefs.status;
  const accepting = acceptRequests ?? prefs.acceptRequests;

  useEffect(() => {
    getAccounts()
      .then((s) => setAccount(s.accounts.find((a) => a.id === s.active) ?? s.accounts[0] ?? null))
      .catch(() => {});
  }, []);

  const patch = (p: Partial<FriendPrefs>) => {
    const next = { ...prefs, ...p };
    savePrefs(next);
    onChange(next);
  };

  const fail = (e: unknown) => toast(String(e).replace(/^Error:\s*/, ""), "error");

  // Оптимистично: подсветка/точка статуса меняются мгновенно, запрос — в фоне,
  // откат при ошибке. Поллинг друзей (15с) синхронизирует истинное состояние.
  const pickStatus = (id: PresenceStatus) => {
    patch({ status: id });
    const prev = patchFriends((d) => ({ ...d, me: { ...d.me, status: id } }));
    setPresenceStatus(id).catch((e) => {
      restoreFriends(prev);
      fail(e);
    });
  };

  const toggleAccepting = (v: boolean) => {
    patch({ acceptRequests: v });
    const prev = patchFriends((d) => ({ ...d, me: { ...d.me, acceptRequests: v } }));
    setAcceptRequests(v).catch((e) => {
      restoreFriends(prev);
      fail(e);
    });
  };

  const nick = account?.aciron_name || account?.username || "Player";

  const copyNick = async () => {
    try {
      await navigator.clipboard.writeText(nick);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {

    }
  };

  return (
    <Modal title="Профиль" subtitle="Статус и приватность в разделе друзей" onClose={onClose}>
      <div className="space-y-5 p-5">
        {}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {account ? (
            <Head skin={headSkinUrl(account)} name={nick} size={44} className="rounded-lg" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-bg text-muted">
              <i className="fa-solid fa-user" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text">{nick}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STATUS_META[status].color }}
              />
              {STATUS_META[status].label}
            </div>
          </div>
          <button
            onClick={copyNick}
            title="Скопировать ник — по нему вас добавят в друзья"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-bg text-muted transition-colors hover:text-accent"
          >
            <i className={`fa-solid ${copied ? "fa-check text-accent" : "fa-copy"} text-sm`} />
          </button>
        </div>

        {}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Статус
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_META) as PresenceStatus[]).map((id) => {
              const m = STATUS_META[id];
              const active = status === id;
              return (
                <button
                  key={id}
                  onClick={() => pickStatus(id)}
                  title={m.hint}
                  className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card hover:border-accent/40"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: m.color }}
                  />
                  <span
                    className={`truncate text-sm ${
                      active ? "font-semibold text-accent" : "text-text"
                    }`}
                  >
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">{STATUS_META[status].hint}</p>
        </div>

        {}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Приватность
          </div>
          <div className="space-y-2">
            <Toggle
              value={prefs.showGame}
              onChange={(v) => patch({ showGame: v })}
              label="Показывать, во что играю"
              hint="Версия или название сборки в списке друзей"
            />
            <Toggle
              value={prefs.showServer}
              onChange={(v) => patch({ showServer: v })}
              label="Показывать сервер"
              hint="Адрес сервера, на котором вы сейчас играете"
            />
            <Toggle
              value={accepting}
              onChange={toggleAccepting}
              label="Принимать заявки в друзья"
              hint="Выключите, если не хотите получать новые заявки"
            />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-muted">
          Статус и приём заявок хранятся в Aciron ID — их видят друзья. Скрытые версия, сборка
          и сервер вообще не отправляются на сервис.
        </p>
      </div>
    </Modal>
  );
}
