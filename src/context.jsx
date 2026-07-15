// Shared foundation extracted from App.jsx: the backend base URL, the thumbnail proxy helper,
// and the React contexts + hooks used across the app (language, animations, zoom, font scale).
// Kept in its own module so components split out of App.jsx can import these without pointing
// back at App.jsx (which would create a circular import).
import { createContext, useContext } from "react";
import { translate } from "./i18n.js";

export const API = "http://localhost:9847";

// Proxy YouTube thumbnails through the local server to avoid CORS issues.
export const thumb = (url) => url ? `${API}/imgproxy?url=${encodeURIComponent(url)}` : "";

// Upgrade a Google usercontent thumbnail (YT Music art) to a larger square by rewriting its size
// suffix (=w120-…, =s226-…), or appending one if absent. The default `thumb()` keeps the small
// _pick_thumb size app-wide; use this where the cover is shown large (e.g. Big Picture).
export function hiResThumb(url, size = 512) {
  if (!url) return url;
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    if (/=[ws]\d+/.test(url)) return url.replace(/=[ws]\d+[^/]*$/, `=w${size}-h${size}-l90-rj`);
    return url + `=w${size}-h${size}-l90-rj`;
  }
  return url;
}
export const thumbHi = (url, size) => thumb(hiResThumb(url, size));

// Open Boidu's Composer (community-lyrics editor) in its own Kodama window, pre-filled
// with the current track and pre-configured to use Kodama as its audio bridge. Window
// creation + the settings-seeding init script run in Rust (open_composer_window).
export async function openComposer(videoId) {
  const { invoke } = await import("@tauri-apps/api/core");
  // Pause Kodama's own playback so the main player and the Composer's editor audio
  // don't play simultaneously (the App player component listens for this).
  try { window.dispatchEvent(new Event("kodama-pause-playback")); } catch {}
  // Theme the composer with Kodama's current colours (applied as CSS-variable overrides).
  const overrides = {};
  try {
    const cs = getComputedStyle(document.documentElement);
    const read = (n) => cs.getPropertyValue(n).trim();
    const valid = (x) => x && /^[#0-9a-zA-Z(),.%\s-]{1,60}$/.test(x);
    const put = (composerVar, val) => { if (valid(val)) overrides[composerVar] = val; };
    const accent = read("--accent");
    put("--color-composer-accent", accent);
    put("--color-composer-accent-dark", accent);
    put("--color-composer-accent-darker", accent);
    put("--color-composer-accent-text", accent);
    put("--color-composer-link", accent);
    // The composer is dark-only — only theme its surfaces/text when Kodama is on a dark theme.
    if (document.documentElement.getAttribute("data-theme") !== "light") {
      put("--color-composer-bg", read("--bg-base"));
      put("--color-composer-bg-dark", read("--bg-base"));
      put("--color-composer-bg-elevated", read("--bg-elevated"));
      put("--color-composer-border", read("--border"));
      put("--color-composer-border-hover", read("--bg-hover"));
      put("--color-composer-button", read("--bg-elevated"));
      put("--color-composer-button-hover", read("--bg-hover"));
      put("--color-composer-input", read("--bg-elevated"));
      put("--color-composer-text", read("--text-primary"));
      put("--color-composer-text-secondary", read("--text-secondary"));
      put("--color-composer-text-muted", read("--text-muted"));
      put("--color-composer-text-tertiary", read("--text-muted"));
    }
  } catch {}
  return invoke("open_composer_window", { videoId: videoId || null, overrides });
}

// ─── Language ─────────────────────────────────────────────────────────────────
export const LangContext = createContext("de");
export const useLang = () => {
  const lang = useContext(LangContext);
  return (key, vars) => translate(lang, key, vars);
};

// ─── Animation Context ────────────────────────────────────────────────────────
export const AnimationContext = createContext(true);
export const useAnimations = () => useContext(AnimationContext);

// ─── Zoom Context ─────────────────────────────────────────────────────────────
export const ZoomContext = createContext(1);
export const useZoom = () => useContext(ZoomContext);

// ─── Font Scale Context ───────────────────────────────────────────────────────
export const FontScaleContext = createContext(1);
export const useFontScale = () => useContext(FontScaleContext);

// ─── Track numbering (Spotify-style row numbers in playlists) ──────────────────
export const TrackNumberContext = createContext(false);
export const useTrackNumbers = () => useContext(TrackNumberContext);
