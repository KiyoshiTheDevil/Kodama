// React contexts + hooks used across the app (language, animations, zoom, font scale),
// extracted from App.jsx. Kept in its own module so components split out of App.jsx can
// import these without pointing back at App.jsx (which would create a circular import).
// (The former API/thumbnail compatibility re-exports were removed in Step 14 — callers
// now import those directly from shared/api/.)
import { createContext, useContext } from "react";
import { translate } from "./i18n.js";

// ─── Language ─────────────────────────────────────────────────────────────────
export const LangContext = createContext("de");
export const useLang = () => {
  const lang = useContext(LangContext);
  return (key, vars = {}) => translate(lang, key, vars);
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
