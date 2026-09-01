// The local lyrics cache, with a ceiling.
//
// It used to be three bare `localStorage.setItem` calls wrapped in silent catches, one key per
// track and nothing ever removed. On a well-used install that reached 455 keys and ten
// megabytes, at which point every write in the whole app began failing with QuotaExceededError
// — and since almost every writer swallows that, the app simply stopped remembering anything.
// Pinning a playlist was the feature that happened to reveal it.
//
// Bounded by bytes rather than by count: entries range from a few kilobytes to a quarter of a
// megabyte, so a count would let the cache be twenty times its intended size or a twentieth of
// it, depending on what was listened to.
const PREFIX = "kiyoshi-lyrics-";
const INDEX_KEY = "kiyoshi-lyrics-index";
const BUDGET = 2 * 1024 * 1024;   // bytes of cached lyrics to keep

const keyFor = (videoId) => PREFIX + videoId;
// localStorage counts UTF-16 code units, so a string costs two bytes per character.
const sizeOf = (s) => (s ? s.length * 2 : 0);

/**
 * Several lyrics *settings* share this prefix — `kiyoshi-lyrics-fluid`, `-providers`,
 * `-font-size` and friends. Sweeping by name alone would delete them, so an untracked key is
 * only adopted if it actually holds a cached set of lines.
 */
function isCacheEntry(raw) {
  if (!raw || raw[0] !== "{") return false;
  try {
    return Array.isArray(JSON.parse(raw).lrc);
  } catch {
    return false;
  }
}

function readIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY));
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.id === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(index) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch { /* nothing to do */ }
}

/** Drop entries from the back of the index until the total is under `budget`. */
function evictTo(index, budget) {
  let total = index.reduce((sum, e) => sum + (e.bytes || 0), 0);
  while (index.length && total > budget) {
    const victim = index.pop();
    total -= victim.bytes || 0;
    try { localStorage.removeItem(keyFor(victim.id)); } catch { /* already gone */ }
  }
  return index;
}

export function readLyricsCache(videoId) {
  try { return localStorage.getItem(keyFor(videoId)); } catch { return null; }
}

export function writeLyricsCache(videoId, value) {
  if (!videoId) return;
  const json = typeof value === "string" ? value : JSON.stringify(value);
  const bytes = sizeOf(json);
  let index = readIndex().filter((e) => e.id !== videoId);
  index.unshift({ id: videoId, bytes });
  // Make room before writing, not after: the point is never to reach the quota in the first
  // place, because once there every other feature in the app starts failing too.
  index = evictTo(index, Math.max(0, BUDGET - bytes));

  try {
    localStorage.setItem(keyFor(videoId), json);
  } catch {
    // Something else filled the store. Give up most of the cache and try once more; lyrics are
    // re-fetchable, whereas a pinned playlist or a preset is not.
    index = evictTo(index, BUDGET / 4);
    try { localStorage.setItem(keyFor(videoId), json); } catch { /* leave it uncached */ }
  }
  writeIndex(index);
}

export function dropLyricsCache(videoId) {
  try { localStorage.removeItem(keyFor(videoId)); } catch { /* ignore */ }
  writeIndex(readIndex().filter((e) => e.id !== videoId));
}

/**
 * One-off cleanup for installs that predate the ceiling. Everything already cached is unknown
 * to the index, so it would never be evicted and would sit there forever; this adopts what is
 * there, newest first is unknowable so it simply trims to the budget and leaves the rest.
 */
export function pruneLyricsCache() {
  const known = new Set(readIndex().map((e) => e.id));
  const strays = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || k === INDEX_KEY) continue;
      const id = k.slice(PREFIX.length);
      if (known.has(id)) continue;
      const raw = localStorage.getItem(k);
      if (!isCacheEntry(raw)) continue;
      strays.push({ id, bytes: sizeOf(raw) });
    }
  } catch {
    return;
  }
  if (!strays.length) return;
  // Nothing records when these were written, so there is no fair order to keep them in.
  // Adopting them behind the tracked entries at least brings them under the ceiling.
  const index = evictTo([...readIndex(), ...strays], BUDGET);
  writeIndex(index);
}
