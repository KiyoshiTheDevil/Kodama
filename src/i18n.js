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

// Translation targets written right-to-left. Used for the direction of translated lyric lines,
// not for the app's own interface. Without dir="rtl" the browser still lays these scripts out
// left-to-right, which misplaces punctuation and any Latin words or numbers inside the line.
const RTL_LANGS = new Set(["AR", "HE", "IW", "FA", "UR", "PS", "SD", "YI"]);

export function isRtlLang(code) {
  return RTL_LANGS.has(String(code || "").toUpperCase());
}

// Whether a piece of text reads right-to-left, decided by its first strong directional
// character — the rule the Unicode bidi algorithm itself uses. Lyrics carry no language tag,
// so the text is the only thing we can go on.
const STRONG = /[A-Za-zÀ-ʯͰ-ԯ]|[֐-׿؀-ۿ܀-ݏހ-޿יִ-﷿ﹰ-﻿]/;
const STRONG_RTL = /[֐-׿؀-ۿ܀-ݏހ-޿יִ-﷿ﹰ-﻿]/;

export function isRtlText(text) {
  const m = String(text || "").match(STRONG);
  return !!m && STRONG_RTL.test(m[0]);
}

// Whether a text is worth offering romaji for. Kana are the unambiguous signal; kanji alone
// also counts, since Japanese lines are often written without any kana. Chinese shares the
// ideograph range, so it matches too — the conversion still runs, it just reads as Japanese.
const JAPANESE = /[぀-ゟ゠-ヿㇰ-ㇿ一-鿿ｦ-ﾝ]/;

export function hasJapaneseText(text) {
  return JAPANESE.test(String(text || ""));
}
