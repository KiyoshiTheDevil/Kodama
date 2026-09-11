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
import { parseManifest, actionTitle, SANDBOXED } from "./manifest.js";
import { isTrustedExtension } from "./trust.js";

const INSTALLED_KEY = "kodama-installed-extensions";
// A sandboxed extension's code, kept per id beside the manifest. Kept rather than fetched on every
// start: an extension that runs should not depend on GitHub answering, and what runs should be the
// bytes that were checked on the day they were installed, not whatever the host serves today.
const CODE_KEY = (id) => `kodama-ext-code-${id}`;
const STORAGE_KEY = (id) => `kodama-ext-${id}`;

/** The installed code of a sandboxed extension, or null. */
export function extensionCode(id) {
  try { return localStorage.getItem(CODE_KEY(id)); } catch { return null; }
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch a sandboxed extension's code and check it against the catalogue's checksum.
 *
 * The checksum is over the bytes, as UTF-8 text, exactly as the store's generator hashes them. A
 * mismatch is refused outright: it means the file changed after it was reviewed, and the review is
 * the only thing standing between a stranger's code and this frame.
 */
async function fetchCode(manifest, doFetch = fetch) {
  let text;
  try {
    const r = await doFetch(manifest.script, { cache: "no-cache" });
    if (!r.ok) return { ok: false, problems: [`the extension's code could not be downloaded (HTTP ${r.status})`] };
    text = await r.text();
  } catch {
    return { ok: false, problems: ["the extension's code could not be downloaded"] };
  }
  if ((await sha256Hex(text)) !== manifest.scriptSha256) {
    return { ok: false, problems: ["the extension's code does not match what was reviewed"] };
  }
  return { ok: true, text };
}
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
export async function installExtension(entry, { doFetch } = {}) {
  const { ok, manifest, problems } = parseManifest(entry, { trusted: isTrustedExtension(entry?.id) });
  if (!ok) return { ok: false, problems };
  if (SANDBOXED.has(manifest.kind)) {
    const code = await fetchCode(manifest, doFetch);
    if (!code.ok) return code;
    try { localStorage.setItem(CODE_KEY(manifest.id), code.text); }
    catch { return { ok: false, problems: ["storage is full"] }; }
  }
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
  // Its code, and everything it kept. A scrobbler's token lives in that storage, and removing the
  // extension while leaving its token behind would be removing it only in appearance.
  try { localStorage.removeItem(CODE_KEY(id)); localStorage.removeItem(STORAGE_KEY(id)); } catch { /* nothing to remove */ }
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
      out.push({ extensionId: ext.id, name: ext.name, slot, icon: ext.icon,
                 title: actionTitle(action, language) });
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
