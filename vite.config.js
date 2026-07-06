import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

// Single source of truth for the app version: src-tauri/tauri.conf.json (the file tauri-action
// reads when building a release). Injected at build time so the in-app version can never drift
// from the actually-shipped version — no more hardcoded APP_VERSION to forget on bump.
const appVersion = JSON.parse(
  readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf-8")
).version;

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    watch: {
      // Ignore the Python backend directory — file writes there (custom lyrics,
      // cache, profiles, etc.) must NOT trigger Vite HMR and cause a full page reload.
      ignored: ["**/python-backend/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
