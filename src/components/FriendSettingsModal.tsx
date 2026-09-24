import { useEffect, useState } from "react";
import Modal from "./Modal";
import Head from "./Head";
import { useToast } from "../ToastContext";
import { patchFriends, restoreFriends } from "../friends";
import { t, ts } from "../i18n";
import {
  getAccounts,
  headSkinUrl,
  setAcceptRequests,
  setPresenceStatus,
  type Account,
  type PresenceStatus,
} from "../api";
import Icon from "./Icon";

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
      role="switch"
      aria-checked={value}
      className="flex w-full items-center gap-4 py-3.5 text-left first:pt-0 last:pb-0"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-text">{label}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</div>
      </div>
      <span
        className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-300"
        style={{ background: value ? "var(--color-accent)" : "var(--color-line-strong)" }}
      >
        <span
          className="absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[var(--ease-out-quint)]"
          style={{ transform: value ? "translateX(18px)" : "none" }}
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

  const fail = (e: unknown) => toast(ts(String(e)), "error");

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
    <Modal title={t("Профиль")} subtitle={t("Статус и приватность в разделе друзей")} onClose={onClose}>
      <div className="space-y-6 pt-1">
        {}
        <div className="flex items-center gap-3.5">
          {account ? (
            <span
              className="shrink-0 rounded-full transition-shadow duration-500"
              style={{ boxShadow: `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${STATUS_META[status].color}` }}
            >
              <Head skin={headSkinUrl(account)} name={nick} size={46} className="rounded-full" />
            </span>
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-full bg-bg text-muted">
              <Icon cls="fa-solid fa-user" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-semibold text-text">{nick}</div>
            <div className="mt-0.5 text-[13px] text-muted">
              {t(STATUS_META[status].label)}
            </div>
          </div>
          <button
            onClick={copyNick}
            title={t("Скопировать ник — по нему вас добавят в друзья")}
            className="btn btn-sm btn-secondary shrink-0"
          >
            <Icon cls={`fa-solid ${copied ? "fa-check text-accent" : "fa-copy"} text-[14px]`} />
            {copied ? t("Скопировано") : t("Ник")}
          </button>
        </div>

        {}
        <div>
          <div className="mb-3 text-[14px] font-semibold text-text">{t("Статус")}</div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(STATUS_META) as PresenceStatus[]).map((id) => {
              const m = STATUS_META[id];
              const active = status === id;
              return (
                <button
                  key={id}
                  onClick={() => pickStatus(id)}
                  title={t(m.hint)}
                  className={`flex h-11 items-center gap-2.5 rounded-[14px] px-3.5 text-left transition-colors duration-300 ${
                    active
                      ? "bg-white/[0.07] shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
                      : "bg-white/[0.035] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="dot" style={{ background: m.color }} />
                  <span
                    className={`truncate text-[14px] ${
                      active ? "font-semibold text-text" : "text-text2"
                    }`}
                  >
                    {t(m.label)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[12.5px] text-muted">{t(STATUS_META[status].hint)}</p>
        </div>

        {}
        <div className="border-t border-line pt-5">
          <div className="mb-3 text-[14px] font-semibold text-text">{t("Приватность")}</div>
          <div className="divide-y divide-line">
            <Toggle
              value={prefs.showGame}
              onChange={(v) => patch({ showGame: v })}
              label={t("Показывать, во что играю")}
              hint={t("Версия или название сборки в списке друзей")}
            />
            <Toggle
              value={prefs.showServer}
              onChange={(v) => patch({ showServer: v })}
              label={t("Показывать сервер")}
              hint={t("Адрес сервера, на котором вы сейчас играете")}
            />
            <Toggle
              value={accepting}
              onChange={toggleAccepting}
              label={t("Принимать заявки в друзья")}
              hint={t("Выключите, если не хотите получать новые заявки")}
            />
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted">
          {t(
            "Статус и приём заявок хранятся в Aciron ID — их видят друзья. Скрытые версия, сборка и сервер вообще не отправляются на сервис."
          )}
        </p>
      </div>
    </Modal>
  );
}
