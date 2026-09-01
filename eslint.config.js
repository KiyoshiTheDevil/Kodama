// Deliberately narrow. This is not a style linter — the project has no formatting rules and
// adding a few hundred cosmetic warnings to a 6000-line file would only train everyone to
// ignore the output. It exists for one job: catch the mistakes the Vite build does NOT catch.
//
// The build compiles a file with an undefined identifier or a use-before-declaration without
// complaint; both only surface at runtime, as a blank screen. That happened twice in one
// evening (a constant left behind by a bad cut, and a block pasted into the wrong component),
// and both would have been caught here before the app was ever reloaded.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactPlugin from "eslint-plugin-react";

export default [
  {
    files: ["src/**/*.{js,jsx}", "tools/**/*.js", "analytics/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // Injected by Vite at build time (see vite.config.js `define`), so it is a real
      // global here even though nothing declares it in source.
      globals: { ...globals.browser, ...globals.es2021, __APP_VERSION__: "readonly" },
    },
    linterOptions: { reportUnusedDisableDirectives: false },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      // Warning, not error: it also flags references inside callbacks that only run later,
      // which is harmless and common in these components. Kept on anyway, because a
      // genuine temporal-dead-zone read during render looks identical to no-undef-free
      // code and this is the only rule that sees it.
      "no-use-before-define": ["warn", { functions: false, classes: false, variables: true }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-const-assign": "error",
    },
  },
  // Core ESLint does not connect a JSX element name to a variable, so `no-undef` never sees an
  // undefined component: <Microphone /> with no import passed the lint and crashed the settings
  // panel at runtime, which is precisely the class of fault this config exists to catch. The
  // react plugin's own rule does make that connection.
  //
  // unused-vars stays off for the same underlying reason: without the plugin, every component
  // imported for JSX looked unused.
  {
    files: ["src/**/*.jsx"],
    plugins: { react: reactPlugin },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-no-undef": "error",
    },
  },
];
