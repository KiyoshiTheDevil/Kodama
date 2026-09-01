// What actually gets scrobbled, as opposed to what YouTube Music reports.
//
// Two things live here, both from issue #16: a per-track correction table, and the option to
// scrobble under the primary artist alone. They are kept out of the component that sends the
// scrobble so the same resolution can be shown in the UI before it is used — a correction you
// cannot preview is a correction you cannot trust.

const OVERRIDES_KEY = "kodama-scrobble-overrides";
const PRIMARY_KEY = "kodama-scrobble-primary-artist";

/**
 * Separators used to fall back on when a track carries no structured artist list. This is a
 * last resort and it is lossy: "Simon & Garfunkel", "Earth, Wind & Fire" and "Florence + the
 * Machine" are single artists whose names contain these very characters. Whenever the
 * structured list exists it is used instead, and it is right every time.
 */
const SPLIT = /\s*(?:,|;|\/|&|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bvs\.?\b|\bx\b|\+)\s*/i;

export function loadOverrides() {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERRIDES_KEY));
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function saveOverrides(map) {
  try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map)); } catch { /* private window */ }
  // Both the settings list and the scrobbler read this, and neither owns it.
  window.dispatchEvent(new Event("kodama-scrobble-overrides-changed"));
}

/**
 * Store a correction for one track. Keyed by video id: the identifier is stable, whereas
 * matching on artist and title would have to match the very strings the user is correcting.
 * `label` is only there so the settings list can name the track without keeping the whole
 * object around.
 */
export function setOverride(videoId, { artist, title, label }) {
  if (!videoId) return;
  const map = loadOverrides();
  const a = (artist || "").trim();
  const t = (title || "").trim();
  if (!a && !t) { removeOverride(videoId); return; }
  map[videoId] = { artist: a, title: t, label: label || t || a, at: Date.now() };
  saveOverrides(map);
}

export function removeOverride(videoId) {
  const map = loadOverrides();
  if (!(videoId in map)) return;
  delete map[videoId];
  saveOverrides(map);
}

export const loadPrimaryArtistOnly = () => localStorage.getItem(PRIMARY_KEY) === "true";
export function savePrimaryArtistOnly(on) {
  try { localStorage.setItem(PRIMARY_KEY, String(!!on)); } catch { /* private window */ }
}

/** The artist Last.fm should see, given the setting. */
export function primaryArtist(track) {
  const joined = (track?.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
  // The structured list is what YouTube Music itself distinguishes artists by, so it never
  // guesses at a name that merely contains a separator.
  const links = Array.isArray(track?.artistLinks) ? track.artistLinks : null;
  if (links && links.length && links[0]?.name) return links[0].name.trim();
  if (Array.isArray(track?.artists) && track.artists.length) {
    const first = track.artists[0];
    return String(first?.name || first || "").trim();
  }
  const parts = joined.split(SPLIT).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[0] : joined;
}

/**
 * The final artist / track / album / duration for a scrobble.
 *
 * Order matters: the primary-artist rule narrows what the source reported, and an override then
 * replaces whatever it defines. A correction is an explicit statement about one track and has
 * to win over a general rule — otherwise correcting an artist by hand would still be trimmed
 * afterwards.
 */
export function resolveScrobbleMeta(track, { primaryOnly, overrides } = {}) {
  const joined = (track?.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
  const base = {
    artist: primaryOnly ? primaryArtist(track) : joined,
    track: (track?.title || "").trim(),
    album: track?.album || "",
  };
  const ov = (overrides || {})[track?.videoId];
  if (ov) {
    if (ov.artist) base.artist = ov.artist;
    if (ov.title) base.track = ov.title;
  }
  return base;
}
