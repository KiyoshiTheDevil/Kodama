import { createContext, useContext } from "react";

// Global user preferences, grouped by domain, so components stop receiving them as props
// threaded down from App(). Most of Player's ~44 and LyricsOverlay's ~28 props were never
// really about those components -- they were settings on their way through.
//
// IMPORTANT: the defaults below must stay identical to the prop defaults the components had
// before this context existed. Anything rendered OUTSIDE the provider falls back to them, and
// Big Picture does exactly that: it mounts its own <LyricsOverlay> as a sibling of <App/>
// (see src/bigpicture/Lyrics.jsx) with only 4 props, so it has always run on these defaults --
// no translation, no romaji, no syllable zoom. Keeping the values in sync preserves that.
// If Big Picture should honour the real settings some day, wrap it in the provider instead of
// changing these numbers.

// The setters are no-ops in the default value: outside the provider there is nothing to write
// to. That is the correct behaviour for Big Picture, which has no settings UI of its own.
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
