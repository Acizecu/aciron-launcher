import { useEffect, useState } from "react";
import VersionMenu from "./VersionMenu";
import AccountMenu from "./AccountMenu";
import AddAccountModal from "./AddAccountModal";
import { getAccounts } from "../api";
import { useLauncherCtx } from "../LauncherContext";
import { useDownloadActive } from "../downloadTask";
import { useLang } from "../i18n";

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
    <div className="flex h-20 shrink-0 items-center gap-3 bg-bg px-4">
      {versionRunning ? (
        <button
          onClick={() => versionId && stop(versionId)}
          className="group flex h-14 min-w-[168px] items-center justify-center gap-3 rounded-xl bg-[#ef4444] px-9 font-bold text-white transition-colors hover:bg-[#dc2626] active:bg-[#b91c1c]"
        >
          <i className="fa-solid fa-stop text-base" />
          <span className="text-lg tracking-wide">{t("Закрыть")}</span>
        </button>
      ) : (
        <button
          onClick={onPlay}
          disabled={busy || !versionId}
          title={!versionId ? t("Сначала установите версию") : undefined}
          className="group flex h-14 min-w-[168px] items-center justify-center gap-3 rounded-xl bg-accent px-9 font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
        >
          <i className={`fa-solid ${busy ? "fa-spinner fa-spin" : "fa-play"} text-base`} />
          <span className="text-lg tracking-wide">
            {downloading ? t("Скачивание…") : busy ? t("Загрузка…") : t("Играть")}
          </span>
        </button>
      )}

      <VersionMenu onChange={setVersionId} />

      {}
      {}

      <div className="ml-auto flex items-center gap-3">
        <AccountMenu />
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
