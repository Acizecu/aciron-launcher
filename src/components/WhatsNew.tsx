import Modal from "./Modal";
import { changesFor } from "../changelog";
import { GITHUB_URL } from "../config";
import { openUrl } from "../api";
import { dtf, t, useLang } from "../i18n";
import Icon from "./Icon";

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
      subtitle={dateLabel ? `${t("Версия")} ${entry.version}, ${dateLabel}` : `${t("Версия")} ${entry.version}`}
      icon="fa-wand-magic-sparkles"
      width="max-w-lg"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => openUrl(`${GITHUB_URL}/releases`)}
            className="btn btn-sm btn-ghost mr-auto"
          >
            <Icon cls="fa-solid fa-arrow-up-right-from-square text-[14px]" />
            {t("Все версии")}
          </button>
          <button
            onClick={onClose}
            className="btn btn-sm btn-accent px-5"
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
          <section className="border-t border-line pt-4">
            <h3 className="text-[12.5px] font-medium text-text2">
              {t("Исправлено")}
            </h3>
            <ul className="mt-2.5 space-y-1.5">
              {entry.fixed.map((f, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-text/85">
                  <Icon cls="fa-solid fa-check mt-1 shrink-0 text-[11.5px] text-accent" />
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
