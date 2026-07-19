import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: ["composer/", "coverage/", "dist/", "node_modules/", "python-backend/", "src-tauri/"],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    plugins: {
      ...reactHooks.configs.flat.recommended.plugins,
      ...reactRefresh.configs.vite.plugins,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      // These React compiler-era rules expose useful migration work in the
      // existing frontend, but they should not make the newly added lint gate
      // unusable while that work is addressed incrementally.
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-refresh/only-export-components": "warn",
    },
    languageOptions: {
      ecmaVersion: "latest",
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
  },
  {
    files: ["vite.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["e2e/**/*.{js,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.mocha,
        browser: "readonly",
        $: "readonly",
      },
    },
  },
  prettierConfig,
];
