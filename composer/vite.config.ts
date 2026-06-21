import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import "vite-react-ssg";
import { writeSeoAssets } from "./scripts/build-seo-assets";
import pkg from "./package.json";

const SITE_ORIGIN = "https://composer.boidu.dev";

export default defineConfig({
  // Kodama serves the built composer from its local backend under this sub-path
  // (same origin as the audio bridge → no CORS). Upstream default is "/".
  base: "/composer-app/",
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    conditions: ["onnxruntime-web-use-extern-wasm", "import", "module", "browser", "default"],
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  ssgOptions: {
    formatting: "none",
    crittersOptions: false,
    async onFinished(outDir) {
      await writeSeoAssets(outDir, SITE_ORIGIN);
    },
  },
});
