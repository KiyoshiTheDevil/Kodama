// What an extension declares about itself, and what it is allowed to ask for.
//
// Written after measuring the first real candidate rather than before. The draft in the design
// notes led its hook list with "read the player" and "control the player"; the Overlay Editor,
// which is the first extension Kodama will ship, reads NO player state at all. It wants a window,
// two backend routes, file dialogs and eight storage keys. Starting from the draft would have
// produced an interface fitted to an extension nobody had written.
//
// ─── Two shapes, one manifest ────────────────────────────────────────────────
//
// A "panel" runs in a sandboxed iframe inside Kodama and talks over a typed bridge. That is the
// shape a stranger's extension can take, because everything it can reach is something the host
// hands it.
//
// An "app" is a whole web application on an origin of its own, framed inside Kodama: a bundle of
// scripts and fonts served over HTTP, not a script that can be poured into a srcdoc. The Composer
// was measured against this shape and is the reason it exists; it has since been taken out of
// Kodama entirely and will come back through here rather than as a vendored copy.
//
// It is NOT sandboxed from its own origin, and cannot be: being an app on an origin is precisely
// what it means to have that origin's access. What the manifest does is make that plain and
// reviewable, and the tier keeps the shape first-party until there is a reason not to.
//
// It buys one real property over a window, though, and it is the reason to prefer it: a framed app
// has a REAL origin, so messages from it can be checked on the origin as well as on the window
// handle. A panel cannot be checked that way, because every sandboxed frame reports "null".
//
// A "window" gets a Tauri window of its own. The Overlay Editor and the Composer are this shape,
// and they need permissions a stranger can never be given: creating a window, touching the file
// system, calling backend routes. Pretending otherwise would mean one of two bad things, either
// a sandbox with a hole in it or a first-party extension that skips the manifest entirely.
//
// So the difference between first-party and third-party is a POLICY about which permissions are
// grantable to whom, not a gap in the architecture. Kodama's own extensions declare every
// permission they use, in the same file, checked by the same code. That is what keeps the
// manifest honest: the first stranger to write an extension hits a wall Kodama has already felt.

/** Bumped when the bridge changes shape. Major differences are refused, minor ones warn. */
export const API_VERSION = "1.0";

export const KINDS = ["panel", "window", "app"];

/**
 * Every permission that exists, and who may hold it.
 *
 * `tier: "open"` can be granted to anyone. `tier: "internal"` is Kodama's own: it reaches past
 * the sandbox, so no review could make it safe in a stranger's hands.
 *
 * Backend permissions name a ROUTE GROUP rather than "the backend". "May talk to Kodama's
 * backend" is not a sentence anyone can weigh; "may write your overlay's configuration" is.
 */
export const PERMISSIONS = {
  // ── Open: everything here is handed over by the host, one call at a time ──
  "storage":         { tier: "open", grants: "A store of its own. It cannot see Kodama's, or another extension's." },
  "appearance:read": { tier: "open", grants: "The current theme, text size and language, so it can match the app." },
  "player:read":     { tier: "open", grants: "What is playing, and whether it is playing." },
  "player:control":  { tier: "open", grants: "Play, pause, skip. Separate from reading on purpose." },
  "ui:panel":        { tier: "open", grants: "A panel of its own inside Kodama." },
  "ui:toast":        { tier: "open", grants: "Short messages, the way Kodama shows its own." },
  "net":             { tier: "open", grants: "Requests to the hosts it lists, and to nothing else.", needsHosts: true },

  // ── Internal: reaches past the sandbox. Kodama's own extensions only ──────
  "window:create":   { tier: "internal", grants: "A window of its own." },
  "files:read":      { tier: "internal", grants: "Opening a file you choose." },
  "files:write":     { tier: "internal", grants: "Saving a file where you choose." },
  "backend:overlay": { tier: "internal", grants: "Reading and writing the overlay configuration." },
  "backend:fonts":   { tier: "internal", grants: "The list of fonts installed on this computer." },
  "backend:composer": { tier: "internal", grants: "The audio Kodama extracts, for writing lyrics against." },
  "app:frame":       { tier: "internal", grants: "Runs as a page of its own, with everything its origin can reach." },
  // Moving the window is not something an extension can do for itself: a drag region belongs to a
  // webview, and a frame is not one. Internal because it acts on Kodama's window, not the
  // extension's own content, which is a different kind of reach from everything above.
  "window:drag":     { tier: "internal", grants: "Moving the window by dragging its own header." },
};

export const isInternal = (id) => PERMISSIONS[id]?.tier === "internal";

const ID_OK = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_OK = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const API_OK = /^\d+\.\d+$/;
// A host, not a URL: "example.com" or "*.example.com". No scheme, no path, no port, because a
// permission the reader cannot check by eye is a permission nobody checks.
const HOST_OK = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// An origin, not a URL: scheme, host, optional port, nothing else. Plain http is allowed only for
// the local machine, where there is no network to listen on.
const ORIGIN_OK = (o) => {
  if (typeof o !== "string") return false;
  let u;
  try { u = new URL(o); } catch { return false; }
  if (u.pathname !== "/" || u.search || u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
};

/**
 * Read a manifest, strictly, collecting every problem rather than stopping at the first.
 *
 * Returns `{ ok, manifest, problems }`. Problems are plain sentences: this runs both in the
 * publishing check, where an author reads them, and in the app, where they land in a log.
 *
 * `trusted` says whether internal permissions may be asked for. It is a property of where the
 * extension CAME FROM, never of anything the manifest says about itself, or the flag would be
 * the first thing an attacker sets.
 */
export function parseManifest(raw, { trusted = false } = {}) {
  const problems = [];
  const fail = (msg) => problems.push(msg);

  if (!raw || typeof raw !== "object") {
    return { ok: false, manifest: null, problems: ["not an object"] };
  }

  if (!ID_OK.test(raw.id || "")) fail("id must be lowercase letters, digits and hyphens");
  if (!raw.name || typeof raw.name !== "string") fail("no name");
  if (!VERSION_OK.test(raw.version || "")) fail(`version "${raw.version}" is not 1.2.3`);

  const api = String(raw.apiVersion || "");
  if (!API_OK.test(api)) {
    fail(`apiVersion "${raw.apiVersion}" is not major.minor`);
  } else if (api.split(".")[0] !== API_VERSION.split(".")[0]) {
    // A different major is a different bridge. Loading it anyway would hand the extension an
    // interface it was not written against, and the failure would surface as its bug.
    fail(`apiVersion ${api} does not match this build's ${API_VERSION}`);
  }

  const kind = raw.kind;
  if (!KINDS.includes(kind)) fail(`kind must be one of ${KINDS.join(", ")}`);

  // ── Permissions ────────────────────────────────────────────────────────────
  const asked = Array.isArray(raw.permissions) ? raw.permissions : [];
  if (!Array.isArray(raw.permissions)) fail("permissions must be a list, even an empty one");
  const permissions = [];
  const refused = [];
  for (const p of asked) {
    if (typeof p !== "string" || !PERMISSIONS[p]) { fail(`unknown permission "${p}"`); continue; }
    if (isInternal(p) && !trusted) {
      fail(`"${p}" cannot be granted to a published extension`);
      refused.push(p);
      continue;
    }
    permissions.push(p);
  }

  // A window is only ever an internal shape: it exists outside the sandbox by definition.
  //
  // Asked of what the manifest REQUESTED, not of what survived the tier check. A published window
  // extension is already being told the real reason it cannot exist; adding "and by the way it
  // does not ask for the permission it just asked for" sends the author looking for a typo.
  if (kind === "window" && !permissions.includes("window:create") && !refused.includes("window:create")) {
    fail('a "window" extension must ask for window:create');
  }
  if (kind === "panel" && permissions.includes("window:create")) {
    fail('a "panel" extension cannot ask for window:create');
  }

  // ── The origin an app is loaded from ───────────────────────────────────────
  let origin = "";
  if (kind === "app") {
    if (!permissions.includes("app:frame") && !refused.includes("app:frame")) {
      fail('an "app" extension must ask for app:frame');
    }
    if (!ORIGIN_OK(raw.origin)) {
      fail(`origin "${raw.origin}" must be a bare https origin, or http on localhost`);
    } else {
      origin = new URL(raw.origin).origin;
    }
    // The page within that origin. A path, never a URL: an entry that could name its own origin
    // would make the origin above a suggestion.
    if (raw.entry !== undefined && (typeof raw.entry !== "string" || !raw.entry.startsWith("/") || raw.entry.includes("//"))) {
      fail(`entry "${raw.entry}" must be a path beginning with a single /`);
    }
  } else if (raw.origin) {
    fail(`only an "app" extension has an origin`);
  }

  // ── Hosts, for net ─────────────────────────────────────────────────────────
  const hosts = [];
  if (permissions.includes("net")) {
    const list = Array.isArray(raw.hosts) ? raw.hosts : [];
    if (!list.length) fail("net was asked for but no hosts were listed");
    for (const h of list) {
      if (typeof h !== "string" || !HOST_OK.test(h)) fail(`"${h}" is not a bare host name`);
      else hosts.push(h);
    }
  } else if (Array.isArray(raw.hosts) && raw.hosts.length) {
    // Not fatal, but it means the author expected requests to work. Better said than swallowed.
    fail("hosts were listed but net was not asked for");
  }

  if (problems.length) return { ok: false, manifest: null, problems };

  return {
    ok: true,
    problems: [],
    manifest: {
      id: raw.id,
      name: String(raw.name).slice(0, 60),
      version: raw.version,
      apiVersion: api,
      kind,
      description: typeof raw.description === "string" ? raw.description.slice(0, 300) : "",
      authors: Array.isArray(raw.authors) ? raw.authors.filter(a => typeof a === "string").slice(0, 8) : [],
      permissions,
      hosts,
      origin,
      entry: kind === "app" ? (typeof raw.entry === "string" ? raw.entry : "/") : "",
      trusted,
    },
  };
}

/**
 * The permission list as sentences, for the dialog shown before installing.
 *
 * Kodama's own extensions go through this too. Seeing the Overlay Editor's own list written out
 * is the cheapest check that the wording is comprehensible, and it keeps first-party from
 * quietly becoming the path where nobody ever reads the permissions.
 */
export function describePermissions(manifest) {
  return (manifest?.permissions || []).map(p => {
    const def = PERMISSIONS[p];
    if (p === "app:frame" && manifest.origin) {
      return { id: p, internal: true, text: `Runs as a page of its own, loaded from ${manifest.origin}.` };
    }
    if (p === "net" && manifest.hosts?.length) {
      return { id: p, internal: false, text: `Requests to ${manifest.hosts.join(", ")}, and to nothing else.` };
    }
    return { id: p, internal: def.tier === "internal", text: def.grants };
  });
}
