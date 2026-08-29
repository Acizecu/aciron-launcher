import { useEffect, useRef } from "react";
import { markdownToHtml } from "../markdown";
import { sanitizeToFragment } from "../sanitize";
import { openUrl } from "../api";

export default function RichText({
  source,
  format,
  className = "",
}: {
  source: string;
  format: "markdown" | "html" | "";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!source || !format) {
      el.replaceChildren();
      return;
    }
    const html = format === "markdown" ? markdownToHtml(source) : source;
    el.replaceChildren(sanitizeToFragment(html));
  }, [source, format]);

  return (
    <div
      ref={ref}

      className={`rich selectable ${className}`}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest?.("[data-href]");
        const url = a?.getAttribute("data-href");
        if (!url) return;
        e.preventDefault();
        openUrl(url);
      }}
    />
  );
}
