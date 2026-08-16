

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, "..", "aciron-launcher-github"));

const SKIP_DIRS = new Set([
  "node_modules", "dist", "dist-ssr", "target", "gen", ".git",
  ".idea", ".vscode", "github-export", "aciron-launcher",
  ".cargo",
]);
const SKIP_FILES = new Set([
  "TODO.md", "launcher-screenshot.png", ".DS_Store", "Thumbs.db",
]);

const SKIP_RE = [/\.local$/, /\.log$/, /^\.env/, /\.key$/, /\.pem$/, /secret/i, /apikeys/i, /\.effective\./i];

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs", ".java"]);

const skipName = (name) =>
  SKIP_DIRS.has(name) || SKIP_FILES.has(name) || SKIP_RE.some((re) => re.test(name));

function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = src[i];
        out += ch;
        if (ch === "\\") {
          out += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        i++;
        if (ch === quote) break;
      }
      continue;
    }

    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }

  return out
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

let copied = 0;
let stripped = 0;

function walk(srcDir, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (skipName(entry.name)) continue;
    const from = path.join(srcDir, entry.name);
    const to = path.join(outDir, entry.name);
    if (entry.isDirectory()) {
      walk(from, to);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXT.has(ext)) {
        fs.writeFileSync(to, stripComments(fs.readFileSync(from, "utf8")));
        stripped++;
      } else {
        fs.copyFileSync(from, to);
      }
      copied++;
    }
  }
}

if (OUT === ROOT) {
  console.error("Папка назначения совпадает с проектом — прерываю.");
  process.exit(1);
}

if (fs.existsSync(OUT)) {
  for (const entry of fs.readdirSync(OUT)) {
    if (entry === ".git") continue;
    fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
  }
}
walk(ROOT, OUT);
console.log(`Готово → ${OUT}`);
console.log(`Файлов скопировано: ${copied}, из них с вырезанными комментариями: ${stripped}`);
