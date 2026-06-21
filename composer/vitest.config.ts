import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "@tabler/icons-react",
      "@floating-ui/react",
      "overlayscrollbars-react",
      "motion/react",
      "@dnd-kit/core",
      "react-router-dom",
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        // Separate Vite cache per project. The unit (jsdom) and browser
        // (chromium) projects pre-bundle dependencies for different targets;
        // sharing node_modules/.vite lets one run serve the other corrupted
        // transform output, which surfaced as intermittent import failures.
        cacheDir: "node_modules/.vite/vitest-unit",
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.browser.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup-unit.ts"],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
      {
        extends: true,
        cacheDir: "node_modules/.vite/vitest-browser",
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup-browser.ts"],
          testTimeout: 20000,
          hookTimeout: 20000,
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: {
                args: ["--autoplay-policy=no-user-gesture-required"],
              },
            }),
            headless: true,
            screenshotFailures: false,
            // fileParallelism: false on the instance avoids the parallelism-
            // degradation flake documented in vitest-dev/vitest#7616 and the
            // userEvent timeout flake in #7871. Slower but deterministic.
            instances: [{ browser: "chromium", fileParallelism: false }],
          },
        },
      },
    ],
  },
});
