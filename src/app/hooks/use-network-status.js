import { useCallback, useEffect, useState } from "react";

/**
 * Network connectivity + user-toggled offline mode. Owns the real online/offline
 * listener (which refreshes profiles and forces all views to re-fetch on reconnect)
 * and the manual offline toggle. `isOffline` is the effective state either input can
 * trigger. `fetchProfiles`, `setAppKey`, and `setView` are injected because the
 * reconnect refresh and the toggle's "jump to downloads" behaviour touch domains
 * still owned by App.
 */
export function useNetworkStatus({ fetchProfiles, setAppKey, setView }) {
  const [offlineMode, setOfflineMode] = useState(
    () => localStorage.getItem("kiyoshi-offline") === "true"
  );
  const [isActuallyOffline, setIsActuallyOffline] = useState(() => !navigator.onLine);

  // Detect real network connectivity changes
  useEffect(() => {
    const onOnline = () => {
      setIsActuallyOffline(false);
      // Refresh profiles + force all views to re-fetch after coming back online
      fetchProfiles();
      setAppKey((k) => k + 1);
    };
    const onOffline = () => setIsActuallyOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [fetchProfiles, setAppKey]);

  const isOffline = offlineMode || isActuallyOffline;

  const handleToggleOffline = useCallback(() => {
    setOfflineMode((prev) => {
      const next = !prev;
      localStorage.setItem("kiyoshi-offline", String(next));
      if (next) setView("downloads");
      return next;
    });
  }, [setView]);

  return { offlineMode, isActuallyOffline, isOffline, handleToggleOffline };
}
