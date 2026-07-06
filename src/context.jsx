// Shared foundation extracted from App.jsx: the backend base URL, the thumbnail proxy helper,
// and the React contexts + hooks used across the app (language, animations, zoom, font scale).
// Kept in its own module so components split out of App.jsx can import these without pointing
// back at App.jsx (which would create a circular import).
import { createContext, useContext } from "react";
import { translate } from "./i18n.js";

export const API = "http://localhost:9847";

// Proxy YouTube thumbnails through the local server to avoid CORS issues.
export const thumb = (url) => url ? `${API}/imgproxy?url=${encodeURIComponent(url)}` : "";

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
