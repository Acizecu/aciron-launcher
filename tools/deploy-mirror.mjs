

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HOST = process.env.ACIRON_MIRROR_HOST || "root@89.125.56.104";
const DIR = (process.env.ACIRON_MIRROR_DIR || "/var/www/dl.aciron.pro").replace(/\/+$/, "");
const KEY = process.env.ACIRON_SSH_KEY || path.join(os.homedir(), ".ssh", "aciron-vps");

const manifestPath = path.join(ROOT, "latest.mirror.json");
if (!fs.existsSync(manifestPath)) {
  console.error("Нет latest.mirror.json — сначала `npm run make-latest-json`.");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const url = manifest.platforms["windows-x86_64"].url;
const assetName = decodeURIComponent(new URL(url).pathname.replace(/^\

const nsisDir = path.join(ROOT, "src-tauri/target/release/bundle/nsis");
const match = fs.existsSync(nsisDir)
  ? fs.readdirSync(nsisDir).find((f) => f.replace(/ /g, ".") === assetName)
  : null;
if (!match) {
  console.error("Не найден установщик для", assetName, "в", nsisDir);
  process.exit(1);
}
const exeOnDisk = path.join(nsisDir, match);

if (!fs.existsSync(KEY)) {
  console.error("Нет ssh-ключа", KEY, "— заведи его по D:\\dev\\aciron-vps-access.md.");
  process.exit(1);
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) {
    console.error("Не удалось запустить", cmd, "—", r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(cmd, "вернул", r.status);
    process.exit(r.status ?? 1);
  }
};

const ssh = ["-i", KEY, "-o", "BatchMode=yes"];

console.log(`Установщик → ${HOST}:${DIR}/${assetName}`);
run("scp", [...ssh, exeOnDisk, `${HOST}:${DIR}/${assetName}`]);

console.log(`Манифест   → ${HOST}:${DIR}/latest.json`);
run("scp", [...ssh, manifestPath, `${HOST}:${DIR}/.latest.json.new`]);
run("ssh", [
  ...ssh,
  HOST,
  `mv ${DIR}/.latest.json.new ${DIR}/latest.json && chown caddy:caddy ${DIR}/latest.json '${DIR}/${assetName}' && chmod 644 ${DIR}/latest.json '${DIR}/${assetName}'`,
]);

console.log("\nГотово. Что теперь лежит на зеркале:");
run("ssh", [...ssh, HOST, `ls -lh ${DIR}`]);
