/**
 * Kodama — Internationalization (i18n)
 *
 * Translations are stored as JSON files in src/locales/.
 * To add a new language:
 * 1. Create src/locales/<code>.json (copy en.json and translate all values)
 * 2. Add the language metadata (code, label, flag SVG) to src/locales/languages.json
 *
 * The app automatically picks up any new locale file — no code changes needed.
 * Missing keys fall back to English, then to the key itself.
 */

import languageList from "./locales/languages.json";

// Auto-load all locale JSON files from src/locales/ (except languages.json)
const localeModules = import.meta.glob("./locales/*.json", { eager: true });

const translations = {};
for (const [path, module] of Object.entries(localeModules)) {
  const code = path.match(/\/([\w-]+)\.json$/)?.[1];
  if (code && code !== "languages") {
    translations[code] = module.default;
  }
}

// Only expose languages that actually have a translation file loaded
export const LANGUAGES = languageList.filter((lang) => translations[lang.code]);

/**
 * Translation completeness for a language, in percent (0–100), measured against
 * the English source: how many of en's keys are present and non-empty in the locale.
 * The source language (en) is always 100%.
 */
export function translationProgress(code) {
  const en = translations.en || {};
  const keys = Object.keys(en);
  if (keys.length === 0) return 0;
  if (code === "en") return 100;
  const loc = translations[code] || {};
  let done = 0;
  for (const k of keys) {
    const v = loc[k];
    if (v != null && String(v).trim() !== "") done++;
  }
  return Math.round((done / keys.length) * 100);
}

/**
 * Returns the translation for a key.
 * Fallback order: selected language → English → key itself
 *
 * Supports variable interpolation via a vars object.
 * Variables in the string are written as %varName (e.g. %u for a username).
 * Example: translate("de", "greeting", { u: "Max" })
 *   "Hallo, %u!" → "Hallo, Max!"
 */
export function translate(lang, key, vars = {}) {
  let str = translations[lang]?.[key] ?? translations.en?.[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`%${k}`, v);
  }
  return str;
}

export default translations;
