// The way out of a theme that made Kodama unreadable.
//
// A theme's values are checked for what they could DO, not for whether the result can be read.
// That check is a security boundary and cannot be a taste one: "--bg-base" and "--t1" both white
// passes every rule there is and leaves an app with no visible text. Curation catches most of it,
// a listener's own edit catches none of it, and either way the person it happens to is looking at
// a blank window with no way to reach the setting that would undo it.
//
// So the way out is a key, not a button. It has to work when nothing is legible, when the focus is
// in some other window, and when the pointer cannot find anything to aim at.
import { applyTheme, readTheme } from "./theme.js";
import { BUILTIN_THEMES } from "./themes.js";
import { THEME_SELECTED } from "./store/sync.js";

export const RESCUE_COMBO = "Ctrl+Shift+Alt+T";
const RESCUE_RECORD = "kodama-theme-rescued";
const SAFE_THEME = "dark";

/** What the last rescue switched off, so the app can name it once the screen is readable again. */
export function takeRescueRecord() {
  try {
    const raw = localStorage.getItem(RESCUE_RECORD);
    if (raw) localStorage.removeItem(RESCUE_RECORD);
    return raw || null;
  } catch { return null; }
}

/**
 * Back to Kodama's own dark.
 *
 * Only when a theme from outside the build is on. Someone who chose Light and hits this by
 * accident should keep Light: nothing a built-in theme does needs rescuing, and a hatch that also
 * fires when nothing is wrong is a hatch people learn to distrust.
 *
 * The theme is left INSTALLED. Removing it would be the more thorough answer and the wrong one:
 * this runs on a keystroke, possibly by accident, and a keystroke should not delete something.
 * Naming it afterwards lets the listener remove it on purpose, or fix it and try again.
 */
export function rescueTheme() {
  const current = readTheme();
  if (BUILTIN_THEMES.some(t => t.id === current)) return false;
  try {
    localStorage.setItem(RESCUE_RECORD, current);
    localStorage.setItem("kiyoshi-theme", SAFE_THEME);
  } catch { /* storage gone: the apply below still fixes the screen for this session */ }
  applyTheme(SAFE_THEME);
  // Every window is wearing the same broken theme, and the listener rescued whichever one they
  // happened to be looking at.
  import("@tauri-apps/api/event").then(({ emit }) => emit(THEME_SELECTED, SAFE_THEME)).catch(() => {});
  return true;
}

/**
 * Listen for the combination, once per document.
 *
 * Called from main.jsx, which every window boots through, so the hatch exists in the store, the
 * equaliser and the overlay editor as well as the player, without five entry points each having
 * to remember it.
 *
 * On `keydown` at the CAPTURE phase on window: an element that stops propagation, a focused text
 * field, or a modal that traps keys must not be able to swallow it. It is deliberately not part of
 * the remappable shortcut set either. A rescue key that someone can rebind, or that a broken state
 * can intercept, is not a rescue key.
 *
 * Matched on `e.code` rather than `e.key`: with Alt held, `key` is layout-dependent and on some
 * keyboards is not a letter at all, while `code` names the physical key everywhere.
 */
export function installThemeRescue() {
  window.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || !e.shiftKey || !e.altKey || e.code !== "KeyT") return;
    e.preventDefault();
    e.stopPropagation();
    rescueTheme();
  }, true);
}
