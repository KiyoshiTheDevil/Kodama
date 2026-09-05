/**
 * Standalone entry point for the Equalizer window. Loaded when ?equalizer=1, so it never
 * starts the full App — a second App in another window would start a second audio pipeline.
 */
import { useEffect, useState, useCallback } from "react";
import { IconContext } from "../icons.jsx";
import { translate } from "../i18n.js";
import { applyFontScale, readFontScale } from "../settings/scale.js";
import { applyTheme, readTheme } from "../theme.js";
import Equalizer from "./Equalizer.jsx";
import { useToolAccent } from "../ui/window-chrome.jsx";

export default function EqualizerApp() {
  // Same blue as the Overlay Editor: the two are one family of tool windows, and only one of
  // them wearing the player's accent made them look unrelated.
  useToolAccent();

  // Own window, own document: the type scale that every var(--tNN) reads is written at runtime
  // by whichever entry point mounts, and App does not mount here. The theme is the same story,
  // and this window used to set none at all — which left HeroUI on its light token set.
  applyFontScale(readFontScale());
  applyTheme(readTheme());

  // Strip the Windows 11 accent border from this borderless window.
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "equalizer" }))
      .catch(() => {});
  }, []);

  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  // Stable per language, like the useLang hook: this is handed straight into memo and effect
  // dependency lists downstream.
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div style={{ height: "100vh", background: "var(--bg-base)", overflow: "hidden" }}>
        <Equalizer t={t} />
      </div>
    </IconContext.Provider>
  );
}
