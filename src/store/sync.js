// Installing happens in one window and shows in another.
//
// The store is its own window, so a theme installed there has to reach the main window's picker
// and, if it replaced or removed the one that is on, the running document itself. localStorage is
// shared between the two, but nothing tells the other window that it changed - and this app has
// already learned once that a bridge which works inside one window does not automatically work
// across two (see the mini player). A Tauri event does reach every webview, so that is what
// carries the news, and each window reads localStorage afresh when it arrives.
import { installTheme, uninstallTheme } from "../theme-catalogue.js";

export const THEMES_CHANGED = "kodama://themes-changed";
/** A theme was CHOSEN in another window. Separate from the above: installing is not selecting. */
export const THEME_SELECTED = "kodama://theme-selected";

async function announce() {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(THEMES_CHANGED);
  } catch { /* not running in Tauri: one window, nothing to tell */ }
}

export async function installThemeEverywhere(entry) {
  const ok = installTheme(entry);
  if (ok) await announce();
  return ok;
}

export async function uninstallThemeEverywhere(id) {
  const ok = uninstallTheme(id);
  if (ok) await announce();
  return ok;
}

/** Run `fn` whenever a theme is installed or removed in any window, this one included. */
export function onThemesChanged(fn) {
  return subscribe(THEMES_CHANGED, fn);
}

/** Run `fn(id)` when another window switches theme. */
export function onThemeSelected(fn) {
  return subscribe(THEME_SELECTED, e => fn(e.payload));
}

function subscribe(name, fn) {
  let stop = () => {};
  let dead = false;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen(name, fn))
    .then(un => { if (dead) un(); else stop = un; })
    .catch(() => {});
  return () => { dead = true; stop(); };
}
