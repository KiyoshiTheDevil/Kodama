// Shared foundation extracted from App.jsx: the backend base URL, the thumbnail proxy helper,
// and the React contexts + hooks used across the app (language, animations, zoom, font scale).
// Kept in its own module so components split out of App.jsx can import these without pointing
// back at App.jsx (which would create a circular import).
import { createContext, useContext, useCallback } from "react";
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
  // i.ytimg.com serves fixed variants instead of an arbitrary size, and used to fall through
  // here untouched — a 48px row cell then decoded whatever the backend picked, which is
  // anything from 226px upwards. Snap to the smallest variant that still covers the request.
  if (url.includes("i.ytimg.com")) {
    const variant = size <= 120 ? "default" : size <= 320 ? "mqdefault" : size <= 480 ? "hqdefault" : "maxresdefault";
    return url.replace(/\/(maxres|sd|hq|mq)?default\.jpg/, `/${variant}.jpg`);
  }
  return url;
}
export const thumbHi = (url, size) => thumb(hiResThumb(url, size));

// The playable tracks of a playlist or album, for callers that only hold its id.
//
// Lives here rather than in a view because two places need it from opposite ends of the app:
// the library's grid cards, which have the collection in hand, and the context menu in App,
// which can be raised over a card anywhere - home, search, the sidebar. Returns an empty list
// on any failure, so a caller can simply do nothing when there is nothing to play.
export async function fetchCollectionTracks(kind, id) {
  try {
    const url = kind === "album" ? `${API}/album/${id}` : `${API}/playlist/${id}`;
    const d = await fetch(url).then(r => r.json());
    return (d.tracks || []).filter(tr => tr.videoId);
  } catch {
    return [];
  }
}

// ─── Language ─────────────────────────────────────────────────────────────────
export const LangContext = createContext("de");
export const useLang = () => {
  const lang = useContext(LangContext);
  // Memoised on the language, not rebuilt per render. `t` is a dependency of memos and effects
  // all over the app, and an identity that changed every render quietly defeated every one of
  // them — in one case turning a useEffect into a render loop that ran the renderer process out
  // of memory. Nothing downstream has to know; it simply stops lying about having changed.
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
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
