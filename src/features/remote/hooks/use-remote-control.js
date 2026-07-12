import { useCallback, useEffect, useMemo, useState } from "react";

import { API } from "../../../shared/api/client.js";

/**
 * LAN remote-control state. Enabling starts the token-gated phone endpoints on the
 * backend; the desktop keeps the stable token + trusted device list in localStorage
 * so remembered phones auto-approve after a restart. Owns the adaptive device poll
 * (fast while pairing, slow when idle), the pairing-modal open/close reactions, and
 * the device approve/deny/remember commands. Returns explicit state/actions.
 */
export function useRemoteControl() {
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const [remoteInfo, setRemoteInfo] = useState(null); // { token, ips, port }
  const [remoteDevices, setRemoteDevices] = useState([]);
  // Remembered devices persist across app restarts. The backend state is in-memory, so the
  // desktop keeps the stable token + trusted device list in localStorage and re-supplies both
  // on enable — remembered phones then auto-approve without re-pairing after a restart.
  const [remoteTrusted, setRemoteTrusted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kodama-remote-trusted") || "[]");
    } catch {
      return [];
    }
  });
  const remoteTrustedIds = useMemo(() => new Set(remoteTrusted.map((x) => x.id)), [remoteTrusted]);

  const toggleRemote = useCallback(async (on) => {
    try {
      let trusted = [];
      try {
        trusted = JSON.parse(localStorage.getItem("kodama-remote-trusted") || "[]");
      } catch {}
      const savedToken = localStorage.getItem("kodama-remote-token") || "";
      const d = await fetch(`${API}/remote/_enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: on,
          token: on ? savedToken : "",
          trusted: on ? trusted : [],
        }),
      }).then((r) => r.json());
      setRemoteEnabled(!!d.enabled);
      setRemoteInfo(d.enabled ? { token: d.token, ips: d.ips || [], port: d.port } : null);
      if (d.enabled && d.token) {
        try {
          localStorage.setItem("kodama-remote-token", d.token);
        } catch {}
      }
      if (!d.enabled) setRemoteDevices([]);
    } catch (e) {
      console.error("[Remote] toggle failed:", e);
    }
  }, []);

  const remoteDeviceAction = useCallback((id, action) => {
    fetch(`${API}/remote/_device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => {});
    // Forget a removed/denied device so it doesn't get re-seeded as approved next restart.
    if (action === "remove" || action === "deny") {
      setRemoteTrusted((prev) => {
        const next = prev.filter((x) => x.id !== id);
        try {
          localStorage.setItem("kodama-remote-trusted", JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, []);

  const remoteRememberDevice = useCallback((id, name, on) => {
    setRemoteTrusted((prev) => {
      const next = on
        ? [...prev.filter((x) => x.id !== id), { id, name }]
        : prev.filter((x) => x.id !== id);
      try {
        localStorage.setItem("kodama-remote-trusted", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Pairing modal open state — declared before the device poll so the poll can speed up
  // while it's open (for snappy scan detection) and stay slow otherwise (for performance).
  const [pairModalOpen, setPairModalOpen] = useState(false);
  // While enabled, poll the device list (for the desktop approval UI). Adaptive rate:
  // fast (2s) while pairing so a scan is detected quickly, slow (5s) when idle.
  useEffect(() => {
    if (!remoteEnabled) return;
    let stop = false;
    // Only update state when the device list actually changed — a fresh array reference
    // every poll would re-render the whole app even when nothing changed.
    const sig = (arr) => (arr || []).map((x) => `${x.id}:${x.status}:${x.online}`).join("|");
    const tick = () =>
      fetch(`${API}/remote/_status`)
        .then((r) => r.json())
        .then((d) => {
          if (stop || !d || !d.devices) return;
          setRemoteDevices((prev) => (sig(prev) === sig(d.devices) ? prev : d.devices));
        })
        .catch(() => {});
    tick();
    const iv = setInterval(tick, pairModalOpen ? 2000 : 5000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [remoteEnabled, pairModalOpen]);

  useEffect(() => {
    if (!remoteEnabled) setPairModalOpen(false);
  }, [remoteEnabled]);
  const hasPending = remoteDevices.some((d) => d.status === "pending");
  useEffect(() => {
    if (hasPending) setPairModalOpen(true);
  }, [hasPending]);

  return {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    remoteTrustedIds,
    pairModalOpen,
    setPairModalOpen,
    toggleRemote,
    remoteDeviceAction,
    remoteRememberDevice,
  };
}
