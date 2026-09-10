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
 * The places an extension may offer something, named by Kodama.
 *
 * This list is the contract. An extension says which slot it contributes to and Kodama draws the
 * result without knowing whose it is; the alternative, which is what shipping the Composer looked
 * like at first, is Kodama calling an extension by name from inside a modal. That works for
 * exactly one extension and is the thing an extension system exists to stop.
 *
 * A slot is added when there is a real reason to offer something there, not in anticipation. Each
 * one is a promise about where a stranger's button may appear in Kodama's interface.
 */
export const SLOTS = {
  // The Unison lyrics browser: somewhere to send a listener who wants to write lyrics properly.
  "lyrics.browser": "Beside the list of community lyrics.",
  // Nothing was found for this song. The most useful moment to offer writing them.
  "lyrics.missing": "Where Kodama says it has no lyrics for a song.",
};

/**
 * Every permission that exists, and who may hold it.
 *
 * `tier: "open"` can be granted to anyone. `tier: "internal"` is Kodama's own: it reaches past
 * the sandbox, so no review could make it safe in a stranger's hands.
 *
 * Backend permissions name a ROUTE GROUP rather than "the backend". "May talk to Kodama's
 * backend" is not a sentence anyone can weigh; "may write your overlay's configuration" is.
 */
/**
 * The categories a permission falls into, named after the thing being reached rather than after
 * the part of Kodama that reaches it.
 *
 * That distinction is the whole point and it is easy to get wrong. "Kodama's own services" was a
 * heading about our architecture; the audio behind it is the listener's music, and "Music and
 * audio" is what they are actually deciding about. A phone never says "MediaStore", it says
 * "Music and audio".
 *
 * So a permission is grouped by its SUBJECT, not by which layer implements it: reading the audio
 * Kodama extracted sits beside knowing what is playing, even though one goes through the backend
 * and the other through the bridge.
 */
export const PERMISSION_GROUPS = {
  music:         { label: "Music and audio", icon: "MusicNote" },
  appearance:    { label: "Appearance", icon: "Palette" },
  storage:       { label: "Storage", icon: "FloppyDisk" },
  // "Files", not "Your files": the category names the resource, and the constraint that makes it
  // safe belongs on the action, where it is true. The extension never browses anything.
  files:         { label: "Files", icon: "FileImport" },
  network:       { label: "Network", icon: "Globe" },
  web:           { label: "Web content", icon: "Globe" },
  windows:       { label: "Windows", icon: "ScreencastSimple" },
  overlay:       { label: "Your overlay", icon: "ScreencastSimple" },
  fonts:         { label: "Fonts", icon: "TextSize" },
  notifications: { label: "Notifications", icon: "Megaphone" },
  interface:     { label: "Kodama's interface", icon: "Columns" },
};

/**
 * Every permission that exists, and who may hold it.
 *
 * `tier: "open"` can be granted to anyone. `tier: "internal"` is Kodama's own: it reaches past the
 * sandbox, so no review could make it safe in a stranger's hands.
 *
 * `does` is a verb phrase, in lower case, finishing the sentence "this extension may ...". That is
 * how a phone writes them: "record audio", "show notifications". A noun with an explanatory
 * sentence underneath reads like documentation, and documentation is what people skip.
 */
export const PERMISSIONS = {
  // ── Open: everything here is handed over by the host, one call at a time ──
  "storage":         { tier: "open", group: "storage", does: "keep data of its own" },
  "appearance:read": { tier: "open", group: "appearance", does: "read your theme, text size and language" },
  "player:read":     { tier: "open", group: "music", does: "see what is playing" },
  "player:control":  { tier: "open", group: "music", does: "play, pause and skip" },
  "ui:panel":        { tier: "open", group: "interface", does: "show a panel inside Kodama" },
  "ui:toast":        { tier: "open", group: "notifications", does: "show notifications" },
  "net":             { tier: "open", group: "network", does: "connect to the internet", needsHosts: true },

  // ── Internal: reaches past the sandbox. Kodama's own extensions only ──────
  "window:create":   { tier: "internal", group: "windows", does: "open a window of its own" },
  "files:read":      { tier: "internal", group: "files", does: "open a file you pick" },
  "files:write":     { tier: "internal", group: "files", does: "save a file where you pick" },
  "backend:overlay": { tier: "internal", group: "overlay", does: "read and change your overlay configuration" },
  "backend:fonts":   { tier: "internal", group: "fonts", does: "list the fonts installed on this computer" },
  "backend:composer": { tier: "internal", group: "music", does: "read the audio Kodama extracts for a song" },
  "app:frame":       { tier: "internal", group: "web", does: "show a web page, with everything that site can reach" },
};

export const isInternal = (id) => PERMISSIONS[id]?.tier === "internal";

const ID_OK = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_OK = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const API_OK = /^\d+\.\d+$/;
// A host, not a URL: "example.com" or "*.example.com". No scheme, no path, no port, because a
// permission the reader cannot check by eye is a permission nobody checks.
const HOST_OK = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// An extension's own icon.
//
// Only SVG and PNG. Both are still pictures an <img> renders; SVG cannot run script in that
// context, which is the reason it is safe here and would not be in an <object> or inline.
//
// From one of two places, and both are already-declared, already-reviewed hosts: the store repo
// the manifest itself came from, or the app's own origin, which for an "app" extension is where
// the whole application is loaded from anyway. Anything else would mean the extension list making
// a request to a host nobody vetted, on every visit to the shelf.
const ICON_HOST = "https://raw.githubusercontent.com/KiyoshiTheDevil/kodama-store/";

function iconOf(raw, origin) {
  const url = raw.icon;
  if (typeof url !== "string" || !url) return "";
  if (!/\.(svg|png)(\?|$)/i.test(url)) return null;                 // null = say so, "" = none given
  if (url.startsWith(ICON_HOST)) return url;
  if (origin && url.startsWith(origin + "/")) return url;
  return null;
}

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

  // ── What it offers, and where ──────────────────────────────────────────────
  //
  // Titles may be a plain string or a map of language to string. A theme's title is a proper noun
  // and stays as written; an action's title is a sentence someone reads in their own language,
  // and an extension that cannot say it in German should not be forced to invent one.
  const actions = [];
  const raw_actions = raw.contributes?.actions;
  if (raw_actions !== undefined && !Array.isArray(raw_actions)) fail("contributes.actions must be a list");
  for (const act of Array.isArray(raw_actions) ? raw_actions : []) {
    if (!act || typeof act !== "object") { fail("an action is not an object"); continue; }
    if (!SLOTS[act.slot]) { fail(`unknown slot "${act.slot}"`); continue; }
    const title = act.title;
    const ok_title = typeof title === "string" ? title.trim()
      : (title && typeof title === "object" && typeof title.en === "string") ? title : null;
    if (!ok_title) { fail(`the action for "${act.slot}" needs a title, or a title with at least en`); continue; }
    actions.push({ slot: act.slot, title: ok_title });
  }

  // ── How to hand it the thing being looked at ───────────────────────────────
  //
  // A slot has a subject: the song whose lyrics are missing. Kodama must not know that the
  // Composer expects it as "?v=", so the extension names its own parameter. Without this the host
  // would carry a table of which extension calls the track what, which is the same coupling in a
  // tidier coat.
  let context = null;
  if (raw.context !== undefined) {
    const track = raw.context?.track;
    if (typeof track !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,32}$/.test(track)) {
      fail('context.track must be the name of a query parameter');
    } else if (kind !== "app") {
      fail("only an \"app\" extension is given context through its URL");
    } else {
      context = { track };
    }
  }

  // ── Its own icon ───────────────────────────────────────────────────────────
  const icon = iconOf(raw, kind === "app" ? (ORIGIN_OK(raw.origin) ? new URL(raw.origin).origin : "") : "");
  if (icon === null) {
    fail("icon must be an .svg or .png, on the store repo or on this extension's own origin");
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
      actions,
      icon: icon || "",
      context,
      origin,
      entry: kind === "app" ? (typeof raw.entry === "string" ? raw.entry : "/") : "",
      trusted,
    },
  };
}

/** An action's title in the reader's language, falling back to English and then to anything. */
export function actionTitle(action, language = "en") {
  const t = action?.title;
  if (typeof t === "string") return t;
  if (!t || typeof t !== "object") return "";
  return t[language] || t.en || Object.values(t)[0] || "";
}

/**
 * What an extension may do, gathered into groups.
 *
 * One row per group, the way a phone lists Camera once rather than every call behind it. An
 * extension asking for three things shows three rows with three icons, and the reader is deciding
 * about kinds of access rather than reading an inventory.
 */
export function permissionGroups(manifest) {
  const seen = new Map();
  for (const p of describePermissions(manifest)) {
    const def = PERMISSIONS[p.id];
    const g = PERMISSION_GROUPS[def.group];
    if (!seen.has(def.group)) {
      seen.set(def.group, { id: def.group, label: g.label, icon: g.icon, items: [] });
    }
    seen.get(def.group).items.push(p);
  }
  return [...seen.values()];
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
    const base = { id: p, internal: def.tier === "internal", group: def.group, does: def.does };
    // The two that carry a subject name it. "Network access" without saying to where is the kind
    // of permission line people learn to click past.
    if (p === "app:frame" && manifest.origin) {
      return { ...base, does: `show a page from ${new URL(manifest.origin).host}, with everything that site can reach` };
    }
    if (p === "net" && manifest.hosts?.length) {
      return { ...base, does: `connect to ${manifest.hosts.join(", ")}` };
    }
    return base;
  });
}
