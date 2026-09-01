/**
 * Standalone entry point for the Equalizer window. Loaded when ?equalizer=1, so it never
 * starts the full App — a second App in another window would start a second audio pipeline.
 */
import { useEffect, useState } from "react";
import { IconContext } from "../icons.jsx";
import { translate } from "../i18n.js";
import { applyFontScale, readFontScale } from "../settings/scale.js";
import Equalizer from "./Equalizer.jsx";
import { useToolAccent } from "../ui/window-chrome.jsx";

export default function EqualizerApp() {
  // Same blue as the Overlay Editor: the two are one family of tool windows, and only one of
  // them wearing the player's accent made them look unrelated.
  useToolAccent();

  // Own window, own document: the type scale that every var(--tNN) reads is written at runtime
  // by whichever entry point mounts, and App does not mount here.
  applyFontScale(readFontScale());

  // Strip the Windows 11 accent border from this borderless window.
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "equalizer" }))
      .catch(() => {});
  }, []);

  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  const t = (key, vars) => translate(language, key, vars);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div style={{ height: "100vh", background: "var(--bg-base)", overflow: "hidden" }}>
        <Equalizer t={t} />
      </div>
    </IconContext.Provider>
  );
}
