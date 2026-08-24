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

const API = "http://localhost:9847";

// Figma's selection blue. Chosen deliberately: the editor is a design tool, and design tools
// keep a fixed, neutral accent so the chrome never competes with the artwork.
const EDITOR_ACCENT = "#0D99FF";
const EDITOR_ACCENT_DIM = "rgba(13,153,255,0.10)";

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

  // The editor keeps its own accent instead of following the app's. It is a tool, not part of
  // the player's skin: selection outlines, handles and active tools have to stay legible while
  // the user designs an overlay in arbitrary colours, and the app accent can be set to anything
  // -- including whatever is on the canvas right now, which would hide the selection in the
  // artwork. Set on the document root rather than on a wrapper element, because dropdowns and
  // tooltips render into a portal on document.body and would otherwise keep the app's accent.
  // This window has its own document, so nothing else is affected.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", EDITOR_ACCENT);
    root.style.setProperty("--accent-dim", EDITOR_ACCENT_DIM);
  }, []);

  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  const t = (key, vars) => translate(language, key, vars);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div style={{ height: "100vh", background: "var(--bg-base)", overflow: "hidden" }}>
        <OverlayEditor
          t={t}
          apiBase={API}
          standalone
        />
      </div>
    </IconContext.Provider>
  );
}
