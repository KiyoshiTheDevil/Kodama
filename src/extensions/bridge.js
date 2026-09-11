// What an extension may ask for, and what happens when it asks for something else.
//
// Deliberately free of the DOM. The iframe, the postMessage plumbing and the lifecycle live in
// host.js; this is the part that decides, and a decision that can only be tested by opening a
// window is a decision nobody tests. Every rule below is exercised in node.
//
// The shape is one call, one reply: { id, method, params } in, { id, ok, result | error } out.
// Nothing is pushed at the extension that it did not ask for except events it subscribed to, and
// nothing is exposed by handing over an object: the host performs the work and returns a value.
// An extension never holds a reference to anything of Kodama's.
import { PERMISSIONS } from "./manifest.js";

/** Which permission each method needs. A method missing from here cannot be called at all. */
export const METHODS = {
  "storage.get":      "storage",
  "storage.set":      "storage",
  "storage.remove":   "storage",
  "storage.keys":     "storage",
  "appearance.get":   "appearance",
  "player.get":       "nowplaying",
  "player.play":      "playback",
  "player.pause":     "playback",
  "player.next":      "playback",
  "player.previous":  "playback",
  "ui.toast":         "notifications",
  "net.fetch":        "network",
};

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Bytes an extension may keep, and the longest single value. A quota, not a suggestion. */
export const STORAGE_QUOTA = 256 * 1024;
export const VALUE_MAX = 64 * 1024;

/**
 * Whether a host matches one of the patterns the manifest listed.
 *
 * Compared on the parsed hostname, never on the URL string. "https://evil.com/?x=example.com"
 * contains "example.com" and is not example.com, and a substring test would have said yes.
 */
export function hostAllowed(url, patterns) {
  let host;
  try {
    const u = new URL(url);
    // Only over TLS. A permission that says "requests to example.com" should not also mean
    // "and anyone on your network may read them".
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch { return false; }
  return (patterns || []).some(p => {
    const pat = p.toLowerCase();
    if (pat.startsWith("*.")) {
      const base = pat.slice(2);
      // A wildcard covers subdomains and the bare name, but not "notexample.com".
      return host === base || host.endsWith("." + base);
    }
    return host === pat;
  });
}

/**
 * The thing that answers an extension's calls.
 *
 * `impl` is a map of method name to async function, supplied by whoever is hosting: the real app
 * in production, a stub in a test. Keeping the implementations out means this file can say what
 * is ALLOWED without also knowing how anything is done.
 */
export function createDispatcher(manifest, impl) {
  const granted = new Set(manifest?.permissions || []);

  return async function handle(msg) {
    if (!msg || typeof msg !== "object" || typeof msg.id !== "string") {
      // No id means nothing can be replied to. Dropped rather than guessed at.
      return null;
    }
    const reply = (patch) => ({ id: msg.id, ...patch });

    const method = msg.method;
    const need = METHODS[method];
    if (!need) {
      return reply({ ok: false, error: { code: "unknown_method", message: `no method "${method}"` } });
    }
    if (!granted.has(need)) {
      // Named, not vague. An extension author debugging this should not have to guess which of
      // twelve permissions the call wanted.
      return reply({ ok: false, error: { code: "denied", message: `"${method}" needs the "${need}" permission` } });
    }
    if (!impl[method]) {
      return reply({ ok: false, error: { code: "unavailable", message: `"${method}" is not available here` } });
    }

    // net is the one method whose ARGUMENT carries a permission of its own: the manifest lists
    // hosts, and a granted "network" says nothing about which.
    if (method === "net.fetch" && !hostAllowed(msg.params?.url, manifest.hosts)) {
      return reply({
        ok: false,
        error: { code: "denied", message: `"${msg.params?.url}" is not one of the hosts this extension declared` },
      });
    }

    try {
      const result = await impl[method](msg.params || {}, manifest);
      return reply({ ok: true, result });
    } catch (e) {
      // The extension is told what went wrong with ITS call. Anything else the host knows stays
      // with the host: an error message is a channel too.
      const code = e instanceof BridgeError ? e.code : "failed";
      return reply({ ok: false, error: { code, message: String(e?.message || e).slice(0, 300) } });
    }
  };
}

/**
 * A store of its own, inside Kodama's.
 *
 * Namespaced by extension id and quota'd, because one extension filling localStorage would take
 * the whole app down with it. That has happened here once already, from Kodama's own lyrics
 * cache, and an extension is a far likelier culprit than the app.
 */
export function storageImpl(readAll, writeAll) {
  const own = (manifest) => `kodama-ext-${manifest.id}`;
  const load = (m) => {
    try {
      const raw = JSON.parse(readAll(own(m)) || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch { return {}; }
  };
  const save = (m, data) => {
    const text = JSON.stringify(data);
    if (text.length > STORAGE_QUOTA) {
      throw new BridgeError("quota", `this extension may keep ${Math.round(STORAGE_QUOTA / 1024)} KB`);
    }
    writeAll(own(m), text);
  };
  return {
    "storage.get": ({ key }, m) => load(m)[String(key)] ?? null,
    "storage.keys": (_p, m) => Object.keys(load(m)),
    "storage.set": ({ key, value }, m) => {
      const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
      if (text.length > VALUE_MAX) {
        throw new BridgeError("too_large", `a single value may be ${Math.round(VALUE_MAX / 1024)} KB`);
      }
      const data = load(m);
      data[String(key)] = value ?? null;
      save(m, data);
      return true;
    },
    "storage.remove": ({ key }, m) => {
      const data = load(m);
      delete data[String(key)];
      save(m, data);
      return true;
    },
  };
}

/** Every permission that exists, for anyone building a host. Kept beside METHODS so they cannot drift. */
export function methodsFor(permission) {
  return Object.entries(METHODS).filter(([, p]) => p === permission).map(([m]) => m);
}

/** A permission with no method behind it is a promise the bridge cannot keep. */
export function unreachablePermissions() {
  return Object.entries(PERMISSIONS)
    .filter(([id, def]) => def.tier === "open" && id !== "panel" && !methodsFor(id).length)
    .map(([id]) => id);
}
