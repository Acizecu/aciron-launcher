

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const raw = process.argv[2];
if (!raw) {
  console.error("Использование: node tools/sync-version.mjs <version>");
  console.error("Пример прод: node tools/sync-version.mjs 0.9.0");
  console.error("Пример дев:  node tools/sync-version.mjs 0.9.0-dev.42");
  process.exit(1);
}

let version = raw.trim().replace(/^v/i, "");

const plus = version.indexOf("+");
if (plus !== -1) {
  console.warn(`Отбрасываю build-metadata "${version.slice(plus)}" — в конфиги пишем чистый semver.`);
  version = version.slice(0, plus);
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
if (!SEMVER.test(version)) {
  console.error(`Некорректная semver-версия: "${version}"`);
  console.error('Ожидается вида "0.9.0" или "0.9.0-dev.42".');
  process.exit(1);
}

let changed = 0;

{
  const p = path.join(ROOT, "src-tauri/tauri.conf.json");
  const conf = JSON.parse(fs.readFileSync(p, "utf8"));
  if (conf.version !== version) {
    conf.version = version;
    fs.writeFileSync(p, JSON.stringify(conf, null, 2) + "\n");
    console.log(`tauri.conf.json  -> ${version}`);
    changed++;
  } else {
    console.log(`tauri.conf.json  = ${version} (без изменений)`);
  }
}

{
  const p = path.join(ROOT, "src-tauri/Cargo.toml");
  const src = fs.readFileSync(p, "utf8");
  const lines = src.split(/\r?\n/);
  let inPackage = false;
  let done = false;
  for (let i = 0; i < lines.length && !done; i++) {
    const line = lines[i];
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      inPackage = header[1].trim() === "package";
      continue;
    }
    if (inPackage && /^\s*version\s*=/.test(line)) {
      const next = line.replace(/version\s*=\s*"[^"]*"/, `version = "${version}"`);
      if (next !== line) {
        lines[i] = next;
        fs.writeFileSync(p, lines.join("\n"));
        console.log(`Cargo.toml       -> ${version}`);
        changed++;
      } else {
        console.log(`Cargo.toml       = ${version} (без изменений)`);
      }
      done = true;
    }
  }
  if (!done) {
    console.error("Не нашёл version в [package] у Cargo.toml — прерываю.");
    process.exit(1);
  }
}

// --- package.json -----------------------------------------------------------
{
  const p = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`package.json     -> ${version}`);
    changed++;
  } else {
    console.log(`package.json     = ${version} (без изменений)`);
  }
}

console.log(`\nГотово. Версия синхронизирована: ${version} (изменено файлов: ${changed}).`);
