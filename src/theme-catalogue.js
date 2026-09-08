// The published theme catalogue.
//
// One file rather than a folder per theme, on purpose: a theme is between thirteen and
// thirty-five values, so the whole catalogue is a few kilobytes and costs one request instead of
// one per entry. That holds while these are Kodama's own themes. If it ever carries submitted
// ones, with screenshots and stylesheets, it wants splitting - which is what `schema` is for.
//
// It lives beside news.json in the same repo, so it needs no host that connect-src does not
// already allow and is published the same way: edit the file, commit, done.
import { APP_VERSION } from "./version.js";
import { BUILTIN_THEMES, sanitizeTokens, readInstalledThemes, writeInstalledThemes } from "./themes.js";

export const CATALOGUE_URL =
  "https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/updates/themes.json";

/** The schema this build understands. An entry declaring a higher one is skipped, not guessed at. */
export const CATALOGUE_SCHEMA = 1;

// ─── Versions ────────────────────────────────────────────────────────────────
//
// Kodama's versions are "1.0.0-alpha.37": three numbers and a prerelease with a counter of its
// own. Comparing them as strings puts alpha.9 above alpha.37, so they are compared piecewise,
// with a missing prerelease ranking ABOVE one that is present - 1.0.0 is later than any
// 1.0.0-alpha, which is the whole point of the suffix.
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v || "").trim());
  if (!m) return null;
  return { nums: [+m[1], +m[2], +m[3]], pre: m[4] || null };
}

export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return 0;                       // unreadable: treat as equal, never as blocking
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;                          // release beats prerelease
  if (!pb.pre) return -1;
  const fa = pa.pre.split("."), fb = pb.pre.split(".");
  for (let i = 0; i < Math.max(fa.length, fb.length); i++) {
    const x = fa[i], y = fb[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return +x < +y ? -1 : 1;         // alpha.9 below alpha.37, not above it
    return x < y ? -1 : 1;
  }
  return 0;
}

/** Whether this build is new enough for an entry. */
export function meetsMinVersion(entry, appVersion = APP_VERSION) {
  if (!entry?.minVersion) return true;
  return compareVersions(appVersion, entry.minVersion) >= 0;
}

// ─── Reading the catalogue ───────────────────────────────────────────────────

const STRING = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * One catalogue entry, reduced to what this build will act on.
 *
 * Everything is taken defensively even though the file is ours: it is fetched over the network,
 * so it is the same kind of input as any other, and a typo should drop one entry rather than
 * break the list. Returns null for anything unusable.
 */
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!/^[\w-]{1,64}$/.test(raw.id || "")) return null;
  if (Number(raw.schema || CATALOGUE_SCHEMA) > CATALOGUE_SCHEMA) return null;
  const tokens = sanitizeTokens(raw.tokens);
  if (!Object.keys(tokens).length) return null;        // nothing to apply
  return {
    id: raw.id,
    title: STRING(raw.title, 40) || raw.id,
    description: STRING(raw.description, 300),
    creators: Array.isArray(raw.creators) ? raw.creators.filter(c => typeof c === "string").slice(0, 8) : [],
    version: STRING(raw.version, 24) || "1.0.0",
    minVersion: STRING(raw.minVersion, 24),
    mode: raw.mode === "light" ? "light" : "dark",
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === "string").slice(0, 8) : [],
    tokens,
  };
}

/**
 * The published themes, with what this build can say about each one.
 *
 * `builtin` and `installed` are answered here rather than at the call site so the store shows
 * one truth: a theme that ships with this build needs no installing, and one already installed
 * needs an update only when the published version is newer.
 */
export async function fetchThemeCatalogue(url = CATALOGUE_URL) {
  let data;
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return { ok: false, themes: [] };
    data = await r.json();
  } catch {
    return { ok: false, themes: [] };
  }
  if (!data || Number(data.schema) > CATALOGUE_SCHEMA || !Array.isArray(data.themes)) {
    return { ok: false, themes: [] };
  }
  return { ok: true, themes: annotateThemes(data.themes.map(normalizeEntry).filter(Boolean)) };
}

/**
 * What this build can say about each entry, recomputed from what is installed right now.
 *
 * Separate from the fetch so it can be repeated after installing or removing one. Doing that by
 * fetching again would work and would also mean a network round trip to answer a question the
 * app already knows the answer to - and would leave the button reading "Install" until it came
 * back.
 */
export function annotateThemes(entries) {
  const installed = readInstalledThemes();
  return entries.map(e => {
    const local = installed.find(i => i.id === e.id);
    return {
      ...e,
      builtin: BUILTIN_THEMES.some(b => b.id === e.id),
      installed: !!local,
      installedVersion: local?.version || null,
      updatable: !!local && compareVersions(e.version, local.version || "0.0.0") > 0,
      supported: meetsMinVersion(e),
    };
  });
}

// ─── Installing ──────────────────────────────────────────────────────────────

export function installTheme(entry) {
  const e = normalizeEntry(entry);
  if (!e || !meetsMinVersion(e)) return false;
  const next = readInstalledThemes().filter(t => t.id !== e.id);
  next.push({ id: e.id, label: e.title, mode: e.mode, version: e.version, tokens: e.tokens });
  return writeInstalledThemes(next);
}

export function uninstallTheme(id) {
  return writeInstalledThemes(readInstalledThemes().filter(t => t.id !== id));
}
