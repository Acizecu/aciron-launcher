import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  // VITE_ACIRON_ID_URL обязателен для релизной сборки. Без него api.ts молча
  // подставляет https://example.invalid, лаунчер собирается и запускается, все
  // запросы через Rust работают (там свой ACIRON_ID_URL из .cargo/config.toml),
  // но КАЖДАЯ картинка — скины, плащи, аватары друзей — грузится с несуществующего
  // домена и превью остаются пустыми без единого сообщения об ошибке. Именно так
  // уехали 0.9.0 и 0.9.1. Пусть лучше падает сборка, чем релиз.
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
        // Явное выделение вендор-чанков: three и react-рантайм получают
        // стабильные имена/хеши, поэтому не инвалидируют весь vendor между
        // релизами (лучше кэшируется) и парсятся отдельными чанками.
        // Поведение приложения не меняется — это лишь группировка модулей.
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
