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
// 1.1: the "background" shape, events pushed to an extension, settings Kodama draws for it, and
// code downloaded with a checksum. Additions only, so an extension written for 1.0 still loads.
export const API_VERSION = "1.1";

// "background" is a panel with nowhere to be seen: the same sandboxed frame, mounted out of sight
// for as long as Kodama runs. It exists for extensions whose whole job happens between Kodama and
// a service - a scrobbler - and which would otherwise need a panel left open for no reason.
export const KINDS = ["panel", "window", "app", "background"];

/** The shapes that run as code in a sandboxed frame, downloaded rather than framed from a site. */
export const SANDBOXED = new Set(["panel", "background"]);

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
 * A permission is a CAPABILITY, named from the listener's side: what the extension can do to them,
 * not which part of Kodama makes it possible. The earlier list had a line reading "shows a page
 * from composer.kiyoshi.dev, with everything that site can reach", which was true and told nobody
 * anything. The Composer imports and exports projects and TTML through a file picker, uploads
 * songs, pulls audio into the cache through its search, and downloads a separation model. Those
 * are the things to disclose, and "it is a web page" hid every one of them.
 *
 * `tier: "open"` can be granted to anyone. `tier: "internal"` is Kodama's own: it reaches past the
 * sandbox, so no review could make it safe in a stranger's hands.
 *
 * `frame` is what the permission unlocks on the frame of an "app" extension, so that granting it
 * is also where it is enforced. Without this the list was decoration: the frame never had
 * allow-downloads, so an app could not export a file whatever its manifest said, and nothing on
 * the page would have told you why.
 *
 * The words themselves live in the locale files, as perm_<id>. They are Kodama's sentences about
 * an extension, not the extension's own, so they are translated like everything else Kodama says.
 */
export const PERMISSIONS = {
  // ── Open: handed over by the host, one call at a time ─────────────────────
  "appearance":    { tier: "open", icon: "Palette" },
  "storage":       { tier: "open", icon: "FloppyDisk" },
  "nowplaying":    { tier: "open", icon: "MusicNote" },
  // Separate from nowplaying on purpose: something that shows the current title has no business
  // skipping it.
  "playback":      { tier: "open", icon: "MusicNote" },
  "notifications": { tier: "open", icon: "Megaphone" },
  "panel":         { tier: "open", icon: "Columns" },
  // For a panel this is enforced: every request goes through the host and is checked against the
  // hosts it declared. For an app it is a disclosure and not a lock, because an app runs on an
  // origin of its own and reaches the network the way any web page does. Said plainly here so that
  // nobody later reads the panel's guarantee into the app's line.
  "network":       { tier: "open", icon: "Globe" },

  // ── Internal: reaches past the sandbox. Kodama's own extensions only ──────
  // Reading through a picker and writing through a download. The picker is the listener choosing;
  // the download is what needs unlocking, and it is what this permission unlocks.
  "files":         { tier: "internal", icon: "FileImport", frame: { sandbox: ["allow-downloads"] } },
  // Playing audio in the frame without a gesture first, and the audio Kodama extracts for a song.
  "audio":         { tier: "internal", icon: "MusicNote", frame: { allow: ["autoplay"] } },
  "window":        { tier: "internal", icon: "ScreencastSimple" },
  "overlay":       { tier: "internal", icon: "ScreencastSimple" },
  "fonts":         { tier: "internal", icon: "TextSize" },
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

// A sandboxed extension's code. From the store repo only, the same reviewed place the manifest came
// from, and pinned by a checksum the store's generator writes beside it: what is installed is
// byte for byte what was reviewed, and a file changed afterwards on the host is refused rather
// than run. A script from anywhere else would be code nobody looked at.
const SCRIPT_OK = (url) => typeof url === "string" && url.startsWith(ICON_HOST) && /\.js$/i.test(url)
  && !url.slice(ICON_HOST.length).includes("..");
const SHA256_OK = /^[0-9a-f]{64}$/;

// A setting Kodama draws for an extension, and stores in that extension's own storage under `key`.
// Three types, because those are the three a form needs and each is drawn the way Kodama draws
// its own: a line of text, a secret that is never shown back in full, and a switch.
const SETTING_TYPES = new Set(["text", "secret", "toggle"]);
const SETTING_KEY_OK = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const localised = (v, max) => {
  if (typeof v === "string") return v.trim() ? v.trim().slice(0, max) : null;
  if (v && typeof v === "object" && typeof v.en === "string" && v.en.trim()) {
    const out = {};
    for (const [k, t] of Object.entries(v)) if (/^[a-z]{2}(-[A-Z]{2})?$/.test(k) && typeof t === "string") out[k] = t.slice(0, max);
    return out;
  }
  return null;
};

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
  if (kind === "window" && !permissions.includes("window") && !refused.includes("window")) {
    fail('a "window" extension must ask for window');
  }
  if (SANDBOXED.has(kind) && permissions.includes("window")) {
    fail(`a "${kind}" extension cannot ask for window`);
  }
  // An app is framed with its own origin and is therefore not sandboxed away from what that origin
  // can reach. That is a property of the SHAPE, so it is gated on the shape. It used to be a
  // permission called app:frame, which then had to appear in the list, where it read as
  // "this is a web page" and disclosed nothing.
  if (kind === "app" && !trusted) {
    fail("an \"app\" extension cannot be published: only Kodama's own may run unsandboxed");
  }

  // ── The origin an app is loaded from ───────────────────────────────────────
  let origin = "";
  if (kind === "app") {
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

  // ── Its code, for the shapes that run code of their own ────────────────────
  let script = "", scriptSha256 = "";
  if (SANDBOXED.has(kind)) {
    if (!SCRIPT_OK(raw.script)) fail("script must be a .js file on the store repo");
    else script = raw.script;
    if (!SHA256_OK.test(raw.scriptSha256 || "")) fail("scriptSha256 is missing; the store generator writes it");
    else scriptSha256 = raw.scriptSha256;
  } else if (raw.script || raw.scriptSha256) {
    fail(`a "${kind}" extension is not loaded from a script`);
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
  // Nothing to open. An action is a button that opens the extension somewhere, and a background
  // extension has no somewhere.
  if (kind === "background" && actions.length) fail("a \"background\" extension has no actions to offer");

  // ── Settings, drawn by Kodama ──────────────────────────────────────────────
  //
  // Drawn by Kodama rather than by the extension, which has no surface of its own when it runs in
  // the background and should not need one to ask for a token. Stored in the extension's own
  // storage, so it reads them like anything else it keeps - and so they need that permission.
  const settings = [];
  const raw_settings = raw.contributes?.settings;
  if (raw_settings !== undefined && !Array.isArray(raw_settings)) fail("contributes.settings must be a list");
  const seenKeys = new Set();
  for (const st of Array.isArray(raw_settings) ? raw_settings.slice(0, 12) : []) {
    if (!st || typeof st !== "object") { fail("a setting is not an object"); continue; }
    if (!SETTING_KEY_OK.test(st.key || "") || seenKeys.has(st.key)) { fail(`setting key "${st.key}" is not a unique name`); continue; }
    if (!SETTING_TYPES.has(st.type)) { fail(`setting "${st.key}" must be text, secret or toggle`); continue; }
    const label = localised(st.label, 60);
    if (!label) { fail(`setting "${st.key}" needs a label, or a label with at least en`); continue; }
    seenKeys.add(st.key);
    // A switch shows a position before anyone touches it. Declared, so Kodama draws the same
    // position the extension assumes; without it the page read "off" while the extension ran.
    if (st.default !== undefined && (st.type !== "toggle" || typeof st.default !== "boolean")) {
      fail(`setting "${st.key}": only a toggle takes a default, and it must be true or false`); continue;
    }
    settings.push({ key: st.key, type: st.type, label, hint: localised(st.hint, 160) || "",
                    ...(st.type === "toggle" ? { default: st.default === true } : {}) });
  }
  if (settings.length && !permissions.includes("storage")) fail("settings are kept in storage, so they need the storage permission");

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

  // ── Hosts, for a panel's network ───────────────────────────────────────────
  //
  // Only a panel lists them, because only a panel's requests go through the host and can be held
  // to a list. An app declaring network is disclosing, and asking it for hosts would suggest a
  // limit that is not there.
  const hosts = [];
  if (permissions.includes("network") && SANDBOXED.has(kind)) {
    const list = Array.isArray(raw.hosts) ? raw.hosts : [];
    if (!list.length) fail("network was asked for but no hosts were listed");
    for (const h of list) {
      if (typeof h !== "string" || !HOST_OK.test(h)) fail(`"${h}" is not a bare host name`);
      else hosts.push(h);
    }
  } else if (Array.isArray(raw.hosts) && raw.hosts.length) {
    // Not fatal, but it means the author expected requests to work. Better said than swallowed.
    fail("hosts were listed but network was not asked for");
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
      settings,
      script,
      scriptSha256,
      icon: icon || "",
      context,
      origin,
      entry: kind === "app" ? (typeof raw.entry === "string" ? raw.entry : "/") : "",
      trusted,
    },
  };
}

/** A localised field (a string, or a map with at least en) in the reader's language. */
export function localisedText(v, language = "en") {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object") return "";
  return v[language] || v.en || Object.values(v)[0] || "";
}

/** An action's title in the reader's language, falling back to English and then to anything. */
export function actionTitle(action, language = "en") {
  const t = action?.title;
  if (typeof t === "string") return t;
  if (!t || typeof t !== "object") return "";
  return t[language] || t.en || Object.values(t)[0] || "";
}

/**
 * What an extension may do, one line per capability.
 *
 * Flat, not grouped. Each line is already a category of its own, "can access the internet", "can
 * access local files", so a heading above it would only repeat it. `detail` names the subject
 * where there is one, because "can access the internet" without saying to where is the kind of
 * line people learn to click past.
 *
 * The sentence itself is looked up by the caller as perm_<id>: this module decides WHAT is
 * disclosed, the locale files decide how it is said.
 */
export function describePermissions(manifest) {
  const lines = (manifest?.permissions || []).map(p => {
    const def = PERMISSIONS[p];
    let detail = "";
    if (p === "network" && manifest.hosts?.length) detail = manifest.hosts.join(", ");
    return { id: p, internal: def.tier === "internal", icon: def.icon, detail };
  });
  // Not a permission but a fact worth the same line: it runs whenever Kodama does, without a
  // window that would say so. Listed first, because it changes how every line after it reads.
  if (manifest?.kind === "background") lines.unshift({ id: "background", internal: false, icon: "Clock", detail: "" });
  return lines;
}

/**
 * The frame attributes an app's permissions add up to.
 *
 * The base is what any framed app needs to run at all; everything else is granted by a permission
 * and only by one. Enforced here rather than trusted to the app: an app that did not ask for files
 * gets a frame that cannot start a download, whatever its own code tries.
 */
export function frameAttributes(manifest) {
  const sandbox = new Set(["allow-scripts", "allow-same-origin", "allow-forms", "allow-popups"]);
  const allow = new Set();
  for (const p of manifest?.permissions || []) {
    const f = PERMISSIONS[p]?.frame;
    for (const t of f?.sandbox || []) sandbox.add(t);
    for (const t of f?.allow || []) allow.add(t);
  }
  return { sandbox: [...sandbox].join(" "), allow: [...allow].join("; ") };
}
