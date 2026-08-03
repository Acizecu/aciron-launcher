import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
});
