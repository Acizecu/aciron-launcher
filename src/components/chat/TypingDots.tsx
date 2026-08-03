/**
 * Индикатор «печатает…» — три точки, набегающие по очереди.
 *
 * Отдельным компонентом, потому что показывается в двух местах: в шапке
 * переписки и в строке списка слева (там он подменяет присутствие вроде
 * «Не активен»).
 */
export default function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-accent ${className}`}>
      печатает
      <span className="inline-flex items-end gap-[2px] pb-[1px]">
        <i className="typing-dot" />
        <i className="typing-dot" />
        <i className="typing-dot" />
      </span>
    </span>
  );
}
