import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: { env: Record<string, string | undefined> };

const APP_VERSION = process.env.npm_package_version ?? "0.0.0";
const APP_CHANNEL = process.env.ACIRON_CHANNEL ?? "local";

export default defineConfig(({ command, mode }) => {

  const env = loadEnv(mode, process.cwd(), "");
  if (command === "build" && !env.VITE_ACIRON_ID_URL) {
    throw new Error(
      "VITE_ACIRON_ID_URL не задан — скины и плащи в сборке будут ссылаться на " +
        "https://example.invalid. Скопируй .env.example в .env.local и впиши адрес."
    );
  }

  return {
  plugins: [react(), tailwindcss()],

  build: {
    rollupOptions: {
      output: {

        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/three/") || id.includes("\\three\\")) return "three";
            if (
              id.includes("/react/") ||
              id.includes("\\react\\") ||
              id.includes("/react-dom/") ||
              id.includes("\\react-dom\\") ||
              id.includes("/scheduler/") ||
              id.includes("\\scheduler\\")
            )
              return "react-vendor";
          }
        },
      },
    },
  },

  clearScreen: false,

  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_CHANNEL__: JSON.stringify(APP_CHANNEL),
  },

  server: {
    port: 1420,
    strictPort: true,

    watch: {

      ignored: ["**/src-tauri/**", "**/src/assets/**"],
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 60 },
    },
  },
  };
});
