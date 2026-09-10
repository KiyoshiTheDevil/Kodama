// Which extensions are installed, and what they offer.
//
// Installed means downloaded: the manifest comes from the catalogue, is parsed by the same code
// that would parse a stranger's, and is kept in this installation's own storage. Nothing about an
// extension ships in Kodama's bundle except the short list in trust.js of which ids may hold a
// permission that reaches past the sandbox.
//
// That distinction is the whole of it. Before this, "installing" was a flag beside a manifest that
// had been compiled in, and the buttons an extension contributed were already in the app waiting
// to be shown. Now there is nothing to show until something has actually been fetched.
import { parseManifest, actionTitle } from "./manifest.js";
import { isTrustedExtension } from "./trust.js";

const INSTALLED_KEY = "kodama-installed-extensions";
export const EXTENSIONS_CHANGED = "kodama://extensions-changed";

/**
 * The installed manifests, re-parsed on the way out.
 *
 * Never trusted as stored. Anything in localStorage has been outside Kodama's hands, so it goes
 * through the same gate as the day it arrived: an entry that was edited to award itself
 * window:create is refused here exactly as it would have been on install.
 */
export function installedExtensions() {
  return readRaw()
    .map(entry => parseManifest(entry, { trusted: isTrustedExtension(entry?.id) }))
    .filter(r => r.ok)
    .map(r => r.manifest);
}

export function installedExtension(id) {
  return installedExtensions().find(m => m.id === id) || null;
}

export function extensionInstalled(id) {
  return !!installedExtension(id);
}

/** The stored entries exactly as they were published, before any parsing. */
function readRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function write(list) {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(list));
    return true;
  } catch { return false; }
}

// ─── Installing ──────────────────────────────────────────────────────────────

async function announce() {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EXTENSIONS_CHANGED);
  } catch { /* not running in Tauri */ }
}

/**
 * Take a catalogue entry and keep it.
 *
 * Parsed before it is stored as well as after. Refusing at install time is what lets the store say
 * why, rather than accepting something that silently never loads.
 */
export async function installExtension(entry) {
  const { ok, manifest, problems } = parseManifest(entry, { trusted: isTrustedExtension(entry?.id) });
  if (!ok) return { ok: false, problems };
  // The entries as published are what get stored, not the parsed results: parsing is a gate, and
  // storing its output would quietly bake this build's idea of the format into the data. So the
  // raw list is read here rather than installedExtensions(), which hands back parsed manifests.
  const rest = readRaw().filter(e => e?.id !== manifest.id);
  if (!write([...rest, entry])) return { ok: false, problems: ["storage is full"] };
  await announce();
  return { ok: true, manifest };
}

export async function uninstallExtension(id) {
  if (!write(readRaw().filter(e => e?.id !== id))) return false;
  await announce();
  return true;
}

// ─── What they offer ─────────────────────────────────────────────────────────

/**
 * What the installed extensions offer at one slot.
 *
 * Read fresh every time rather than built once at startup: installing one has to show up without
 * a restart, and a list captured at boot is a list that lies the moment anything changes.
 */
export function contributionsFor(slot, language = "en") {
  const out = [];
  for (const ext of installedExtensions()) {
    for (const action of ext.actions || []) {
      if (action.slot !== slot) continue;
      out.push({ extensionId: ext.id, name: ext.name, slot, title: actionTitle(action, language) });
    }
  }
  return out;
}

/** Run `fn` whenever an extension is installed or removed, in any window. */
export function onExtensionsChanged(fn) {
  let stop = () => {};
  let dead = false;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen(EXTENSIONS_CHANGED, fn))
    .then(un => { if (dead) un(); else stop = un; })
    .catch(() => {});
  return () => { dead = true; stop(); };
}
