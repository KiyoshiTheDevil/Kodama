/**
 * Minimal standalone entry point for the Overlay Editor window.
 * Loaded when ?overlayEditor=1 — avoids running the full App
 * (audio player, backend connections, SSE streams, etc.)
 */
import React, { useState, useEffect } from "react";
import { IconContext } from "./icons.jsx";
import { translate } from "./i18n.js";
import OverlayEditor from "./overlay/OverlayEditor.jsx";

const API = "http://localhost:9847";

export default function OverlayEditorApp() {
  // Strip the Windows 11 accent border from this borderless (decorations:false) window.
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "overlay-editor" }))
      .catch(() => {});
  }, []);

  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  const [obsPort, setObsPort] = useState(() => parseInt(localStorage.getItem("kiyoshi-obs-port") || "9848", 10));
  const [obsEnabled, setObsEnabled] = useState(() => localStorage.getItem("kiyoshi-obs-enabled") === "true");
  const [obsPortInput, setObsPortInput] = useState(() => localStorage.getItem("kiyoshi-obs-port") || "9848");

  const t = (key, vars) => translate(language, key, vars);

  const toggleObs = async (enabled) => {
    setObsEnabled(enabled);
    localStorage.setItem("kiyoshi-obs-enabled", String(enabled));
    if (enabled) {
      await fetch(`${API}/overlay/server/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: obsPort }),
      }).catch(() => {});
    } else {
      await fetch(`${API}/overlay/server/stop`, { method: "POST" }).catch(() => {});
    }
  };

  const onPortSave = (val) => {
    const p = parseInt(val, 10);
    if (p > 1024 && p < 65535) {
      setObsPort(p);
      localStorage.setItem("kiyoshi-obs-port", p);
      if (obsEnabled) {
        fetch(`${API}/overlay/server/stop`, { method: "POST" })
          .then(() => fetch(`${API}/overlay/server/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ port: p }),
          }))
          .catch(() => {});
      }
    }
  };

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div style={{ height: "100vh", background: "var(--bg-base)", overflow: "hidden" }}>
        <OverlayEditor
          t={t}
          apiBase={API}
          obsPort={obsPort}
          obsEnabled={obsEnabled}
          toggleObs={toggleObs}
          obsPortInput={obsPortInput}
          setObsPortInput={setObsPortInput}
          onPortSave={onPortSave}
          standalone
        />
      </div>
    </IconContext.Provider>
  );
}
