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

// The built index.html must contain no inline <script> and no <style> element. In a release build
// Tauri hashes the first into script-src and puts a nonce on the second, and once either
// directive carries a hash or nonce, browsers ignore 'unsafe-inline' for it - in the main document
// and in every srcdoc frame, which inherits the policy. Themes (a runtime <style>) and sandboxed
// extensions (inline script in a srcdoc frame) then stop working in release only, while the dev
// build shows nothing wrong. So this fails the build instead of shipping that. See public/boot.js.
const noInlineInIndex = {
  name: "kodama-no-inline-in-index",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
      const inlineScript = /<script(?![^>]*\ssrc=)[^>]*>/i.test(withoutComments);
      const styleElement = /<style[\s>]/i.test(withoutComments);
      if (inlineScript || styleElement) {
        throw new Error("index.html has an inline " + (inlineScript ? "<script>" : "<style>")
          + ". Move it into a file under public/ (see public/boot.js): Tauri would add a hash or nonce"
          + " to the CSP, which disables 'unsafe-inline' and breaks themes and extensions in release.");
      }
      return html;
    },
  },
};

export default defineConfig({
  plugins: [tailwindcss(), react(), noInlineInIndex],
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
