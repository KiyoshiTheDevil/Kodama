import { useCallback, useEffect, useState } from "react";

import { translate } from "../../i18n.js";

/**
 * Tauri plugin-updater lifecycle: silent startup check, manual re-check with
 * feedback, download-with-progress, and install (stopping the Python backend
 * first so the NSIS installer can replace locked files, then relaunch).
 *
 * `addToast` and `getInitialLang` are injected so the hook stays independent of
 * the App's toast/language wiring while preserving the exact current behavior.
 */
export function useAppUpdate({ addToast, getInitialLang }) {
  const [updateInfo, setUpdateInfo] = useState(null); // { version, changelog, releasedAt, _update }
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  // showFeedback=true: show toasts on "up to date" and on error (manual check)
  // showFeedback=false (default): silent — only sets updateInfo if update is found (startup)
  const checkForUpdates = useCallback(
    async (showFeedback = false) => {
      const lang = localStorage.getItem("kiyoshi-lang") || "de";
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update?.available) {
          setUpdateInfo({
            version: update.version,
            changelog: update.body || "",
            releasedAt: update.date || null,
            _update: update,
          });
        } else {
          setUpdateInfo(null);
          if (showFeedback) addToast(translate(lang, "upToDate"), "info");
        }
      } catch (e) {
        console.error("[Updater] check failed:", e);
        if (showFeedback) addToast(translate(lang, "updateCheckFailed"), "error");
      }
    },
    [addToast]
  );

  const downloadUpdate = useCallback(async () => {
    if (!updateInfo?._update) return;
    setUpdateDownloading(true);
    setUpdateDownloadProgress(0);
    setUpdateDownloaded(false);
    try {
      let downloaded = 0;
      let total = 0;
      await updateInfo._update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength ?? 0;
          setUpdateDownloadProgress(total > 0 ? Math.round((downloaded / total) * 100) : null);
        }
        if (event.event === "Finished") setUpdateDownloadProgress(100);
      });
      setUpdateDownloaded(true);
    } catch {
      const lang = getInitialLang();
      addToast(translate(lang, "downloadFailed"), "error");
      setUpdateDownloadProgress(null);
    } finally {
      setUpdateDownloading(false);
    }
  }, [updateInfo, addToast, getInitialLang]);

  const installUpdate = useCallback(async () => {
    if (!updateInfo?._update) return;
    try {
      // Stop the Python backend before the NSIS installer runs,
      // otherwise it holds file locks and the installation fails.
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_server_cmd").catch(() => {});
      await updateInfo._update.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      const lang = getInitialLang();
      addToast(translate(lang, "downloadFailed"), "error");
    }
  }, [updateInfo, addToast, getInitialLang]);

  const cancelUpdateDownload = useCallback(() => {
    // plugin-updater hat keinen Abort — State zurücksetzen reicht
    setUpdateDownloading(false);
    setUpdateDownloadProgress(null);
    setUpdateDownloaded(false);
  }, []);

  // Silent update check on mount.
  useEffect(() => {
    checkForUpdates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    updateInfo,
    updateDownloading,
    updateDownloadProgress,
    updateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelUpdateDownload,
  };
}
