import { useEffect, useState, type ReactNode } from "react";
import Modal from "./Modal";
import {
  addOfflineAccount,
  addMicrosoftAccount,
  acironLogin,
  acironRegister,
  acironVerifyEmail,
  acironResendCode,
  openUrl,
  isTauri,
  ACIRON_ID_WEB,
} from "../api";
import { MicrosoftIcon } from "./Icons";
import { ACIRON_LOGIN_ENABLED } from "../config";
import { t, ts } from "../i18n";

type Step = "choose" | "offline" | "aciron" | "register" | "verify" | "microsoft";

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const RESEND_COOLDOWN = 30;

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent";

export default function AddAccountModal({
  onClose,
  onAdded,
  initialStep = "choose",
}: {
  onClose: () => void;
  onAdded: () => void;

  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState(false);

  const [regNick, setRegNick] = useState("");
  const [email, setEmail] = useState("");
  const [password2, setPassword2] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const done = () => {
    onAdded();
    onClose();
  };

  const submitOffline = async () => {
    setError("");
    const nick = name.trim();

    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      return setError(
        t("Ник: 3–16 символов, только латиница, цифры и _ (без пробелов, кириллицы и эмодзи)")
      );
    }
    setBusy(true);
    try {
      await addOfflineAccount(nick);
      done();
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const submitAciron = async () => {
    setError("");
    setNotice("");
    if (!login.trim() || !password) return setError(t("Введите ник/e-mail и пароль"));
    if (twofa && !code.trim()) return setError(t("Введите код 2FA"));
    setBusy(true);
    try {
      await acironLogin(login.trim(), password, twofa ? code.trim() : undefined);
      done();
    } catch (e) {
      const msg = ts(String(e));
      if (msg === "2FA_REQUIRED") {
        setTwofa(true);
        setNotice(t("У аккаунта включена 2FA — введите код из приложения или резервный код"));
      } else if (msg.startsWith("EMAIL_NOT_VERIFIED")) {

        setEmail(msg.slice("EMAIL_NOT_VERIFIED:".length) || login.trim());
        setCode("");
        setCooldown(RESEND_COOLDOWN);
        setNotice(t("Почта ещё не подтверждена — мы выслали новый код"));
        setStep("verify");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    setError("");
    setNotice("");
    if (!NICK_RE.test(regNick.trim()))
      return setError(t("Ник: 3–16 символов, только латиница, цифры и _"));
    if (!EMAIL_RE.test(email.trim())) return setError(t("Введите корректный e-mail"));
    if (password.length < 8) return setError(t("Пароль минимум 8 символов"));
    if (password !== password2) return setError(t("Пароли не совпадают"));
    setBusy(true);
    try {
      const mail = await acironRegister(regNick.trim(), email.trim(), password);
      setEmail(mail);
      setCode("");
      setCooldown(RESEND_COOLDOWN);
      setNotice(t("Код отправлен на {mail}", { mail }));
      setStep("verify");
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async () => {
    setError("");
    if (code.trim().length < 6) return setError(t("Код из письма — 6 цифр"));
    setBusy(true);
    try {
      await acironVerifyEmail(email.trim(), code.trim());
      done();
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError("");
    setCooldown(RESEND_COOLDOWN);
    try {
      await acironResendCode(email.trim());
      setNotice(t("Новый код отправлен на {mail}", { mail: email.trim() }));
    } catch (e) {
      setError(ts(String(e)));
    }
  };

  const startMicrosoft = async () => {
    setStep("microsoft");
    setError("");
    setAuthUrl("");
    setBusy(true);

    let unlisten: (() => void) | undefined;
    if (isTauri) {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<{ url: string }>("ms-auth-open", (e) => setAuthUrl(e.payload.url));
    } else {
      setAuthUrl("https://login.microsoftonline.com/");
    }

    try {
      await addMicrosoftAccount();
      done();
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
      unlisten?.();
    }
  };

  const title =
    step === "offline"
      ? t("Пиратский аккаунт")
      : step === "aciron"
      ? t("Вход в Aciron ID")
      : step === "register"
      ? t("Регистрация Aciron ID")
      : step === "verify"
      ? t("Подтверждение e-mail")
      : step === "microsoft"
      ? t("Вход через Microsoft")
      : t("Добавить аккаунт");

  return (
    <Modal title={title} icon="fa-user-plus" onClose={onClose}>
      <div className="p-5">
        {step === "choose" && (
          <div className="space-y-2.5">
            <TypeButton
              icon="fa-user-secret"
              iconBg="bg-bg text-accent"
              title={t("Пиратский аккаунт")}
              desc={t("Оффлайн аккаунт")}
              onClick={() => setStep("offline")}
            />
            <TypeButton
              node={<MicrosoftIcon size={22} />}
              iconBg="bg-bg fill-accent"
              title={t("Лицензия (Microsoft)")}
              desc={t("Официальный вход через аккаунт Microsoft")}
              onClick={startMicrosoft}
            />
            <TypeButton
              node={<i className="fa-solid fa-key"></i>}
              iconBg="bg-bg text-accent"
              title={t("Аккаунт Aciron")}
              desc={t("Единый аккаунт Aciron ID")}
              disabled={!ACIRON_LOGIN_ENABLED}
              onClick={
                ACIRON_LOGIN_ENABLED
                  ? () => {
                      setNotice("");
                      setError("");
                      setStep("aciron");
                    }
                  : undefined
              }
            />
          </div>
        )}

        {step === "offline" && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Ник игрока")}</span>
              <input
                autoFocus
                className={inputCls}
                value={name}
                placeholder="Player"
                maxLength={16}
                onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && submitOffline()}
              />
            </label>
            {error && <Err msg={error} />}
            <div className="flex gap-2 pt-1">
              <BackBtn onClick={() => setStep("choose")} />
              <PrimaryBtn onClick={submitOffline} busy={busy} label={t("Добавить")} />
            </div>
          </div>
        )}

        {step === "microsoft" && (
          <div className="space-y-4">
            {!authUrl && !error && (
              <div className="flex flex-col items-center gap-3 py-6 text-muted">
                <i className="fa-solid fa-spinner fa-spin text-2xl" />
                <span className="text-sm">{t("Открываем вход Microsoft…")}</span>
              </div>
            )}

            {authUrl && !error && (
              <>
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
                    <i className="fa-brands fa-microsoft text-2xl" />
                  </div>
                  <p className="text-sm text-text">
                    {t("Мы открыли вход Microsoft в браузере.")}
                  </p>
                  <p className="text-xs text-muted">
                    {t("Войдите там — окно закроется, а вход завершится здесь автоматически.")}
                  </p>
                </div>
                <button
                  onClick={() => openUrl(authUrl)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg px-5 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent/50"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                  {t("Браузер не открылся? Открыть вручную")}
                </button>
                <div className="flex items-center justify-center gap-2 text-xs text-muted">
                  <i className="fa-solid fa-spinner fa-spin" />
                  {t("Ожидание входа…")}
                </div>
              </>
            )}

            {error && <Err msg={error} />}

            <div className="flex gap-2 pt-1">
              <BackBtn
                onClick={() => {
                  setError("");
                  setAuthUrl("");
                  setStep("choose");
                }}
              />
            </div>
          </div>
        )}

        {step === "aciron" && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Ник или e-mail")}</span>
              <input
                autoFocus
                className={inputCls}
                value={login}
                placeholder={t("Steve или you@example.com")}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setNotice("");
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Пароль")}</span>
              <input
                type="password"
                className={inputCls}
                value={password}
                placeholder="••••••••"
                onChange={(e) => {
                  setPassword(e.target.value);
                  setNotice("");
                }}
                onKeyDown={(e) => e.key === "Enter" && submitAciron()}
              />
            </label>
            {twofa && (
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">{t("Код 2FA")}</span>
                <input
                  autoFocus
                  className={`${inputCls} text-center tracking-[0.3em]`}
                  value={code}
                  placeholder="000000"
                  maxLength={9}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase())
                  }
                  onKeyDown={(e) => e.key === "Enter" && submitAciron()}
                />
              </label>
            )}
            {error && <Err msg={error} />}
            {notice && <Notice msg={notice} />}
            <div className="flex gap-2 pt-1">
              <BackBtn onClick={() => setStep("choose")} />
              <PrimaryBtn onClick={submitAciron} busy={busy} label={t("Войти")} />
            </div>
            <div className="pt-1 text-center text-xs text-muted">
              {t("Нет аккаунта?")}{" "}
              <button
                onClick={() => {
                  setError("");
                  setNotice("");
                  setPassword("");
                  setStep("register");
                }}
                className="font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                {t("Зарегистрироваться")}
              </button>
            </div>
          </div>
        )}

        {step === "register" && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t("Ник")}</span>
              <input
                autoFocus
                className={inputCls}
                value={regNick}
                placeholder="Player"
                maxLength={16}
                onChange={(e) => setRegNick(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              />
              <span className="mt-1 block text-[11px] text-muted">
                {t("Под этим ником вас будут находить друзья и видеть в игре")}
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">E-mail</span>
              <input
                className={inputCls}
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">{t("Пароль")}</span>
                <input
                  type="password"
                  className={inputCls}
                  value={password}
                  placeholder={t("от 8 символов")}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">{t("Повтор пароля")}</span>
                <input
                  type="password"
                  className={inputCls}
                  value={password2}
                  placeholder="••••••••"
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitRegister()}
                />
              </label>
            </div>
            {error && <Err msg={error} />}
            <div className="flex gap-2 pt-1">
              <BackBtn onClick={() => setStep("aciron")} />
              <PrimaryBtn onClick={submitRegister} busy={busy} label={t("Создать аккаунт")} />
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
                <i className="fa-solid fa-envelope-open-text text-2xl" />
              </div>
              <p className="text-sm text-text">{t("Мы отправили 6-значный код на")}</p>
              <p className="break-all text-sm font-semibold text-accent">{email}</p>
            </div>
            <input
              autoFocus
              className={`${inputCls} text-center text-lg tracking-[0.4em]`}
              value={code}
              placeholder="000000"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submitVerify()}
            />
            {error && <Err msg={error} />}
            {notice && <Notice msg={notice} />}
            <button
              onClick={resend}
              disabled={cooldown > 0}
              className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
            >
              {cooldown > 0
                ? t("Отправить код снова через {n} с", { n: cooldown })
                : t("Отправить код снова")}
            </button>
            <div className="flex gap-2 pt-1">
              <BackBtn
                onClick={() => {
                  setError("");
                  setNotice("");
                  setStep("aciron");
                }}
              />
              <PrimaryBtn onClick={submitVerify} busy={busy} label={t("Подтвердить")} />
            </div>
            <p className="text-center text-[11px] leading-relaxed text-muted">
              {t("Письмо не пришло? Проверьте папку «Спам» или")}{" "}
              <button
                onClick={() => openUrl(ACIRON_ID_WEB)}
                className="text-accent transition-colors hover:text-accent-hover"
              >
                {t("откройте личный кабинет")}
              </button>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TypeButton({
  icon,
  node,
  title,
  desc,
  iconBg,
  onClick,
  disabled,
  brand,
}: {
  icon?: string;
  node?: ReactNode;
  title: string;
  desc: string;
  iconBg: string;
  onClick?: () => void;
  disabled?: boolean;
  brand?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-accent/50"
      }`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg ${iconBg}`}>
        {node ?? <i className={`${brand ? "fa-brands" : "fa-solid"} ${icon}`} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-text">
          {title}
          {disabled && (
            <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted">
              <i className="fa-solid fa-lock mr-1" />
              {t("скоро")}
            </span>
          )}
        </div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {!disabled && <i className="fa-solid fa-chevron-right text-xs text-muted" />}
    </button>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">
      <i className="fa-solid fa-circle-exclamation mt-0.5" />
      <span className="min-w-0 break-words">{msg}</span>
    </div>
  );
}

function Notice({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent">
      <i className="fa-solid fa-circle-info mt-0.5" />
      <span className="min-w-0 break-words">{msg}</span>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      <i className="fa-solid fa-arrow-left text-xs" />
      {t("Назад")}
    </button>
  );
}

function PrimaryBtn({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:opacity-60"
    >
      {busy && <i className="fa-solid fa-spinner fa-spin" />}
      {label}
    </button>
  );
}
