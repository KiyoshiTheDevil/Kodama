import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
