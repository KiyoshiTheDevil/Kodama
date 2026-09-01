/**
 * Minimal standalone entry point for the Overlay Editor window.
 * Loaded when ?overlayEditor=1 — avoids running the full App
 * (audio player, backend connections, SSE streams, etc.)
 */
import React, { useState, useEffect } from "react";
import { IconContext } from "./icons.jsx";
import { translate } from "./i18n.js";
import OverlayEditor from "./overlay/OverlayEditor.jsx";
import { applyFontScale, readFontScale } from "./settings/scale.js";
import { useToolAccent } from "./ui/window-chrome.jsx";

const API = "http://localhost:9847";

export default function OverlayEditorApp() {
  // Own window, own document: the type scale variables that every text-t* class reads are
  // written by whichever entry point mounts, and App does not mount here.
  applyFontScale(readFontScale());

  // Strip the Windows 11 accent border from this borderless (decorations:false) window.
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "overlay-editor" }))
      .catch(() => {});
  }, []);

  // Fixed tool accent, shared with the equaliser window.
  useToolAccent();


  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  const t = (key, vars) => translate(language, key, vars);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div style={{ height: "100vh", background: "#0d0d0d", overflow: "hidden" }}>
        <OverlayEditor
          t={t}
          apiBase={API}
          standalone
        />
      </div>
    </IconContext.Provider>
  );
}
