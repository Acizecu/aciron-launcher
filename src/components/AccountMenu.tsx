import { PlusMark } from "./ContactAvatar";
import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import {
  type Account,
  type AccountsState,
  ACCOUNTS_CHANGED, getAccounts,
  setActiveAccount,
  removeAccount,
  acironLinkLicense,
  headSkinUrl,
  openUrl,
  ACIRON_ID_WEB,
} from "../api";
import Head from "./Head";
import Modal from "./Modal";
import AddAccountModal from "./AddAccountModal";
import { t, ts } from "../i18n";
import Icon from "./Icon";

const typeLabel = (a: Account) =>
  a.type === "microsoft"
    ? "Microsoft"
    : a.type === "aciron"
    ? a.licensed
      ? t("Aciron ID, лицензия")
      : "Aciron ID"
    : t("Оффлайн");

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [warn, setWarn] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  const [state, setState] = useState<AccountsState>({ accounts: [], active: "" });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const refresh = () => getAccounts().then(setState);
  useEffect(() => {
    refresh();

    window.addEventListener(ACCOUNTS_CHANGED, refresh);
    return () => window.removeEventListener(ACCOUNTS_CHANGED, refresh);
  }, []);

  const active = state.accounts.find((a) => a.id === state.active) ?? state.accounts[0];

  const linkLicense = async () => {
    if (!active) return;
    setWarn(false);
    setLinking(true);
    setLinkMsg(t("Открываем вход Microsoft в браузере…"));

    try {
      await acironLinkLicense(active.id);
      setLinkMsg("");
      refresh();
    } catch (e) {
      setLinkMsg(ts(String(e)));
    } finally {
      setLinking(false);
    }
  };

  const pick = async (id: string) => {
    await setActiveAccount(id);
    setOpen(false);
    refresh();
  };
  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await removeAccount(id);
    refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-14 items-center gap-3 rounded-[16px] px-2.5 pr-3.5 transition-colors duration-300 ${open ? "bg-white/[0.08]" : "bg-white/[0.04] hover:bg-white/[0.07]"}`}
      >
        {active ? (
          <Head skin={headSkinUrl(active)} name={active.username} size={38} className="rounded-full" />
        ) : (
          <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white/[0.06] text-muted">
            <Icon cls="fa-solid fa-user text-[16px]" />
          </span>
        )}
        <div className="text-left leading-tight">
          <div className="flex max-w-[170px] items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold text-text">{active?.username ?? t("Нет аккаунта")}</span>
            {active?.plus && <PlusMark small />}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {active ? typeLabel(active) : t("Добавьте аккаунт")}
          </div>
        </div>
        <Icon
          cls={`fa-solid fa-chevron-down ml-1 text-[14px] text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="dock-pop absolute bottom-full mb-3 overflow-hidden rounded-[20px] bg-popover p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] right-0 w-80">
          <div className="px-2.5 pb-1.5 pt-1.5 text-[12.5px] text-muted">
            {t("Аккаунты")}
          </div>
          <div className="max-h-60 space-y-0.5 overflow-y-auto">
            {state.accounts.length === 0 && (
              <div className="px-3 py-4 text-center text-[13px] text-muted">{t("Список пуст")}</div>
            )}
            {state.accounts.map((a) => {
              const isActive = a.id === active?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => pick(a.id)}
                  className={`group flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors ${
                    isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <Head skin={headSkinUrl(a)} name={a.username} size={34} className="rounded-full" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-text">{a.username}</span>
                      {a.plus && <PlusMark small />}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">{typeLabel(a)}</div>
                  </div>
                  {isActive ? (
                    <Icon cls="fa-solid fa-check text-[16px] text-accent" />
                  ) : (
                    <Icon
                      onClick={(e) => remove(e, a.id)}
                      title={t("Удалить")}
                      cls="fa-solid fa-xmark p-1 text-[15px] text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    />
                  )}
                </button>
              );
            })}
          </div>
          {active?.type === "aciron" && (
            <div className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
              <button
                onClick={() => openUrl(ACIRON_ID_WEB)}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-text transition-colors hover:bg-white/[0.05]"
              >
                <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accent/12 text-accent">
                  <Icon cls="fa-solid fa-id-badge text-[14px]" />
                </span>
                {t("Личный кабинет")}
              </button>

              {active.licensed ? (
                <div className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] text-muted">
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#5fd08a]/12 text-[#5fd08a]">
                    <Icon cls="fa-solid fa-certificate text-[14px]" />
                  </span>
                  {t("Лицензия подключена")}
                </div>
              ) : linking ? (
                <div className="flex items-center gap-2.5 px-2.5 py-2 text-[12.5px] text-muted">
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accent/12 text-accent">
                    <Icon cls="fa-solid fa-spinner fa-spin text-[14px]" />
                  </span>
                  {linkMsg || t("Ожидание входа Microsoft…")}
                </div>
              ) : (
                <button
                  onClick={() => setWarn(true)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-text transition-colors hover:bg-white/[0.05]"
                >
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-accent/12 text-accent">
                    <Icon cls="fa-solid fa-key text-[14px]" />
                  </span>
                  {t("Подключить лицензию")}
                </button>
              )}
              {linkMsg && !linking && !active.licensed && (
                <div className="px-2.5 pb-1 text-[12px] text-danger">{linkMsg}</div>
              )}
            </div>
          )}

          <div className="mt-1.5 border-t border-line pt-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setModal(true);
              }}
              className="btn btn-sm btn-secondary w-full"
            >
              <Icon cls="fa-solid fa-plus text-[14px]" />
              {t("Добавить аккаунт")}
            </button>
          </div>
        </div>
      )}

      {modal && <AddAccountModal onClose={() => setModal(false)} onAdded={refresh} />}

      {warn && active && (
        <Modal
          title={t("Подключение лицензии")}
          icon="fa-triangle-exclamation"
          onClose={() => setWarn(false)}
        >
          <div className="space-y-4 pt-1">
            <p className="text-sm text-text">
              {t("Вы привяжете лицензию Minecraft (Microsoft) к аккаунту {name} и будете играть через неё.", {
                name: active.aciron_name || active.username,
              })}
            </p>

            <div className="space-y-2.5">
              <WarnRow icon="fa-user-pen">
                {t("Ник аккаунта сменится на лицензионный — именно он будет отображаться в игре и на серверах.")}
              </WarnRow>
              <WarnRow icon="fa-scale-balanced">
                {t("Используйте только свою лицензию. Взлом, кража или использование чужих аккаунтов — не ответственность Aciron.")}
              </WarnRow>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setWarn(false)}
                className="btn btn-ghost"
              >
                {t("Отмена")}
              </button>
              <button
                onClick={linkLicense}
                className="btn btn-accent ml-auto"
              >
                <Icon cls="fa-brands fa-microsoft" />
                {t("Продолжить и войти")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function WarnRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-accent/25 bg-accent/10 px-3 py-2.5 text-sm text-text">
      <Icon cls={`fa-solid ${icon} mt-0.5 text-accent`} />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
