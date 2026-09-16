import { useEffect, useState } from "react";

export default function Head({
  skin,
  name,
  color = "#4f9d69",
  size = 32,
  className = "",
}: {
  skin: string;
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const fallback = `https://mc-heads.net/skin/${encodeURIComponent(name || "Steve")}`;
  const sources = skin && skin !== fallback ? [skin, fallback] : [fallback];

  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);

  const dead = idx >= sources.length;
  const src = dead ? "" : sources[idx];

  useEffect(() => {
    setIdx(0);
    setOk(false);
  }, [skin, name]);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setOk(true);
    img.onerror = () => alive && setIdx((i) => i + 1);
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  if (dead || !ok) {
    return (
      <div
        className={`grid place-items-center rounded-md ${className}`}
        style={{ width: size, height: size, background: color }}
      >
        <span
          style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}
          className="font-bold text-white"
        >
          {(name[0] || "?").toUpperCase()}
        </span>
      </div>
    );
  }

  const scale = size / 8;
  const layer = (offsetX: number): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    backgroundImage: `url("${src}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${64 * scale}px ${64 * scale}px`,
    backgroundPosition: `${-offsetX * scale}px ${-8 * scale}px`,
    imageRendering: "pixelated",
  });

  return (
    <div
      className={`relative overflow-hidden rounded-md ${className}`}
      style={{ width: size, height: size }}
    >
      <div style={layer(8)} />
      {}
      <div style={layer(40)} />
    </div>
  );
}
