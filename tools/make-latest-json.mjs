

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REPO = process.env.ACIRON_RELEASE_REPO || "Acizecu/aciron-launcher";
const TAG = process.env.ACIRON_RELEASE_TAG || "";
const PRIVATE = process.env.ACIRON_PRIVATE_REPO === "1";

const conf = JSON.parse(fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8"));
const version = conf.version;

const nsisDir = path.join(ROOT, "src-tauri/target/release/bundle/nsis");
const files = fs.existsSync(nsisDir) ? fs.readdirSync(nsisDir) : [];
const exe = files.find((f) => /-setup\.exe$/i.test(f) && f.includes(`_${version}_`));
if (!exe) {
  console.error("Не найден *-setup.exe в", nsisDir, "— сначала собери подписанный установщик.");
  process.exit(1);
}
const sigPath = path.join(nsisDir, exe + ".sig");
if (!fs.existsSync(sigPath)) {
  console.error("Нет подписи", sigPath, "— собери с TAURI_SIGNING_PRIVATE_KEY_PATH (createUpdaterArtifacts).");
  process.exit(1);
}
const signature = fs.readFileSync(sigPath, "utf8").trim();

const assetName = process.env.ACIRON_ASSET_NAME || exe.replace(/ /g, ".");

let url;
if (PRIVATE) {

  const ref = TAG || "dev-latest";
  url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(assetName)}?ref=${encodeURIComponent(ref)}`;
} else if (TAG) {
  url = `https://github.com/${REPO}/releases/download/${TAG}/${assetName}`;
} else {
  url = `https://github.com/${REPO}/releases/latest/download/${assetName}`;
}

const manifest = {
  version,
  notes: `Aciron Launcher v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url },
  },
};

const out = path.join(ROOT, "latest.json");
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log("Готово →", out);
console.log(`Репо:    ${REPO}${PRIVATE ? " (private)" : ""}`);
console.log(`Тег:     ${TAG || "(latest)"}`);
console.log(`Версия:  ${version}`);
console.log(`URL:     ${url}`);
console.log("\nВ GitHub Release залей:");
console.log(`  • ${exe}`);
console.log(`  • ${exe}.sig`);
console.log("  • latest.json");
