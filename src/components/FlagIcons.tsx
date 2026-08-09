import { useId } from "react";

type Props = { size?: number; className?: string };

function box(size: number) {

  return { width: size, height: Math.round((size / 10) * 7) };
}

export function FlagRu({ size = 20, className }: Props) {
  const id = useId();
  const { width, height } = box(size);
  return (
    <svg
      viewBox="0 0 20 14"
      width={width}
      height={height}
      className={className}
      aria-hidden
      focusable="false"
    >
      <clipPath id={id}>
        <rect width="20" height="14" rx="2.5" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect width="20" height="14" fill="#ffffff" />
        <rect y="4.67" width="20" height="4.66" fill="#0039a6" />
        <rect y="9.33" width="20" height="4.67" fill="#d52b1e" />
      </g>
      <rect
        width="20"
        height="14"
        rx="2.5"
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.6"
      />
    </svg>
  );
}

export function FlagEn({ size = 20, className }: Props) {
  const id = useId();
  const { width, height } = box(size);
  return (
    <svg
      viewBox="0 0 20 14"
      width={width}
      height={height}
      className={className}
      aria-hidden
      focusable="false"
    >
      <clipPath id={id}>
        <rect width="20" height="14" rx="2.5" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect width="20" height="14" fill="#012169" />
        {}
        <path d="M0 0 L20 14 M20 0 L0 14" stroke="#ffffff" strokeWidth="3.2" />
        <path d="M0 0 L20 14 M20 0 L0 14" stroke="#c8102e" strokeWidth="1.4" />
        {}
        <path d="M10 0 V14 M0 7 H20" stroke="#ffffff" strokeWidth="4.6" />
        <path d="M10 0 V14 M0 7 H20" stroke="#c8102e" strokeWidth="2.6" />
      </g>
      <rect
        width="20"
        height="14"
        rx="2.5"
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.6"
      />
    </svg>
  );
}

export function LangFlag({ lang, size, className }: { lang: string } & Props) {
  return lang === "ru" ? (
    <FlagRu size={size} className={className} />
  ) : (
    <FlagEn size={size} className={className} />
  );
}
