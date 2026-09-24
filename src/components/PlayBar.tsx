import { useEffect, useState } from "react";
import VersionMenu from "./VersionMenu";
import AccountMenu from "./AccountMenu";
import AddAccountModal from "./AddAccountModal";
import { getAccounts } from "../api";
import { useLauncherCtx } from "../LauncherContext";
import { useDownloadActive } from "../downloadTask";
import { useLang } from "../i18n";
import Icon from "./Icon";

export default function PlayBar() {
  const { t } = useLang();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(true);
  const [addAccount, setAddAccount] = useState(false);
  const { status, launch, isRunning, stop } = useLauncherCtx();
  const downloading = useDownloadActive();
  const versionRunning = versionId ? isRunning(versionId) : false;

  const refreshAccounts = () =>
    getAccounts().then((a) => setHasAccount(a.accounts.length > 0)).catch(() => {});

  useEffect(() => {
    refreshAccounts();
  }, []);

  const busy = status === "running" || downloading;

  const onPlay = () => {
    if (busy || !versionId) return;

    if (!hasAccount) {
      setAddAccount(true);
      return;
    }
    launch(versionId);
  };

  return (

    <div className="shrink-0 border-t border-line px-8 py-3.5">
      <div className="flex items-center gap-2.5">
      {versionRunning ? (
        <button
          onClick={() => versionId && stop(versionId)}
          className="group flex h-14 min-w-[180px] items-center gap-3 rounded-[18px] bg-[#f2705b] pl-2 pr-7 font-semibold text-[#1a0d0a] shadow-[0_8px_26px_rgba(242,112,91,0.3)] transition-[filter,box-shadow,transform] duration-300 ease-[var(--ease-soft)] hover:brightness-105 active:scale-[0.98]"
        >
          <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-black/15">
            <Icon cls="fa-solid fa-stop text-[18px]" />
          </span>
          <span className="text-[17px]">{t("Закрыть")}</span>
        </button>
      ) : (
        <button
          onClick={onPlay}
          disabled={busy || !versionId}
          title={!versionId ? t("Сначала установите версию") : undefined}
          className={`play-btn group relative flex h-14 min-w-[180px] items-center gap-3 overflow-hidden rounded-[18px] pl-2 pr-7 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
            !busy && versionId ? "play-ready" : ""
          }`}
        >
          <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-black/12 transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:scale-105">
            <Icon cls={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-play"} text-[18px]`} />
          </span>
          <span className="text-[17px]">
            {downloading ? t("Скачивание…") : busy ? t("Загрузка…") : t("Играть")}
          </span>
          {}
          <span aria-hidden className="play-sheen" />
        </button>
      )}

      <VersionMenu onChange={setVersionId} />

      {}
      {}

      <div className="ml-auto flex items-center gap-3">
        <AccountMenu />
      </div>
      </div>

      {addAccount && (
        <AddAccountModal
          onClose={() => setAddAccount(false)}
          onAdded={refreshAccounts}
        />
      )}
    </div>
  );
}
