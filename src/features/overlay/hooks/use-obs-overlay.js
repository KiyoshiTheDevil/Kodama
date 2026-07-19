import { useEffect, useState } from "react";

import { API } from "@/shared/api/client.js";
import { normalizeOverlayDoc } from "@/features/overlay/schema.js";

/**
 * OBS browser-source overlay server state. Owns the enabled/port preferences,
 * the on-mount push of the active overlay document to the backend, the auto-start
 * (with retry) when it was enabled last session, and the enable/port-change
 * commands against the backend overlay server. Returns explicit state/actions so
 * the settings panel and sidebar consume it without owning connection logic.
 */
export function useObsOverlay() {
  const [obsEnabled, setObsEnabled] = useState(
    () => localStorage.getItem("kiyoshi-obs-enabled") === "true"
  );
  const [obsPort, setObsPort] = useState(() =>
    parseInt(localStorage.getItem("kiyoshi-obs-port") || "9848", 10)
  );
  const [obsPortInput, setObsPortInput] = useState(
    () => localStorage.getItem("kiyoshi-obs-port") || "9848"
  );

  // Sync the active overlay document (v2) to the backend on mount, so OBS shows
  // the right thing after an app/server restart even before the editor is opened.
  // Prefers the editor's saved v2 doc; falls back to migrating the legacy v1 config.
  useEffect(() => {
    let doc = null;
    try {
      const v2 = JSON.parse(localStorage.getItem("kiyoshi-overlay-doc"));
      if (v2 && v2.version === 2 && Array.isArray(v2.layers)) doc = v2;
    } catch {
      /* intentionally ignored */
    }
    if (!doc) {
      try {
        doc = normalizeOverlayDoc(JSON.parse(localStorage.getItem("kiyoshi-obs-config")));
      } catch {
        doc = normalizeOverlayDoc(null);
      }
    }
    fetch(`${API}/overlay/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    }).catch(() => {});
  }, []);

  // Auto-start OBS overlay server on mount if it was enabled in last session
  useEffect(() => {
    if (!obsEnabled) return;
    let cancelled = false;
    const start = (attempt = 0) => {
      fetch(`${API}/overlay/server/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: obsPort }),
      }).catch(() => {
        if (!cancelled && attempt < 15) setTimeout(() => start(attempt + 1), 1500);
      });
    };
    start();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleObs = async (enabled) => {
    setObsEnabled(enabled);
    localStorage.setItem("kiyoshi-obs-enabled", enabled);
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

  // Persist a new port and, if the server is running, restart it on the new port.
  const saveObsPort = (val) => {
    const p = parseInt(val, 10);
    if (p > 1024 && p < 65535) {
      setObsPort(p);
      localStorage.setItem("kiyoshi-obs-port", p);
      if (obsEnabled) {
        fetch(`${API}/overlay/server/stop`, { method: "POST" })
          .then(() =>
            fetch(`${API}/overlay/server/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ port: p }),
            })
          )
          .catch(() => {});
      }
    }
  };

  return {
    obsEnabled,
    obsPort,
    obsPortInput,
    setObsPortInput,
    toggleObs,
    saveObsPort,
  };
}
