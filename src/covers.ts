

const files = import.meta.glob("./assets/covers/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byName: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  byName[name.toLowerCase()] = url;
}

export function coverFor(id: string, mcVersion: string): string | null {
  const major = mcVersion.split(".").slice(0, 2).join(".");
  const keys = [id.replace("build:", "build-"), id, mcVersion, major, "default"];
  for (const k of keys) {
    const hit = byName[k.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}
