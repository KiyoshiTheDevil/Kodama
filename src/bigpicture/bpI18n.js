// Big Picture is mounted as a sibling of <App/> (see main.jsx), so it's outside the app's
// language context and can't use useLang(). It reads the selected language straight from
// localStorage instead — the same "kiyoshi-lang" key the rest of the app persists — and calls
// the shared translate(). Missing keys fall back to English, then to the key itself.
import { translate } from "../i18n.js";

export function bpt(key, vars) {
  const lang = localStorage.getItem("kiyoshi-lang") || "de";
  return translate(lang, key, vars);
}
