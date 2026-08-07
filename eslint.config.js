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
  // React components are referenced from JSX, which no-undef sees but core ESLint does not
  // associate with the JSX element name. Treating every capitalised JSX tag as a read is what
  // the react plugin normally does; instead of pulling that plugin in, unused-vars stays off
  // entirely — it is not the class of bug this config is here for.
  {
    files: ["src/**/*.jsx"],
    rules: { "no-unused-vars": "off" },
  },
];
