import { createContext, useContext } from "react";

// Global user preferences, grouped by domain, so components stop receiving them as props
// threaded down from App(). Most of Player's ~44 and LyricsOverlay's ~28 props were never
// really about those components -- they were settings on their way through.
//
// The defaults below are what anything rendered OUTSIDE the provider falls back to. The setters
// are no-ops there: outside the provider there is nothing to write to.
export const LYRICS_PREFS_DEFAULTS = {
  showTranslation:     false,
  setShowTranslation:  () => {},
  translationLang:     "DE",
  setTranslationLang:  () => {},
  translationFontSize: 20,
  showRomaji:          false,
  setShowRomaji:       () => {},
  romajiFontSize:      18,
  showAgentTags:       true,
  syllableZoom:        false,
  fluidLyrics:         true,
  braccatoLyrics:      false,
  braccatoLetterWave:  true,
  ambientVisualizer:   true,
  ambientBackground:   false,
};

const LyricsPrefsContext = createContext(LYRICS_PREFS_DEFAULTS);

export const LyricsPrefsProvider = LyricsPrefsContext.Provider;
export const useLyricsPrefs = () => useContext(LyricsPrefsContext);

// ─── Playback ────────────────────────────────────────────────────────────────
// Values and plain setters only. Actions with real side effects stay props --
// toggleRemote starts/stops the backend's phone endpoints, and the playback-mode
// setter writes the sentinel strings "progressive"/"classic" rather than a boolean,
// so neither is a preference write we want to hide behind a context setter.
export const PLAYBACK_PREFS_DEFAULTS = {
  crossfade:               0,
  setCrossfade:            () => {},
  crossfadeOverrides:      {},
  setCrossfadeOverride:    () => {},
  removeCrossfadeOverride: () => {},
  remoteEnabled:           false,
  playbackProgressive:     true,
};

const PlaybackPrefsContext = createContext(PLAYBACK_PREFS_DEFAULTS);

export const PlaybackPrefsProvider = PlaybackPrefsContext.Provider;
export const usePlaybackPrefs = () => useContext(PlaybackPrefsContext);
