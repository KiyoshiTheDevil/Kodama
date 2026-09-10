// Which extensions are on, and what they offer.
//
// An extension being present in the build is not the same as a listener wanting it. The Composer
// shipped for months and nobody used it; the difference between that and this is that now it has
// to be asked for. Kodama's own extensions are declared in the build because their permissions
// reach past the sandbox and only a trusted source may hold those, but nothing is enabled until
// someone says so.
//
// "Installing" one is therefore a flag rather than a download. That is honest for an app
// extension, whose bytes live on the web either way, and it is the same gesture as installing a
// theme, which is also just a value moving into localStorage.
import { builtinExtensions } from "./builtin.js";
import { actionTitle } from "./manifest.js";

const ENABLED_KEY = "kodama-enabled-extensions";
export const EXTENSIONS_CHANGED = "kodama://extensions-changed";

function readEnabled() {
  try {
    const raw = JSON.parse(localStorage.getItem(ENABLED_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(x => typeof x === "string") : [];
  } catch { return []; }
}

function writeEnabled(list) {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([...new Set(list)]));
    return true;
  } catch { return false; }
}

/** Every extension this build knows, each marked with whether it is on. */
export function allExtensions() {
  const on = new Set(readEnabled());
  return builtinExtensions().map(m => ({ ...m, enabled: on.has(m.id) }));
}

export function extensionEnabled(id) {
  return readEnabled().includes(id);
}

/**
 * What the enabled extensions offer at one slot.
 *
 * Read fresh every time rather than built once at startup: enabling one has to show up without a
 * restart, and a list captured at boot is a list that lies the moment anything changes.
 */
export function contributionsFor(slot, language = "en") {
  const out = [];
  for (const ext of allExtensions()) {
    if (!ext.enabled) continue;
    for (const action of ext.actions || []) {
      if (action.slot !== slot) continue;
      out.push({ extensionId: ext.id, name: ext.name, slot, title: actionTitle(action, language) });
    }
  }
  return out;
}

// ─── Turning one on and off ──────────────────────────────────────────────────

async function announce() {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EXTENSIONS_CHANGED);
  } catch { /* not running in Tauri */ }
}

export async function enableExtension(id) {
  if (!builtinExtensions().some(m => m.id === id)) return false;
  const ok = writeEnabled([...readEnabled(), id]);
  if (ok) await announce();
  return ok;
}

export async function disableExtension(id) {
  const ok = writeEnabled(readEnabled().filter(x => x !== id));
  if (ok) await announce();
  return ok;
}

/** Run `fn` whenever an extension is turned on or off, in any window. */
export function onExtensionsChanged(fn) {
  let stop = () => {};
  let dead = false;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen(EXTENSIONS_CHANGED, fn))
    .then(un => { if (dead) un(); else stop = un; })
    .catch(() => {});
  return () => { dead = true; stop(); };
}
