import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Single source of truth for the app version: src-tauri/tauri.conf.json (the file tauri-action
// reads when building a release). Injected at build time so the in-app version can never drift
// from the actually-shipped version — no more hardcoded APP_VERSION to forget on bump.
const appVersion = JSON.parse(
  readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf-8")
).version;
const e2eNetworkGuard =
  process.env.VITE_E2E === "true" || process.env.VITE_E2E_NETWORK_GUARD === "true";
const e2eBrowserMode = process.env.VITE_E2E_BROWSER === "true";
const e2eContentSecurityPolicy =
  "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost http://localhost:9847 http://127.0.0.1:9847 ws://127.0.0.1:1421; img-src 'self' data: blob: http://localhost:9847 http://127.0.0.1:9847; media-src 'self' blob: http://localhost:9847 http://127.0.0.1:9847; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' 'unsafe-inline'";
const e2eNoRemoteFonts = {
  name: "e2e-no-remote-fonts",
  transformIndexHtml(html) {
    // Keep the rest of <head> intact: in particular, Vite appends the module
    // entry after the font block. The previous broad match consumed through
    // </head> and left the compiled desktop E2E WebView with an empty root.
    return html.replace(
      /\s*<!-- Google Fonts[\s\S]*?<link\s+rel="stylesheet"[\s\S]*?fonts\.googleapis\.com[^>]*\/>\s*/,
      "\n"
    );
  },
};

export default defineConfig({
  plugins: [tailwindcss(), react(), ...(e2eNetworkGuard ? [e2eNoRemoteFonts] : [])],
  resolve: {
    alias: {
      // WDIO can intercept Tauri IPC only in E2E builds. Production resolves
      // this import to an empty module, so no test bridge is bundled or run.
      "@kodama/e2e-bridge":
        process.env.VITE_E2E === "true"
          ? "@wdio/tauri-plugin"
          : fileURLToPath(new URL("./src/e2e/noop.js", import.meta.url)),
      "@kodama/e2e-network-guard": e2eNetworkGuard
        ? fileURLToPath(new URL("./src/e2e/network-guard.js", import.meta.url))
        : fileURLToPath(new URL("./src/e2e/noop.js", import.meta.url)),
      "@kodama/e2e-runtime-controls": e2eNetworkGuard
        ? fileURLToPath(new URL("./src/e2e/runtime-controls.js", import.meta.url))
        : fileURLToPath(new URL("./src/e2e/noop.js", import.meta.url)),
      ...(e2eBrowserMode
        ? {
            "@tauri-apps/api/webviewWindow": fileURLToPath(
              new URL("./src/e2e/browser-webview-window.js", import.meta.url)
            ),
          }
        : {}),
    },
  },
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    headers: e2eNetworkGuard ? { "Content-Security-Policy": e2eContentSecurityPolicy } : undefined,
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
