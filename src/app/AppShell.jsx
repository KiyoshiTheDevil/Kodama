import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientBackdrop } from "../shared/ui/ambient-backdrop.jsx";
import { TitleBar } from "../shared/ui/title-bar.jsx";
import { IS_MAC } from "../shared/lib/platform.js";
import { Sidebar } from "./Sidebar.jsx";
import { SelectionActionBar } from "./SelectionActionBar.jsx";
import { AppOverlays } from "./AppOverlays.jsx";
import { buildShareLink } from "../features/player/share-link.js";
import { usePersistedState } from "../shared/hooks/use-persisted-state.js";
import {
  QUEUE_DEFAULT,
  QUEUE_MAX,
  QUEUE_MIN,
  QUEUE_WIDTH_STORAGE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_EXPANDED,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_WIDTH_STORAGE,
  SPLIT_MAX,
  SPLIT_MIN,
} from "./shell-constants.js";
import { useNews } from "./hooks/use-news.js";
import { useAppUpdate } from "./hooks/use-app-update.js";
import { useAppShortcuts } from "./hooks/use-app-shortcuts.js";
import { MainContent } from "./MainContent.jsx";
import { PlayerOverlay } from "./PlayerOverlay.jsx";
import { QueueDock } from "./QueueDock.jsx";
import { Player } from "../features/player/player-ui.jsx";
import {
  usePlaybackStatus,
  usePlayerActions,
  useQueueState,
} from "../features/player/player-context.jsx";
import { useProfileState } from "../features/profiles/profile-context.jsx";
import { SettingsSidebarContent } from "../features/settings/settings-sidebar.jsx";
import {
  lockSettingsSection,
  setSettingsSectionStore,
} from "../features/settings/section-store.js";
import { getInitialLang } from "../shared/lib/lang.js";

export function AppShell({
  language,
  addToast,
  handleLanguageChange,
  obsEnabled,
  likedIds,
  handleToggleLike,
  nav,
  shellUi,
  shortcuts,
  appearancePrefs,
  lyricsPrefs,
  authGate,
  remote,
  network,
  downloadQueue,
  privacySettings,
  bridges,
}) {
  const {
    view,
    setView,
    appKey,
    viewRefreshKey,
    setViewRefreshKey,
    collection,
    setCollection,
    artistView,
    searchQuery,
    handleSearch,
    removeRecentPlaylist,
    openPlaylist,
    openAlbum,
    openArtist,
    navigateTo,
    goBack,
    pinnedIds,
    togglePin,
  } = nav;
  const {
    overlayOpen,
    setOverlayOpen,
    queueOpen,
    setQueueOpen,
    showLyrics,
    setShowLyrics,
    uiZoom,
    setUiZoom,
  } = shellUi;
  const {
    customShortcutsRef,
    recordingShortcutRef,
    setCustomShortcuts,
    setShortcutLabels,
    setRecordingShortcut,
  } = shortcuts;
  const {
    animations,
    hideExplicit,
    ambientBackground,
    ambientVisualizer,
    vizConfig,
    instrumentalViz,
  } = appearancePrefs;
  const {
    lyricsFontSize,
    lyricsProviders,
    showLyricsTranslation,
    setShowLyricsTranslation,
    lyricsTranslationLang,
    setLyricsTranslationLang,
    lyricsTranslationFontSize,
    showRomaji,
    lyricsRomajiFontSize,
    showAgentTags,
    syllableZoom,
    fluidLyrics,
  } = lyricsPrefs;
  const {
    showLogin,
    setShowLogin,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    showProfileSwitcher,
    setShowProfileSwitcher,
  } = authGate;
  const {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    pairModalOpen,
    setPairModalOpen,
    remoteDeviceAction,
    remoteRememberDevice,
  } = remote;
  const { offlineMode, isActuallyOffline, isOffline } = network;
  const { downloadBatches, downloadQueueMin, setDownloadQueueMin, handleCancelBatch } =
    downloadQueue;
  const { anonStats, handleAnonStatsChange, hideUserHandle, setHideUserHandle } = privacySettings;
  const { autoCoverRef, flashbangTriggerRef, resetLyricsSessionRef } = bridges;

  const { track: currentTrack, isPlaying, audioRef } = usePlaybackStatus();
  const { queueRef } = useQueueState();
  const { setTrack: setCurrentTrack, setIsPlaying } = usePlayerActions();

  const { profiles } = useProfileState();

  const {
    updateInfo,
    updateDownloading,
    updateDownloadProgress,
    updateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelUpdateDownload,
  } = useAppUpdate({ addToast, getInitialLang });

  const {
    newsItems,
    newsOpen,
    setNewsOpen,
    newsUnreadSnapshot,
    newsUnreadCount,
    loadNews,
    openNews,
  } = useNews();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth, { setTransient: setSidebarWidthTransient }] =
    usePersistedState("kiyoshi-sidebar-width", SIDEBAR_EXPANDED, SIDEBAR_WIDTH_STORAGE);
  const [sidebarResizing, setSidebarResizing] = useState(false);

  const startSidebarResize = useCallback(
    (e) => {
      e.preventDefault();
      setSidebarResizing(true);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev) => {
        const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX - 4));
        setSidebarWidthTransient(w);
      };
      const onUp = () => {
        setSidebarResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setSidebarWidth((width) => width);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setSidebarWidth, setSidebarWidthTransient]
  );

  const [queueWidth, setQueueWidth, { setTransient: setQueueWidthTransient }] = usePersistedState(
    "kiyoshi-queue-width",
    QUEUE_DEFAULT,
    QUEUE_WIDTH_STORAGE
  );
  const [queueResizing, setQueueResizing] = useState(false);
  const startQueueResize = useCallback(
    (e) => {
      e.preventDefault();
      setQueueResizing(true);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev) => {
        const w = Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, window.innerWidth - 8 - ev.clientX));
        setQueueWidthTransient(w);
      };
      const onUp = () => {
        setQueueResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setQueueWidth((width) => width);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setQueueWidth, setQueueWidthTransient]
  );

  const [globalContextMenu, setGlobalContextMenu] = useState(null); // { x, y, playlist }
  const openContextMenu = useCallback((e, pl) => {
    e.preventDefault();
    setGlobalContextMenu({ x: e.clientX, y: e.clientY, playlist: pl });
  }, []);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [createPlaylistForSelection, setCreatePlaylistForSelection] = useState(false);
  const [createPlaylistTracks, setCreatePlaylistTracks] = useState(null);
  const [selectedTracks, setSelectedTracks] = useState(new Map());

  const toggleTrackSelection = useCallback((track) => {
    setSelectedTracks((prev) => {
      const next = new Map(prev);
      if (next.has(track.videoId)) next.delete(track.videoId);
      else next.set(track.videoId, track);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedTracks(new Map()), []);
  const selectAllTracks = useCallback((tracks, allSelected) => {
    if (allSelected) {
      setSelectedTracks(new Map());
    } else {
      setSelectedTracks(new Map(tracks.map((tr) => [tr.videoId, tr])));
    }
  }, []);
  const [trackContextMenu, setTrackContextMenu] = useState(null);
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  useEffect(() => {
    clearSelection();
  }, [view]);

  const [debugFloat, setDebugFloat] = useState(false);
  useEffect(() => {
    const handler = () => setDebugFloat(true);
    window.addEventListener("kiyoshi-debug-float", handler);
    return () => window.removeEventListener("kiyoshi-debug-float", handler);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [settingsTab, setSettingsTab] = useState("darstellung");
  const selectSettingsSection = useCallback((id) => {
    lockSettingsSection();
    setSettingsSectionStore(id);
    document
      .getElementById("set-sec-" + id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsClosing(true);
    setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
    }, 240);
  }, []);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackShot, setFeedbackShot] = useState(null);
  const openFeedback = useCallback(async () => {
    let shot;
    try {
      await new Promise((r) => setTimeout(r, 180));
      const { invoke } = await import("@tauri-apps/api/core");
      shot = await invoke("capture_screenshot");
    } catch {
      shot = null;
    }
    setFeedbackShot(shot);
    setFeedbackOpen(true);
  }, []);

  const [flashbang, setFlashbang] = useState(false);
  flashbangTriggerRef.current = () => setFlashbang(true);

  const [lyricsRefetchKey, setLyricsRefetchKey] = useState(0);
  const [forcedLyricsProvider, setForcedLyricsProvider] = useState(null);
  const [currentLyricsSource, setCurrentLyricsSource] = useState("");
  const [failedLyricsProviders, setFailedLyricsProviders] = useState(new Set());

  resetLyricsSessionRef.current = () => {
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
    setFailedLyricsProviders(new Set());
  };
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const importLyricsRef = useRef(null);
  const removeCustomLyricsRef = useRef(null);

  useEffect(() => {
    setFailedLyricsProviders(new Set());
    setForcedLyricsProvider(null);
    setCurrentLyricsSource("");
  }, [currentTrack?.videoId]);

  const [splitView, setSplitView] = useState(false);
  const splitViewRef = useRef(splitView);
  splitViewRef.current = splitView;
  const showLyricsRef = useRef(showLyrics);
  showLyricsRef.current = showLyrics;
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-split-ratio"));
    return Number.isFinite(saved) ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, saved)) : 0.5;
  });
  const [splitResizing, setSplitResizing] = useState(false);
  const startSplitResize = useCallback((e) => {
    e.preventDefault();
    setSplitResizing(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      const r = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ev.clientX / window.innerWidth));
      setSplitRatio(r);
    };
    const onUp = () => {
      setSplitResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSplitRatio((r) => {
        localStorage.setItem("kiyoshi-split-ratio", String(r));
        return r;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  const instrumentalVizRef = useRef(instrumentalViz);
  instrumentalVizRef.current = instrumentalViz;
  const lastInstSwitchRef = useRef(0);
  const setShowLyricsManual = useCallback(
    (v) => {
      autoCoverRef.current = false;
      setShowLyrics(v);
    },
    [autoCoverRef, setShowLyrics]
  );
  const handleInstrumentalChange = useCallback(
    (inst) => {
      if (!instrumentalVizRef.current || splitViewRef.current) return;
      const now = performance.now();
      if (now - lastInstSwitchRef.current < 1500) return;
      if (inst) {
        if (showLyricsRef.current) {
          autoCoverRef.current = true;
          lastInstSwitchRef.current = now;
          setShowLyrics(false);
        }
      } else if (autoCoverRef.current) {
        autoCoverRef.current = false;
        lastInstSwitchRef.current = now;
        setShowLyrics(true);
      }
    },
    [autoCoverRef, setShowLyrics]
  );

  const [queueSettled, setQueueSettled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playerVisible, setPlayerVisible] = useState(true);
  const [cursorVisible, setCursorVisible] = useState(true);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!fullscreen) {
      setPlayerVisible(true);
      setCursorVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    const onMove = () => {
      setPlayerVisible(true);
      setCursorVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setPlayerVisible(false);
        setCursorVisible(false);
      }, 3000);
    };
    hideTimerRef.current = setTimeout(() => {
      setPlayerVisible(false);
      setCursorVisible(false);
    }, 3000);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!queueOpen) {
      setQueueSettled(false);
      return;
    }
    const id = setTimeout(() => setQueueSettled(true), animations ? 320 : 0);
    return () => clearTimeout(id);
  }, [queueOpen, animations]);

  useAppShortcuts({
    recordingShortcutRef,
    customShortcutsRef,
    audioRef,
    queueRef,
    setCustomShortcuts,
    setShortcutLabels,
    setRecordingShortcut,
    setIsPlaying,
    setCurrentTrack,
    setFullscreen,
    setOverlayOpen,
    setQueueOpen,
    setSplitView,
    setShowLyricsManual,
    setUiZoom,
    openFeedback,
    currentTrack,
    overlayOpen,
    splitView,
    isPlaying,
  });

  return (
    <>
      {flashbang && (
        <div
          onAnimationEnd={() => setFlashbang(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            pointerEvents: "none",
            background: "white",
            animation: "flashbangFade 3s ease-out forwards",
          }}
        />
      )}
      <div
        data-ambient={ambientBackground && currentTrack?.thumbnail ? "true" : undefined}
        style={{
          display: "flex",
          height: `${100 / uiZoom}vh`,
          background: "var(--bg-base)",
          position: "relative",
          isolation: "isolate",
          cursor: fullscreen && !cursorVisible ? "none" : "default",
          zoom: uiZoom,
        }}
      >
        <AmbientBackdrop thumbnail={ambientBackground ? currentTrack?.thumbnail : null} />
        {!fullscreen && !IS_MAC && <TitleBar />}
        <div
          style={{
            width: fullscreen ? 0 : sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth,
            minWidth: fullscreen ? 0 : sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth,
            flexShrink: 0,
            overflow: "hidden",
            transition: sidebarResizing
              ? "none"
              : "width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)",
            padding: fullscreen ? 0 : "8px 4px 8px 8px",
            position: "relative",
          }}
        >
          <Sidebar
            view={view}
            setView={navigateTo}
            onSearch={handleSearch}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenAccountTab={() => {
              setSettingsTab("account");
              setSettingsOpen(true);
            }}
            onOpenUpdateTab={() => {
              setSettingsTab("update");
              setSettingsOpen(true);
            }}
            onCloseOverlay={() => setOverlayOpen(false)}
            onOpenPlaylist={(pl) => openPlaylist(pl, view)}
            onOpenAlbum={(item) => openAlbum(item, view)}
            onOpenArtist={(item) => openArtist(item, view)}
            onContextMenu={openContextMenu}
            onOpenProfileSwitcher={() => setShowProfileSwitcher(true)}
            onCreatePlaylist={() => setCreatePlaylistOpen(true)}
            updateInfo={updateInfo}
            offlineMode={offlineMode}
            isActuallyOffline={isActuallyOffline}
            onRefreshView={() => setViewRefreshKey((k) => k + 1)}
            obsEnabled={obsEnabled}
            onOpenOverlaySettings={() => {
              setSettingsTab("overlay");
              setSettingsOpen(true);
            }}
            onOpenNews={openNews}
            onOpenFeedback={openFeedback}
            newsUnread={newsUnreadCount}
            settingsOpen={settingsOpen}
            hideUserHandle={hideUserHandle}
          />
          {(settingsOpen || settingsClosing) && !fullscreen && (
            <SettingsSidebarContent
              tab={settingsTab}
              setTab={setSettingsTab}
              onSectionSelect={selectSettingsSection}
              updateInfo={updateInfo}
              onClose={closeSettings}
              collapsed={sidebarCollapsed}
              closing={settingsClosing}
            />
          )}
          {!fullscreen && !sidebarCollapsed && (
            <div
              onMouseDown={startSidebarResize}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: 8,
                cursor: "ew-resize",
                zIndex: 50,
              }}
              onMouseEnter={(e) => {
                const bar = e.currentTarget.firstChild;
                if (bar) bar.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const bar = e.currentTarget.firstChild;
                if (bar) bar.style.opacity = sidebarResizing ? "1" : "0";
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  right: 1,
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 44,
                  borderRadius: 2,
                  background: "var(--accent)",
                  opacity: sidebarResizing ? 1 : 0,
                  transition: "opacity 0.15s",
                  pointerEvents: "none",
                }}
              />
            </div>
          )}
        </div>
        <div
          {...(IS_MAC ? { "data-tauri-drag-region": true } : {})}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              borderRadius: "var(--r-xl)",
              margin: queueOpen
                ? `${IS_MAC ? 16 : 8}px ${queueWidth + 16}px 4px 4px`
                : `${IS_MAC ? 16 : 8}px 8px 4px 4px`,
              transition: queueResizing
                ? "none"
                : animations
                  ? "margin 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease"
                  : "none",
              opacity: overlayOpen || settingsOpen || settingsClosing ? 0 : 1,
              pointerEvents: overlayOpen || settingsOpen || settingsClosing ? "none" : "auto",
            }}
          >
            <MainContent
              appKey={appKey}
              view={view}
              viewRefreshKey={viewRefreshKey}
              animations={animations}
              profiles={profiles}
              openPlaylist={openPlaylist}
              openAlbum={openAlbum}
              openArtist={openArtist}
              openContextMenu={openContextMenu}
              setTrackContextMenu={setTrackContextMenu}
              hideExplicit={hideExplicit}
              searchQuery={searchQuery}
              handleToggleLike={handleToggleLike}
              likedIds={likedIds}
              selectedTracks={selectedTracks}
              toggleTrackSelection={toggleTrackSelection}
              selectAllTracks={selectAllTracks}
              goBack={goBack}
              collection={collection}
              artistView={artistView}
              togglePin={togglePin}
              pinnedIds={pinnedIds}
              isOffline={isOffline}
              language={language}
            />
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {selectedTracks.size > 0 && (
              <SelectionActionBar
                selectedTracks={selectedTracks}
                language={language}
                view={view}
                collection={collection}
                setCollection={setCollection}
                onToggleLike={handleToggleLike}
                onClearSelection={clearSelection}
                onAddToPlaylist={(tracks) => setAddToPlaylistFor({ tracks, fromSelection: true })}
              />
            )}
            <div
              style={{
                opacity: settingsOpen ? 0 : 1,
                transform: fullscreen && !playerVisible ? "translateY(120%)" : "translateY(0)",
                visibility: settingsOpen || (fullscreen && !playerVisible) ? "hidden" : "visible",
                transition:
                  "opacity 0.35s ease, transform 0.42s cubic-bezier(0.4,0,0.2,1), visibility 0.42s ease",
                pointerEvents: settingsOpen
                  ? "none"
                  : !fullscreen || playerVisible
                    ? "auto"
                    : "none",
                position: "relative",
                zIndex: fullscreen ? 105 : "auto",
                padding: fullscreen ? 0 : "0 8px 8px 4px",
              }}
            >
              <Player
                expanded={overlayOpen}
                onExpandToggle={() => setOverlayOpen((e) => !e)}
                showLyrics={showLyrics}
                onToggleLyrics={() => {
                  if (!overlayOpen) {
                    setOverlayOpen(true);
                    setSplitView(false);
                    setShowLyricsManual(true);
                  } else if (fullscreen) {
                    // Cycle: lyrics → cover → split → lyrics
                    autoCoverRef.current = false;
                    if (splitView) {
                      setSplitView(false);
                      setShowLyrics(true);
                    } else if (showLyrics) {
                      setShowLyrics(false);
                    } else {
                      setSplitView(true);
                    }
                  } else {
                    setShowLyricsManual((l) => !l);
                  }
                }}
                queueOpen={queueOpen}
                onToggleQueue={() => setQueueOpen((q) => !q)}
                remoteEnabled={remoteEnabled}
                fullscreen={fullscreen}
                onToggleFullscreen={async () => {
                  const { invoke } = await import("@tauri-apps/api/core");
                  const next = !fullscreen;
                  try {
                    await invoke("set_fullscreen", { fullscreen: next });
                  } catch (e) {
                    console.error(e);
                  }
                  setFullscreen(next);
                  if (next) setOverlayOpen(true);
                  else if (splitView) {
                    setSplitView(false);
                    setShowLyrics(true);
                  }
                }}
                onOpenAlbum={openAlbum}
                onOpenArtist={openArtist}
                onRefetchLyrics={() => {
                  setForcedLyricsProvider(null);
                  setLyricsRefetchKey((k) => k + 1);
                }}
                currentLyricsSource={currentLyricsSource}
                onSwitchLyricsProvider={(id) => setForcedLyricsProvider(id)}
                failedLyricsProviders={failedLyricsProviders}
                language={language}
                showLyricsTranslation={showLyricsTranslation}
                onToggleLyricsTranslation={() => {
                  const next = !showLyricsTranslation;
                  setShowLyricsTranslation(next);
                  localStorage.setItem("kiyoshi-lyrics-translation", String(next));
                }}
                lyricsTranslationLang={lyricsTranslationLang}
                onSetLyricsTranslationLang={(lang) => {
                  setLyricsTranslationLang(lang);
                  localStorage.setItem("kiyoshi-lyrics-translation-lang", lang);
                }}
                isCustomLyrics={isCustomLyrics}
                onImportLyrics={() => importLyricsRef.current?.()}
                onRemoveCustomLyrics={() => removeCustomLyricsRef.current?.()}
                onCreatePlaylist={() => setCreatePlaylistOpen(true)}
                onAddToPlaylist={(tracks) => setAddToPlaylistFor({ tracks })}
                buildShareLink={buildShareLink}
              />
            </div>
          </div>
        </div>
        <PlayerOverlay
          overlayOpen={overlayOpen}
          fullscreen={fullscreen}
          sidebarCollapsed={sidebarCollapsed}
          sidebarWidth={sidebarWidth}
          queueOpen={queueOpen}
          queueWidth={queueWidth}
          queueResizing={queueResizing}
          animations={animations}
          currentTrack={currentTrack}
          ambientBackground={ambientBackground}
          splitView={splitView}
          splitRatio={splitRatio}
          splitResizing={splitResizing}
          startSplitResize={startSplitResize}
          showLyrics={showLyrics}
          audioRef={audioRef}
          isPlaying={isPlaying}
          setOverlayOpen={setOverlayOpen}
          lyricsFontSize={lyricsFontSize}
          lyricsProviders={lyricsProviders}
          lyricsRefetchKey={lyricsRefetchKey}
          addToast={addToast}
          language={language}
          forcedLyricsProvider={forcedLyricsProvider}
          setCurrentLyricsSource={setCurrentLyricsSource}
          setFailedLyricsProviders={setFailedLyricsProviders}
          showLyricsTranslation={showLyricsTranslation}
          lyricsTranslationLang={lyricsTranslationLang}
          lyricsTranslationFontSize={lyricsTranslationFontSize}
          showRomaji={showRomaji}
          lyricsRomajiFontSize={lyricsRomajiFontSize}
          setIsCustomLyrics={setIsCustomLyrics}
          importLyricsRef={importLyricsRef}
          removeCustomLyricsRef={removeCustomLyricsRef}
          showAgentTags={showAgentTags}
          ambientVisualizer={ambientVisualizer}
          syllableZoom={syllableZoom}
          fluidLyrics={fluidLyrics}
          playerVisible={playerVisible}
          handleInstrumentalChange={handleInstrumentalChange}
          vizConfig={vizConfig}
        />

        <QueueDock
          fullscreen={fullscreen}
          queueWidth={queueWidth}
          queueOpen={queueOpen}
          queueSettled={queueSettled}
          ambientBackground={ambientBackground}
          queueResizing={queueResizing}
          animations={animations}
          startQueueResize={startQueueResize}
          setQueueOpen={setQueueOpen}
          likedIds={likedIds}
          handleToggleLike={handleToggleLike}
        />

        <AppOverlays
          language={language}
          addToast={addToast}
          handleLanguageChange={handleLanguageChange}
          uiZoom={uiZoom}
          animations={animations}
          fullscreen={fullscreen}
          sidebarCollapsed={sidebarCollapsed}
          sidebarWidth={sidebarWidth}
          view={view}
          setView={setView}
          collection={collection}
          setCollection={setCollection}
          openAlbum={openAlbum}
          openArtist={openArtist}
          openPlaylist={openPlaylist}
          removeRecentPlaylist={removeRecentPlaylist}
          pinnedIds={pinnedIds}
          togglePin={togglePin}
          likedIds={likedIds}
          handleToggleLike={handleToggleLike}
          clearSelection={clearSelection}
          auth={{
            showLogin,
            setShowLogin,
            addingProfile,
            setAddingProfile,
            reauthName,
            setReauthName,
          }}
          remote={{
            remoteEnabled,
            pairModalOpen,
            setPairModalOpen,
            remoteInfo,
            remoteDevices,
            remoteDeviceAction,
            remoteRememberDevice,
          }}
          settingsPanel={{
            settingsOpen,
            settingsClosing,
            closeSettings,
            settingsTab,
            setSettingsTab,
            setCustomShortcuts,
            anonStats,
            handleAnonStatsChange,
            hideUserHandle,
            setHideUserHandle,
            updateInfo,
            checkForUpdates,
            updateDownloading,
            updateDownloadProgress,
            updateDownloaded,
            downloadUpdate,
            installUpdate,
            cancelUpdateDownload,
          }}
          debugFloatState={{ debugFloat, setDebugFloat }}
          profileSwitcher={{ showProfileSwitcher, setShowProfileSwitcher }}
          news={{ newsOpen, newsItems, newsUnreadSnapshot, loadNews, setNewsOpen }}
          feedback={{ feedbackOpen, feedbackShot, setFeedbackOpen }}
          playlistDialogs={{
            createPlaylistOpen,
            setCreatePlaylistOpen,
            createPlaylistForSelection,
            setCreatePlaylistForSelection,
            createPlaylistTracks,
            setCreatePlaylistTracks,
            addToPlaylistFor,
            setAddToPlaylistFor,
            renameDialog,
            setRenameDialog,
            deleteDialog,
            setDeleteDialog,
          }}
          downloadQueueCard={{
            downloadBatches,
            downloadQueueMin,
            setDownloadQueueMin,
            handleCancelBatch,
          }}
          trackMenu={{ trackContextMenu, setTrackContextMenu }}
          playlistMenu={{ globalContextMenu, setGlobalContextMenu }}
        />
      </div>
    </>
  );
}
