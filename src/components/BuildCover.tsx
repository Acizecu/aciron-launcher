import { useEffect, useState } from "react";
import { getBuildImage, type Build } from "../api";

const loaderIcon: Record<string, string> = {
  fabric: "fa-scroll",
  forge: "fa-hammer",
  neoforge: "fa-fire",
  quilt: "fa-layer-group",
};

export default function BuildCover({
  build,
  className = "h-12 w-12",
  rounded = "rounded-lg",
}: {
  build: Build;
  className?: string;
  rounded?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (build.image) {
      getBuildImage(build.id).then((s) => alive && setSrc(s));
    } else {
      setSrc(null);
    }
    return () => {
      alive = false;
    };
  }, [build.id, build.image]);

  if (src) {
    return (
      <div className={`shrink-0 overflow-hidden ${rounded} ${className}`}>
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center bg-accent/15 text-accent ${rounded} ${className}`}
    >
      <i className={`fa-solid ${loaderIcon[build.loader] ?? "fa-cube"} text-lg`} />
    </span>
  );
}
