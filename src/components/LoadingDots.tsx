
export default function LoadingDots({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-end gap-[2px] pb-[3px] align-baseline ${className}`}
    >
      <i className="dot-bounce" />
      <i className="dot-bounce" />
      <i className="dot-bounce" />
    </span>
  );
}
