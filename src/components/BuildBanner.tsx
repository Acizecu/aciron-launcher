import { useEffect, useState } from "react";
import { getBuildBanner, type Build } from "../api";

export default function BuildBanner({
  build,
  className = "",
}: {
  build: Build;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (build.banner) {
      getBuildBanner(build.id).then((s) => alive && setSrc(s));
    } else {
      setSrc(null);
    }
    return () => {
      alive = false;
    };
  }, [build.id, build.banner]);

  if (!src) return null;
  return <img src={src} alt="" className={`object-cover ${className}`} />;
}
