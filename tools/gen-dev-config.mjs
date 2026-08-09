

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src-tauri/tauri.dev.conf.json");
const OUT = path.join(ROOT, "src-tauri/tauri.dev.effective.conf.json");

const TOKEN_PLACEHOLDER = "__ACIRON_DEV_UPDATE_TOKEN__";

let raw = fs.readFileSync(SRC, "utf8");

const token = process.env.ACIRON_DEV_UPDATE_TOKEN ?? "";
if (!token) {

  console.warn(
    "[gen-dev-config] ACIRON_DEV_UPDATE_TOKEN пуст — эффективный конфиг соберётся " +
      "с пустым токеном. Auto-update в такой сборке работать не будет (это ок для " +
      "локального теста данных; CI должен передавать секрет)."
  );
}

if (!raw.includes(TOKEN_PLACEHOLDER)) {
  console.warn(
    `[gen-dev-config] В ${path.basename(SRC)} нет плейсхолдера ${TOKEN_PLACEHOLDER} — ` +
      "проверь, не убрали ли заголовок Authorization."
  );
}

raw = raw.split(TOKEN_PLACEHOLDER).join(token);

try {
  JSON.parse(raw);
} catch (e) {
  console.error("[gen-dev-config] Эффективный конфиг получился невалидным JSON:", e.message);
  process.exit(1);
}

fs.writeFileSync(OUT, raw);
const masked = token ? token.slice(0, 4) + "…(" + token.length + " chars)" : "(empty)";
console.log(`[gen-dev-config] Готово → ${path.relative(ROOT, OUT)}`);
console.log(`[gen-dev-config] Токен внедрён: ${masked}`);
