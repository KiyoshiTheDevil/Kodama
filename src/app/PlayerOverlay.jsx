import { LyricsOverlay } from "../features/lyrics/LyricsOverlay.jsx";
import { CoverView } from "../features/player/player-ui.jsx";
import { hiResThumb } from "../features/player/cover-art.js";
import { SIDEBAR_COLLAPSED } from "./shell-constants.js";

// Expanding player overlay — the crossfaded cover backdrop plus the lyrics/cover panes that
// slide up over the content area (and the fullscreen split view with its drag handle).
// Extracted verbatim from AppShell.jsx (Step 14); flat props keep the moved JSX unchanged.
export function PlayerOverlay({
  overlayOpen,
  fullscreen,
  sidebarCollapsed,
  sidebarWidth,
  queueOpen,
  queueWidth,
  queueResizing,
  animations,
  currentTrack,
  ambientBackground,
  splitView,
  splitRatio,
  splitResizing,
  startSplitResize,
  showLyrics,
  audioRef,
  isPlaying,
  setOverlayOpen,
  lyricsFontSize,
  lyricsProviders,
  lyricsRefetchKey,
  addToast,
  language,
  forcedLyricsProvider,
  setCurrentLyricsSource,
  setFailedLyricsProviders,
  showLyricsTranslation,
  lyricsTranslationLang,
  lyricsTranslationFontSize,
  showRomaji,
  lyricsRomajiFontSize,
  setIsCustomLyrics,
  importLyricsRef,
  removeCustomLyricsRef,
  showAgentTags,
  ambientVisualizer,
  syllableZoom,
  fluidLyrics,
  playerVisible,
  handleInstrumentalChange,
  vizConfig,
}) {
  return (
        <div
          style={{
            position: "absolute",
            top: overlayOpen ? (fullscreen ? 0 : 8) : "100%",
            left: fullscreen ? 0 : (sidebarCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth) + 4,
            right: fullscreen ? 0 : queueOpen ? queueWidth + 16 : 8,
            bottom: fullscreen ? 0 : 112,
            zIndex: fullscreen ? 102 : 100,
            overflow: "hidden",
            borderRadius: fullscreen ? 0 : "var(--r-xl)",
            transition: queueResizing
              ? "top 0.42s cubic-bezier(0.4,0,0.2,1), left 0.3s ease"
              : animations
                ? "top 0.42s cubic-bezier(0.4,0,0.2,1), right 0.3s ease, left 0.3s ease"
                : "top 0.1s ease",
            pointerEvents: overlayOpen ? "all" : "none",
          }}
        >
          {/* Shared static background — stays fixed during crossfade */}
          {currentTrack && !ambientBackground && (
            <>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#0d0d0d",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  backgroundImage: currentTrack.thumbnail
                    ? `url(${hiResThumb(currentTrack.thumbnail)})`
                    : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(24px) brightness(0.5)",
                  transform: "scale(1.08)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.55)",
                  pointerEvents: "none",
                }}
              />
            </>
          )}
          {currentTrack &&
            (() => {
              const splitActive = fullscreen && splitView;
              const coverPct = `${(splitRatio * 100).toFixed(2)}%`;
              const lyricsPct = `${((1 - splitRatio) * 100).toFixed(2)}%`;
              const widthTransition = splitResizing
                ? "none"
                : "width 0.4s cubic-bezier(0.4,0,0.2,1)";
              const paneTransition = `opacity 0.35s ease, ${widthTransition}`;
              return (
                <>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: splitActive ? lyricsPct : "100%",
                      opacity: splitActive ? 1 : showLyrics ? 1 : 0,
                      transition: paneTransition,
                      pointerEvents: splitActive || showLyrics ? "all" : "none",
                    }}
                  >
                    <LyricsOverlay
                      track={currentTrack}
                      audioRef={audioRef}
                      onClose={() => setOverlayOpen(false)}
                      fontSize={lyricsFontSize}
                      providers={lyricsProviders}
                      refetchKey={lyricsRefetchKey}
                      onAddToast={addToast}
                      language={language}
                      forcedProvider={forcedLyricsProvider}
                      onSourceChange={setCurrentLyricsSource}
                      onProviderFailed={(id) =>
                        setFailedLyricsProviders((s) => new Set([...s, id]))
                      }
                      showTranslation={showLyricsTranslation}
                      translationLang={lyricsTranslationLang}
                      translationFontSize={lyricsTranslationFontSize}
                      showRomaji={showRomaji}
                      romajiFontSize={lyricsRomajiFontSize}
                      onCustomLyricsStatusChange={setIsCustomLyrics}
                      importLyricsRef={importLyricsRef}
                      removeCustomLyricsRef={removeCustomLyricsRef}
                      showAgentTags={showAgentTags}
                      ambientVisualizer={ambientVisualizer}
                      syllableZoom={syllableZoom}
                      fluidLyrics={fluidLyrics}
                      ambientBackground={ambientBackground}
                      fullscreen={fullscreen}
                      playerBarVisible={playerVisible}
                      onInstrumentalChange={handleInstrumentalChange}
                    />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: splitActive ? coverPct : "100%",
                      opacity: splitActive ? 1 : showLyrics ? 0 : 1,
                      transition: paneTransition,
                      pointerEvents: splitActive || !showLyrics ? "all" : "none",
                      borderRight: splitActive ? "1px solid rgba(255,255,255,0.08)" : "none",
                    }}
                  >
                    <CoverView
                      track={currentTrack}
                      isPlaying={isPlaying}
                      onClose={() => setOverlayOpen(false)}
                      ambientVisualizer={ambientVisualizer}
                      vizConfig={vizConfig}
                      narrow={splitActive}
                    />
                  </div>
                  {/* Drag handle between the two panes (mirrors the sidebar/queue handles) */}
                  {splitActive && (
                    <div
                      onMouseDown={startSplitResize}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: coverPct,
                        width: 12,
                        marginLeft: -6,
                        cursor: "ew-resize",
                        zIndex: 6,
                      }}
                      onMouseEnter={(e) => {
                        const bar = e.currentTarget.firstChild;
                        if (bar) bar.style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        const bar = e.currentTarget.firstChild;
                        if (bar) bar.style.opacity = splitResizing ? "1" : "0";
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 5,
                          top: 0,
                          bottom: 0,
                          width: 2,
                          background: "rgba(255,255,255,0.55)",
                          opacity: splitResizing ? 1 : 0,
                          transition: "opacity 0.15s",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  )}
                </>
              );
            })()}
        </div>
  );
}
