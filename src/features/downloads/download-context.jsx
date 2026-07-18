/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";

// Download context (Step 12): distributes the single useDownloadManager() controller (still
// instantiated by App, same pattern as PlayerProvider/ProfileProvider) to every music view,
// PlaylistLayout, and the Player — the cached/downloading/premium id sets and the download
// actions were previously threaded as props through 7+ call sites. App keeps its own destructure
// of the controller too, since its track-context-menu and the download-queue progress card still
// read/act on this state directly.
const DownloadStateContext = createContext(null);
const DownloadActionsContext = createContext(null);

function useRequired(context, name) {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used within a DownloadProvider`);
  return value;
}

export function DownloadProvider({ controller, children }) {
  const {
    cachedSongIds,
    downloadingIds,
    premiumSongIds,
    handleDownloadSong,
    handleDownloadAll,
    handleRemoveAllDownloads,
    handleExportSong,
    removeCachedSong,
    markPremium,
  } = controller;

  const state = useMemo(
    () => ({ cachedSongIds, downloadingIds, premiumSongIds }),
    [cachedSongIds, downloadingIds, premiumSongIds]
  );
  const actions = useMemo(
    () => ({
      downloadSong: handleDownloadSong,
      downloadAll: handleDownloadAll,
      removeAll: handleRemoveAllDownloads,
      exportSong: handleExportSong,
      removeCachedSong,
      markPremium,
    }),
    [
      handleDownloadSong,
      handleDownloadAll,
      handleRemoveAllDownloads,
      handleExportSong,
      removeCachedSong,
      markPremium,
    ]
  );

  return (
    <DownloadStateContext.Provider value={state}>
      <DownloadActionsContext.Provider value={actions}>{children}</DownloadActionsContext.Provider>
    </DownloadStateContext.Provider>
  );
}

export const useDownloadState = () => useRequired(DownloadStateContext, "useDownloadState");
export const useDownloadActions = () => useRequired(DownloadActionsContext, "useDownloadActions");
