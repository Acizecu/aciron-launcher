import { t } from "../../i18n";

export default function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-accent ${className}`}>
      {t("печатает")}
      <span className="inline-flex items-end gap-[2px] pb-[1px]">
        <i className="dot-bounce" />
        <i className="dot-bounce" />
        <i className="dot-bounce" />
      </span>
    </span>
  );
}
