

import codes from "./emoji-codes.json";

const files = import.meta.glob("./assets/twemoji/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byCode = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const code = path.split("/").pop()!.replace(".svg", "");
  byCode.set(code, url);
}

const codeOf = codes as Record<string, string>;

export const KNOWN = new Set(Object.keys(codeOf).filter((e) => byCode.has(codeOf[e])));

export function twemojiUrl(emoji: string): string | null {
  const code = codeOf[emoji];
  return code ? byCode.get(code) ?? null : null;
}

export type Piece = { text: string } | { emoji: string; url: string };

export function splitEmoji(input: string): Piece[] {
  const out: Piece[] = [];
  let buf = "";
  const chars = [...input];
  for (let i = 0; i < chars.length; ) {
    let hit: { emoji: string; url: string } | null = null;
    for (let len = Math.min(4, chars.length - i); len >= 1 && !hit; len--) {
      const cand = chars.slice(i, i + len).join("");
      const url = twemojiUrl(cand);
      if (url) hit = { emoji: cand, url };
      if (hit) i += len;
    }
    if (hit) {
      if (buf) {
        out.push({ text: buf });
        buf = "";
      }
      out.push(hit);
    } else {
      buf += chars[i];
      i++;
    }
  }
  if (buf) out.push({ text: buf });
  return out;
}
