import { useId } from "react";

export default function AcironLogo({
  size = 96,
  className = "",
}: {

  size?: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const g = (n: number) => `aciron-logo-${n}-${uid}`;
  return (
    <svg
      width={size}
      height={(size * 409) / 541}
      viewBox="0 0 541 409"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M336.561 408.5H205.439C193.901 408.5 186.683 396.018 192.438 386.018L257.999 272.092C263.768 262.067 278.232 262.067 284.001 272.092L349.562 386.018C355.317 396.018 348.099 408.5 336.561 408.5Z"
        fill={`url(#${g(0)})`}
      />
      <path
        d="M506.796 408.5H416.839C409.75 408.5 403.191 404.748 399.598 398.637L239 125.5L329.411 32.5L524.226 378.692C531.728 392.024 522.094 408.5 506.796 408.5Z"
        fill={`url(#${g(1)})`}
      />
      <path
        d="M124.461 408.5H29C15.999 408.5 7.78847 394.525 14.1175 383.168L194.499 59.5C213.921 20.6648 228.924 5.01458 262.396 0.78225C267.764 0.103522 273.225 0.207222 278.577 0.994759C314.378 6.26187 328.767 21.067 344 59L143.39 397.711C139.429 404.399 132.233 408.5 124.461 408.5Z"
        fill={`url(#${g(2)})`}
      />
      <defs>
        <linearGradient
          id={g(0)}
          x1="233.267"
          y1="249.5"
          x2="308.733"
          y2="408.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F5A96B" />
          <stop offset="1" stopColor="#FFBC85" />
        </linearGradient>
        <linearGradient id={g(1)} x1="390" y1="32.5" x2="390" y2="408.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B2723E" />
          <stop offset="1" stopColor="#D29564" />
        </linearGradient>
        <linearGradient id={g(2)} x1="172" y1="0" x2="172" y2="408.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5A96B" />
          <stop offset="1" stopColor="#FFBC85" />
        </linearGradient>
      </defs>
    </svg>
  );
}
