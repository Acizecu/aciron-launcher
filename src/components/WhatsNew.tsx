import Modal from "./Modal";
import { changesFor } from "../changelog";
import { GITHUB_URL } from "../config";
import { openUrl } from "../api";
import { dtf, t, useLang } from "../i18n";

export default function WhatsNew({
  version,
  onClose,
}: {
  version: string;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const entry = changesFor(version);
  if (!entry) return null;

  const date = new Date(entry.date);
  const dateLabel = Number.isNaN(date.getTime()) ? "" : dtf().format(date);

  return (
    <Modal
      title={t("Что нового")}
      subtitle={dateLabel ? `${t("Версия")} ${entry.version} · ${dateLabel}` : `${t("Версия")} ${entry.version}`}
      icon="fa-wand-magic-sparkles"
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => openUrl(`${GITHUB_URL}/releases`)}
            className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            <i className="fa-solid fa-arrow-up-right-from-square mr-2 text-xs" />
            {t("Все версии")}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-bold text-bg transition-colors hover:bg-accent-hover active:bg-accent-active"
          >
            {t("Понятно")}
          </button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        {entry.added.map((item, i) => {
          const c = item[lang];
          return (
            <section key={i}>
              <h3 className="flex items-baseline gap-2 text-[15px] font-medium text-text">
                <span className="mt-[-1px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {c.title}
              </h3>
              <p className="mt-1.5 pl-[14px] text-[13px] leading-relaxed text-muted">{c.body}</p>
            </section>
          );
        })}

        {entry.fixed.length > 0 && (
          <section className="rounded-xl border border-border/70 bg-panel/40 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("Исправлено")}
            </h3>
            <ul className="mt-2.5 space-y-1.5">
              {entry.fixed.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-text/85">
                  <i className="fa-solid fa-check mt-1 shrink-0 text-[10px] text-accent" />
                  <span>{f[lang]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
