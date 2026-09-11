import { findTheme, tokensToCss } from "./themes.js";

const THEME_STYLE_ID = "kodama-theme-vars";

// Where the rule goes: a constructed stylesheet, not a <style> element.
//
// A release build serves a CSP in which Tauri has put a nonce on every <style> of index.html and
// added it to style-src. Once style-src carries a nonce, browsers ignore 'unsafe-inline', so a
// <style> created at runtime, which has no nonce, is dropped without a word. Every theme but Dark
// did nothing in alpha.38, and the dev build could not show it: it is served by Vite, with no
// asset processing and so no nonce. Dark looked right only because it sets nothing.
//
// A constructed stylesheet is built through the CSSOM rather than parsed from inline text, and
// style-src does not govern it. Checked in Chromium under a CSP of that shape: the runtime <style>
// stayed ignored, the constructed sheet applied, and a :root[...] rule still won over it.
// Supported by WebView2 and by WebKit since Safari 16.4; anything older keeps the old element.
let themeSheet = null;

function writeThemeRule(css) {
  if (typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype
      && "adoptedStyleSheets" in document) {
    if (!themeSheet) {
      themeSheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, themeSheet];
    }
    themeSheet.replaceSync(css);
    return;
  }
  let el = document.getElementById(THEME_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

// Applying the colour theme to a document.
//
// Setting `data-theme` alone is not enough. HeroUI ships its own token set and scopes it like
// this:
//
//   light: :root, .light, .default, [data-theme=light], [data-theme=default]
//   dark:  .dark, [data-theme=dark]
//
// Every theme of ours whose name is not literally "dark" therefore misses the dark selector and
// falls through to `:root` — which is HeroUI's LIGHT set. Kodama's own --surface-* tokens are
// correct in that state, so anything styled with those looks right and only the components that
// use HeroUI's own tokens turn white: in the OLED theme the Unison identity card (a CardRoot
// with no bg- class of its own) rendered as a white block with white text on it.
//
// The `dark` class is what HeroUI actually looks for, so we set it from the theme's declared
// mode. Declared, not inferred: the old rule was "every name except light", which held only as
// long as every theme was one we shipped. A theme from the store has a name nothing can read.
//
// Kept as a shared helper because the theme is applied from several places — the main window on
// mount and on change, and each of the separate windows, which have their own documents.
export function applyTheme(theme) {
  const t = theme || "dark";
  const def = findTheme(t);
  const root = document.documentElement;

  // The theme's own values, written as a stylesheet rule rather than as inline properties.
  // Inline would outrank everything, including the high-contrast block, which is an
  // accessibility override and has to win. As a rule it lands after the bundle's :root, and high
  // contrast beats it on specificity (:root[...]).
  const decls = tokensToCss(def.tokens);
  writeThemeRule(decls ? `:root{${decls}}` : "");

  // The name still goes on, because the picker reads it and it is what gets stored. The MODE is
  // what styling keys on now: a theme arriving from outside has a name nothing can pattern-match,
  // and the two rules that used to say [data-theme="light"] have to apply to it just the same.
  root.setAttribute("data-theme", t);
  root.setAttribute("data-mode", def.mode);
  root.classList.toggle("dark", def.mode !== "light");
  applyShape();
  return t;
}


/** Whether corners are squared off. An experiment, see the block in index.css. */
export function readShape() {
  try {
    return localStorage.getItem("kiyoshi-sharp-corners") === "true" ? "sharp" : "round";
  } catch {
    return "round";
  }
}

export function applyShape(shape) {
  const s = shape || readShape();
  document.documentElement.setAttribute("data-shape", s);
  return s;
}

/** The stored theme, for windows that only read it. */
export function readTheme() {
  try {
    return localStorage.getItem("kiyoshi-theme") || "dark";
  } catch {
    return "dark";
  }
}
