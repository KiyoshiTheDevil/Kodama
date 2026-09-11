// The published catalogue, from the store repo.
//
// Themes and presets live in KiyoshiTheDevil/kodama-store rather than in this repo. They are
// content, not code: a theme is a list of colours, with no way to execute anything, so it has no
// business sharing a release cycle or a licence with the app. Publishing one is a file and a
// commit over there, and every installed copy of Kodama sees it the next time it looks - no tag,
// no CI run, no release.
//
// Built-in themes are deliberately NOT published. Their entries could only ever be offered to a
// build that already has them, so they would be an Install button that does nothing.
//
// One file rather than a folder per entry: a theme is between thirteen and thirty-five values, so
// the whole catalogue is a few kilobytes and costs one request instead of one per entry. If it
// ever carries screenshots and stylesheets it wants splitting, which is what `schema` is for.
//
// It sits on raw.githubusercontent.com, the same host as news.json, so connect-src already allows
// it. Note that raw caches for a few minutes: a fresh commit is not visible the same second.
import { APP_VERSION } from "../version.js";
import { BUILTIN_THEMES, sanitizeTokens, readInstalledThemes, writeInstalledThemes } from "../themes.js";
import { installedPresets, PRESET_KINDS } from "./presets.js";
import { parseManifest } from "../extensions/manifest.js";
import { isTrustedExtension } from "../extensions/trust.js";
import { installedExtensions } from "../extensions/registry.js";

export const CATALOGUE_URL =
  "https://raw.githubusercontent.com/KiyoshiTheDevil/kodama-store/main/index.json";

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
// Screenshots may only come from the store repo itself.
//
// The backend's image proxy fetches whatever it is handed, which is what makes a screenshot
// possible without touching the content policy. It also means a wrong URL in the catalogue would
// have the app fetching an arbitrary host on every visit to a page. The catalogue is ours, so this
// is not a defence against an attacker so much as against a typo and against the day it is not
// only ours: an entry can point at pictures of itself, and at nothing else.
const SHOT_PREFIX = "https://raw.githubusercontent.com/KiyoshiTheDevil/kodama-store/";

function screenshots(raw) {
  if (!Array.isArray(raw.screenshots)) return [];
  return raw.screenshots
    .filter(u => typeof u === "string" && u.startsWith(SHOT_PREFIX) && u.length < 400)
    .slice(0, 6);
}

function common(raw) {
  return {
    // What the entry costs, measured rather than declared: a published number would be one more
    // thing to keep in step with the file it describes, and it is the file that is downloaded.
    size: new TextEncoder().encode(JSON.stringify(raw)).length,
    // Kodama's own, rather than merely curated. Everything here is reviewed; this says who wrote
    // it, which is a different promise and the one a badge should make.
    //
    // Matched on the project rather than on a person's account name: the credit on these pages is
    // "Kodama", and an entry the project made with someone else keeps the mark, which is why this
    // asks whether Kodama is AMONG the makers and not whether it is the only one.
    official: raw.official !== false && (raw.creators || []).includes("Kodama"),
    screenshots: screenshots(raw),
    id: raw.id,
    title: STRING(raw.title, 40) || raw.id,
    description: STRING(raw.description, 300),
    creators: Array.isArray(raw.creators) ? raw.creators.filter(c => typeof c === "string").slice(0, 8) : [],
    version: STRING(raw.version, 24) || "1.0.0",
    minVersion: STRING(raw.minVersion, 24),
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === "string").slice(0, 8) : [],
  };
}

const ID_OK = (id) => /^[\w-]{1,64}$/.test(id || "");
const KNOWN_SCHEMA = (raw) => Number(raw.schema || CATALOGUE_SCHEMA) <= CATALOGUE_SCHEMA;

export function normalizeTheme(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!ID_OK(raw.id) || !KNOWN_SCHEMA(raw)) return null;
  const tokens = sanitizeTokens(raw.tokens);
  if (!Object.keys(tokens).length) return null;        // nothing to apply
  return { ...common(raw), mode: raw.mode === "light" ? "light" : "dark", tokens };
}

/**
 * One preset entry. The config is carried through rather than checked here: the equaliser has its
 * own normalizer that clamps every band, and the visualizer's is filtered down to known keys at
 * the moment of installing. Checking it twice, differently, is how two checks drift apart.
 */
export function normalizePresetEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!ID_OK(raw.id) || !KNOWN_SCHEMA(raw)) return null;
  if (!raw.config || typeof raw.config !== "object") return null;
  return { ...common(raw), config: raw.config };
}

/**
 * The published themes, with what this build can say about each one.
 *
 * `builtin` and `installed` are answered here rather than at the call site so the store shows
 * one truth: a theme that ships with this build needs no installing, and one already installed
 * needs an update only when the published version is newer.
 */
export async function fetchCatalogue(url = CATALOGUE_URL) {
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
  const themes = annotateThemes(data.themes.map(normalizeTheme).filter(Boolean));
  const out = { ok: true, themes, extensions: annotateExtensions(data.extensions) };
  for (const kind of PRESET_KINDS) {
    const list = Array.isArray(data[kind]) ? data[kind] : [];
    out[kind] = annotatePresets(kind, list.map(normalizePresetEntry).filter(Boolean));
  }
  return out;
}

/**
 * What this build can say about each entry, recomputed from what is installed right now.
 *
 * Separate from the fetch so it can be repeated after installing or removing one. Doing that by
 * fetching again would work and would also mean a network round trip to answer a question the
 * app already knows the answer to - and would leave the button reading "Install" until it came
 * back.
 */
/**
 * What this build can say about each preset, recomputed from what is installed right now.
 *
 * An equaliser preset carries its version inside its id, which is why an update can be offered at
 * all: the normalizer that rebuilds it keeps the id and drops everything else. A preset installed
 * before that encoding existed reports no version and is left alone rather than being offered an
 * update forever.
 */
export function annotatePresets(kind, entries) {
  const installed = installedPresets(kind);
  return entries.map(e => {
    const local = installed.find(i => i.id === e.id);
    return {
      ...e,
      kind,
      installed: !!local,
      installedVersion: local?.version || null,
      updatable: !!local?.version && compareVersions(e.version, local.version) > 0,
      supported: meetsMinVersion(e),
    };
  });
}

/**
 * The published extensions, as this build can act on them.
 *
 * The manifest is parsed here rather than reshaped: an entry that this build would refuse is
 * dropped from the shelf entirely, because offering an Install button for something that cannot
 * load is worse than a shorter list. `entry` is kept beside the parsed result, because installing
 * stores what was published and not what this build made of it.
 */
export function annotateExtensions(raw) {
  const installed = installedExtensions();
  return (Array.isArray(raw) ? raw : []).map(entry => {
    const { ok, manifest } = parseManifest(entry, { trusted: isTrustedExtension(entry?.id) });
    if (!ok) return null;
    const local = installed.find(m => m.id === manifest.id);
    // What every page of the store shows, in the store's own words. The manifest says name and
    // authors because that is what an extension calls them; the shared detail page asks for title
    // and creators, and answering it here keeps that page from growing a branch per kind.
    const shop = common(entry);
    return {
      ...manifest,
      title: manifest.name,
      creators: manifest.authors,
      official: entry.official !== false && manifest.authors.includes("Kodama"),
      size: shop.size,
      screenshots: shop.screenshots,
      tags: shop.tags,
      minVersion: shop.minVersion,
      entry,
      installed: !!local,
      installedVersion: local?.version || null,
      updatable: !!local && compareVersions(manifest.version, local.version) > 0,
      supported: meetsMinVersion({ minVersion: entry.minVersion }),
    };
  }).filter(Boolean);
}

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
  const e = normalizeTheme(entry);
  if (!e || !meetsMinVersion(e)) return false;
  const next = readInstalledThemes().filter(t => t.id !== e.id);
  next.push({ id: e.id, label: e.title, mode: e.mode, version: e.version, tokens: e.tokens });
  return writeInstalledThemes(next);
}

export function uninstallTheme(id) {
  return writeInstalledThemes(readInstalledThemes().filter(t => t.id !== id));
}
