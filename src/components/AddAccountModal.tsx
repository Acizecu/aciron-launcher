import { useEffect, useState, type ReactNode } from "react";
import Modal from "./Modal";
import {
  addOfflineAccount,
  addMicrosoftAccount,
  acironLoginStart,
  acironLoginFinish,
  acironLoginTelegramSend,
  acironRegister,
  acironVerifyEmail,
  acironResendCode,
  openUrl,
  isTauri,
  ACIRON_ID_WEB,
  type AcironTwofaMethod,
} from "../api";
import { MicrosoftIcon } from "./Icons";
import { ACIRON_LOGIN_ENABLED } from "../config";
import { t, ts, useLang } from "../i18n";
import Icon from "./Icon";

type Step = "choose" | "offline" | "aciron" | "twofa" | "register" | "verify" | "microsoft";

const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const RESEND_COOLDOWN = 30;

const TELEGRAM_COOLDOWN = 60;

const inputCls =
  "field h-11 w-full px-4 text-[14.5px]";

export default function AddAccountModal({
  onClose,
  onAdded,
  initialStep = "choose",
}: {
  onClose: () => void;
  onAdded: () => void;

  initialStep?: Step;
}) {

  useLang();
  const [step, setStep] = useState<Step>(initialStep);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [code, setCode] = useState("");

  const [ticket, setTicket] = useState("");
  const [methods, setMethods] = useState<AcironTwofaMethod[]>([]);
  const [method, setMethod] = useState<AcironTwofaMethod>("totp");

  const [tgSent, setTgSent] = useState(false);

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
    setBusy(true);
    try {
      const r = await acironLoginStart(login.trim(), password);
      if (!r.twofaRequired) return done();

      setTicket(r.ticket);
      setMethods(r.methods);

      setMethod(r.methods.includes("totp") ? "totp" : r.methods[0]);
      setCode("");

      setTgSent(!!r.codeSentTo);
      setCooldown(r.codeSentTo ? r.resendInSecs || TELEGRAM_COOLDOWN : 0);
      setStep("twofa");
    } catch (e) {
      const msg = ts(String(e));
      if (msg.startsWith("EMAIL_NOT_VERIFIED")) {
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

  const submitTwofa = async () => {
    setError("");
    if (!code.trim())
      return setError(
        method === "telegram"
          ? t("Введите код из Telegram")
          : method === "email"
            ? t("Введите код из письма")
            : t("Введите код 2FA")
      );
    setBusy(true);
    try {
      await acironLoginFinish(ticket, code.trim());
      done();
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const sendTelegram = async () => {
    if (cooldown > 0 || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await acironLoginTelegramSend(ticket);
      setTgSent(true);
      setCooldown(TELEGRAM_COOLDOWN);
      setNotice(method === "email" ? t("Код отправлен на почту") : t("Код отправлен в Telegram"));
    } catch (e) {
      setError(ts(String(e)));
    } finally {
      setBusy(false);
    }
  };

  const pickMethod = (m: AcironTwofaMethod) => {
    setMethod(m);
    setCode("");
    setError("");
    setNotice("");
  };

  const leaveTwofa = () => {
    setError("");
    setNotice("");
    setCode("");
    setTicket("");
    setTgSent(false);
    setCooldown(0);
    setStep("aciron");
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
      : step === "twofa"
      ? t("Подтверждение входа")
      : step === "register"
      ? t("Регистрация Aciron ID")
      : step === "verify"
      ? t("Подтверждение e-mail")
      : step === "microsoft"
      ? t("Вход через Microsoft")
      : t("Добавить аккаунт");

  return (
    <Modal title={title} icon="fa-user-plus" onClose={onClose}>
      <div className="pt-1">
        {step === "choose" && (
          <div className="-mx-3 space-y-1">
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
              node={<Icon cls="fa-solid fa-key" />}
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
              <span className="field-label">{t("Ник игрока")}</span>
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
                <Icon cls="fa-solid fa-spinner fa-spin text-2xl" />
                <span className="text-sm">{t("Открываем вход Microsoft…")}</span>
              </div>
            )}

            {authUrl && !error && (
              <>
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent">
                    <Icon cls="fa-brands fa-microsoft text-2xl" />
                  </div>
                  <p className="text-sm text-text">
                    {t("Мы открыли вход Microsoft в браузере.")}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {t("Войдите там — окно закроется, а вход завершится здесь автоматически.")}
                  </p>
                </div>
                <button
                  onClick={() => openUrl(authUrl)}
                  className="btn btn-secondary w-full"
                >
                  <Icon cls="fa-solid fa-arrow-up-right-from-square" />
                  {t("Браузер не открылся? Открыть вручную")}
                </button>
                <div className="flex items-center justify-center gap-2 text-[12.5px] text-muted">
                  <Icon cls="fa-solid fa-spinner fa-spin" />
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
              <span className="field-label">{t("Ник или e-mail")}</span>
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
              <span className="field-label">{t("Пароль")}</span>
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
            {error && <Err msg={error} />}
            {notice && <Notice msg={notice} />}
            <div className="flex gap-2 pt-1">
              <BackBtn onClick={() => setStep("choose")} />
              <PrimaryBtn onClick={submitAciron} busy={busy} label={t("Войти")} />
            </div>
            <div className="pt-1 text-center text-[12.5px] text-muted">
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

        {}
        {step === "twofa" && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent">
                <Icon
                  cls={`text-2xl ${
                    method === "telegram"
                      ? "fa-brands fa-telegram"
                      : method === "email"
                        ? "fa-solid fa-envelope"
                        : "fa-solid fa-shield-halved"
                  }`}
                />
              </div>
              <p className="text-sm text-text">{t("У аккаунта включён второй фактор")}</p>
              <p className="text-[12.5px] text-muted">
                {method === "telegram"
                  ? tgSent
                    ? t("Бот прислал 6-значный код в Telegram")
                    : t("Пришлём 6-значный код в привязанный Telegram")
                  : method === "email"
                    ? t("Мы отправили 6-значный код на почту")
                    : t("Введите код из приложения-аутентификатора или резервный код")}
              </p>
            </div>

            {}
            {methods.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => pickMethod(m)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-medium transition-colors duration-300 ${
                      method === m
                        ? "border-accent/60 bg-accent/[0.08] text-accent-hover"
                        : "border-line text-text2 hover:border-line-strong hover:text-text"
                    }`}
                  >
                    <Icon
                      cls={
                        m === "telegram"
                          ? "fa-brands fa-telegram"
                          : m === "email"
                            ? "fa-solid fa-envelope"
                            : "fa-solid fa-mobile-screen"
                      }
                    />
                    {m === "telegram" ? "Telegram" : m === "email" ? t("Почта") : t("Приложение")}
                  </button>
                ))}
              </div>
            )}

            {method === "telegram" && !tgSent ? (
              <button
                onClick={sendTelegram}
                disabled={busy}
                className="btn btn-accent w-full"
              >
                <Icon cls={busy ? "fa-solid fa-spinner fa-spin" : "fa-brands fa-telegram"} />
                {t("Прислать код")}
              </button>
            ) : (
              <>
                <label className="block">
                  <span className="field-label">
                    {method === "telegram"
                      ? t("Код из Telegram")
                      : method === "email"
                        ? t("Код из письма")
                        : t("Код 2FA")}
                  </span>
                  <input
                    autoFocus
                    className={`${inputCls} text-center tracking-[0.3em]`}
                    value={code}
                    placeholder="000000"
                    maxLength={method === "totp" ? 9 : 6}
                    onChange={(e) =>
                      setCode(
                        method !== "totp"
                          ? e.target.value.replace(/\D/g, "")
                          : e.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase()
                      )
                    }
                    onKeyDown={(e) => e.key === "Enter" && submitTwofa()}
                  />
                </label>
                {method !== "totp" && (
                  <button
                    onClick={sendTelegram}
                    disabled={busy || cooldown > 0}
                    className="btn btn-secondary w-full"
                  >
                    {cooldown > 0
                      ? t("Отправить код снова через {n} с", { n: cooldown })
                      : t("Отправить код снова")}
                  </button>
                )}
              </>
            )}

            {error && <Err msg={error} />}
            {notice && <Notice msg={notice} />}
            <div className="flex gap-2 pt-1">
              <BackBtn onClick={leaveTwofa} />
              {(method !== "telegram" || tgSent) && (
                <PrimaryBtn onClick={submitTwofa} busy={busy} label={t("Войти")} />
              )}
            </div>
          </div>
        )}

        {step === "register" && (
          <div className="space-y-3">
            <label className="block">
              <span className="field-label">{t("Ник")}</span>
              <input
                autoFocus
                className={inputCls}
                value={regNick}
                placeholder="Player"
                maxLength={16}
                onChange={(e) => setRegNick(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              />
              <span className="mt-1 block text-[12px] text-muted">
                {t("Под этим ником вас будут находить друзья и видеть в игре")}
              </span>
            </label>
            <label className="block">
              <span className="field-label">E-mail</span>
              <input
                className={inputCls}
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">{t("Пароль")}</span>
                <input
                  type="password"
                  className={inputCls}
                  value={password}
                  placeholder={t("от 8 символов")}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label">{t("Повтор пароля")}</span>
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
              <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/12 text-accent">
                <Icon cls="fa-solid fa-envelope-open-text text-2xl" />
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
              className="btn btn-secondary w-full"
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
            <p className="text-center text-[12px] leading-relaxed text-muted">
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
      className={`group flex w-full items-center gap-3.5 rounded-[16px] px-3 py-3 text-left transition-colors duration-300 ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/[0.05]"
      }`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-[19px] ${iconBg}`}>
        {node ?? <Icon cls={`${brand ? "fa-brands" : "fa-solid"} ${icon}`} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[14.5px] font-semibold text-text">
          {title}
          {disabled && (
            <span className="tag">
              <Icon cls="fa-solid fa-lock text-[11px]" />
              {t("скоро")}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">{desc}</div>
      </div>
      {!disabled && (
        <Icon cls="fa-solid fa-chevron-right text-[16px] text-muted transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:translate-x-0.5 group-hover:text-text" />
      )}
    </button>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-danger">
      <span className="dot mt-[6px] bg-danger" />
      <span className="min-w-0 break-words">{msg}</span>
    </div>
  );
}

function Notice({ msg }: { msg: string }) {
  return (
    <div role="status" className="flex items-start gap-2 text-[13px] text-text2">
      <span className="dot mt-[6px] bg-accent" />
      <span className="min-w-0 break-words">{msg}</span>
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-ghost"
    >
      <Icon cls="fa-solid fa-arrow-left text-[12.5px]" />
      {t("Назад")}
    </button>
  );
}

function PrimaryBtn({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="btn btn-accent ml-auto"
    >
      {busy && <Icon cls="fa-solid fa-spinner fa-spin" />}
      {label}
    </button>
  );
}
