import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast, ToastProvider } from "@heroui/react";
import { API } from "./shared/api/client.js";
import { thumb } from "./shared/api/thumbnails.js";
import { AppShell } from "./app/AppShell.jsx";
import { GLOBAL_KEYFRAMES } from "./app/global-keyframes.js";
import {
  LanguagePickerScreen,
  FfmpegSetupScreen,
  FfmpegUpdateBanner,
  SplashScreen,
} from "./app/startup-screens.jsx";
import { storageCodecs, usePersistedState } from "./shared/hooks/use-persisted-state.js";
import { setAccentSmooth, vibrantAccentFromImage } from "./shared/lib/accent.js";
import { CODE_DISPLAY_FALLBACK } from "./shared/lib/shortcuts.js";
import { useNetworkStatus } from "./app/hooks/use-network-status.js";
import { useObsOverlay } from "./features/overlay/hooks/use-obs-overlay.js";
import { useRemoteControl } from "./features/remote/hooks/use-remote-control.js";
import { useDownloadManager } from "./features/downloads/hooks/use-download-manager.js";
import { useProfiles } from "./features/profiles/hooks/use-profiles.js";
import { translate } from "./i18n.js";
import { getInitialLang } from "./shared/lib/lang.js";
import { startAudioLevels } from "./audioLevels.js";
import { IconContext } from "./icons.jsx";

import {
  AnimationContext,
  FontScaleContext,
  LangContext,
  TrackNumberContext,
  ZoomContext,
} from "./context.jsx";
import { DEFAULT_LYRICS_PROVIDERS } from "./lyrics/providers.js";
import { itemId, profileKey } from "./features/music/lib/playlist-id.js";
import { useMusicNavigation } from "./features/music/hooks/use-music-navigation.js";
import { useLikes } from "./features/music/hooks/use-likes.js";
import { VIZ_DEFAULTS } from "./features/player/player-ui.jsx";
import { usePlayerController } from "./features/player/use-player-controller.js";
import { PlayerProvider } from "./features/player/player-context.jsx";
import { ProfileProvider } from "./features/profiles/profile-context.jsx";
import { DownloadProvider } from "./features/downloads/download-context.jsx";
import { useLastfmClient } from "./features/integrations/lastfm.js";
import { SettingsProviders } from "./features/settings/settings-context.jsx";
import { DEFAULT_SHORTCUTS } from "./features/settings/settings-constants.js";

const IPV4_FIRST_ENDPOINTS = ["/operation/network/ipv4-first", "/network/ipv4-first"];
const CSS_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22];

async function fetchIpv4FirstSetting(options = {}) {
  let lastError = null;
  for (const path of IPV4_FIRST_ENDPOINTS) {
    try {
      const res = await fetch(`${API}${path}`, options);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("IPv4-first setting request failed");
}

// openOverlayEditor moved to src/app/AppShell.jsx (Step 13a-i).

// openComposer (community-lyrics editor bridge) moved to features/lyrics/LyricsOverlay.jsx.

// APP_VERSION (Vite-injected) moved to src/app/AppShell.jsx — its only consumer, BugReportModal,
// lives there now.

// News feed + anonymous heartbeat now live in app/hooks/use-news.js.

// IS_MAC moved to src/app/AppShell.jsx (Step 13a-i) — App no longer renders any platform-specific
// chrome directly.

// Stepped values for the zoom and font-size sliders
const ZOOM_STEPS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
const FONT_STEPS = [0.85, 0.93, 1.0, 1.1, 1.2, 1.35, 1.5];
const UI_ZOOM_STORAGE = {
  serialize: storageCodecs.number.serialize,
  deserialize: (raw) => {
    const value = storageCodecs.number.deserialize(raw);
    if (!ZOOM_STEPS.includes(value)) throw new TypeError("Stored zoom value is unsupported");
    return value;
  },
};
const FONT_SCALE_STORAGE = {
  serialize: storageCodecs.number.serialize,
  deserialize: (raw) => {
    const value = storageCodecs.number.deserialize(raw);
    if (!FONT_STEPS.includes(value)) throw new TypeError("Stored font scale is unsupported");
    return value;
  },
};

// Live app-icon default, read by the icon-apply effect; the picker and its full icon groups
// live in the settings feature.
const APP_ICON_DEFAULT = "Kodama App Icon - Standard Pink.png";

// Map of what used to live at App.jsx module scope and where it moved:
//   audio → features/player/ipc-audio.js · titlebar / context-menu / ambient-backdrop → shared/ui/
//   sidebar + shell layout → app/AppShell.jsx · startup screens → app/startup-screens.jsx
//   global keyframes → app/global-keyframes.js · accent helpers → shared/lib/accent.js
//   music views → features/music/ · lyrics overlay → features/lyrics/ · login → app/AppShell.jsx

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  // Skip FFmpeg screen if we already confirmed it available in a previous run.
  const [ffmpegSetupDone, setFfmpegSetupDone] = useState(
    () => localStorage.getItem("kiyoshi-ffmpeg-ok") === "1"
  );
  // Background check: offer an FFmpeg update when gyan.dev has a newer release than installed.
  const [ffmpegUpdate, setFfmpegUpdate] = useState(null); // null | { installed, latest }
  useEffect(() => {
    if (!ffmpegSetupDone || !navigator.onLine) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const d = await fetch(`${API}/ffmpeg/check-update`).then((r) => r.json());
        if (cancelled || !d.updateAvailable) return;
        if (localStorage.getItem("kiyoshi-ffmpeg-update-dismissed") === d.latest) return;
        setFfmpegUpdate({ installed: d.installed, latest: d.latest });
      } catch { /* intentionally ignored */ }
    }, 6000); // defer so it never competes with startup work
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [ffmpegSetupDone]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 1700);
    const hideTimer = setTimeout(() => setShowSplash(false), 2150);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Sidebar/queue resize geometry, split-view, selection state, context menus, and
  // playlist/settings/feedback/debug dialogs now live in src/app/AppShell.jsx (Step 13a-i).
  const [pinnedIds, setPinnedIds] = useState([]);

  // ─── Toast Notifications (HeroUI toast system) ───────────────────────────────
  // Thin wrapper so all existing addToast(message, type) call sites keep working.
  const addToast = useCallback((message, type = "info") => {
    if (type === "error") toast.danger(message, { timeout: 6000 });
    else if (type === "success") toast.success(message, { timeout: 3500 });
    else toast(message, { timeout: 3500 });
  }, []);

  // App update lifecycle (useAppUpdate) moved wholesale to src/app/AppShell.jsx (Step 13a-i) —
  // its only consumers (Sidebar, SettingsPanel) live there now.

  // Start Rust audio-level collection on mount.
  useEffect(() => {
    startAudioLevels();
  }, []);

  const togglePin = useCallback((pl) => {
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(profileKey("kiyoshi-pinned")) || "[]");
      } catch {
        return [];
      }
    })();
    const id = itemId(pl);
    const already = stored.find((p) => itemId(p) === id);
    const next = already ? stored.filter((p) => itemId(p) !== id) : [pl, ...stored];
    localStorage.setItem(profileKey("kiyoshi-pinned"), JSON.stringify(next));
    setPinnedIds(next.map((p) => itemId(p)));
    window.dispatchEvent(new Event("kiyoshi-pins-updated"));
  }, []);

  // openContextMenu/settingsOpen/settingsClosing/settingsTab/settingsInitialTab, the news feed
  // (useNews), the feedback/bug-report dialog, and closeSettings/selectSettingsSection all moved
  // to src/app/AppShell.jsx (Step 13a-i).
  const [accent, setAccent] = useState(() => {
    const saved = localStorage.getItem("kiyoshi-accent");
    if (saved) document.documentElement.style.setProperty("--accent", saved);
    return saved || "#e040fb";
  });
  const [theme, setTheme] = useState(() => localStorage.getItem("kiyoshi-theme") || "dark");
  const [highContrast, setHighContrast] = useState(() => {
    const hc = localStorage.getItem("kiyoshi-high-contrast") === "true";
    if (hc) document.documentElement.setAttribute("data-highcontrast", "true");
    return hc;
  });
  const [appFont, setAppFont] = useState(() => {
    const saved = localStorage.getItem("kiyoshi-app-font") || "default";
    if (saved === "dyslexic")
      document.documentElement.style.setProperty("--font", "'OpenDyslexic', system-ui, sans-serif");
    return saved;
  });
  const handleAppFontChange = useCallback((id) => {
    setAppFont(id);
    localStorage.setItem("kiyoshi-app-font", id);
    if (id === "dyslexic") {
      document.documentElement.style.setProperty("--font", "'OpenDyslexic', system-ui, sans-serif");
    } else {
      document.documentElement.style.setProperty("--font", "'MiSans Latin', system-ui, sans-serif");
    }
  }, []);
  const [ambientVisualizer, setAmbientVisualizer] = useState(
    () => localStorage.getItem("kiyoshi-ambient-visualizer") !== "false"
  );
  const [instrumentalViz, setInstrumentalViz] = useState(
    () => localStorage.getItem("kiyoshi-instrumental-viz") !== "false"
  );
  const [vizConfig, setVizConfig] = useState(() => {
    try {
      return {
        ...VIZ_DEFAULTS,
        ...JSON.parse(localStorage.getItem("kiyoshi-visualizer-config") || "{}"),
      };
    } catch {
      return { ...VIZ_DEFAULTS };
    }
  });
  const updateViz = useCallback(
    (patch) =>
      setVizConfig((c) => {
        const next = { ...c, ...patch };
        localStorage.setItem("kiyoshi-visualizer-config", JSON.stringify(next));
        return next;
      }),
    []
  );
  const [ambientBackground, setAmbientBackground] = useState(
    () => localStorage.getItem("kiyoshi-ambient-bg") === "true"
  );
  // flashbang state now lives in AppShell; this ref lets handleThemeChange (pinned here by the
  // appearanceSettings memo closure) trigger it without prop-threading a setter upward.
  const flashbangTriggerRef = useRef(null);
  const lightClickRef = useRef({ count: 0, lastTime: 0 });

  const [accentDynamic, setAccentDynamic] = useState(
    () => localStorage.getItem("kiyoshi-accent-dynamic") === "true"
  );
  const handleAccentDynamicChange = useCallback((on) => {
    setAccentDynamic(on);
    localStorage.setItem("kiyoshi-accent-dynamic", on ? "true" : "false");
  }, []);
  const [accentSat, setAccentSat] = useState(() => {
    const v = parseFloat(localStorage.getItem("kiyoshi-accent-sat"));
    return isNaN(v) ? 0.5 : v;
  });
  const [accentLight, setAccentLight] = useState(() => {
    const v = parseFloat(localStorage.getItem("kiyoshi-accent-light"));
    return isNaN(v) ? 0.6 : v;
  });
  const handleAccentSatChange = useCallback((v) => {
    setAccentSat(v);
    localStorage.setItem("kiyoshi-accent-sat", String(v));
  }, []);
  const handleAccentLightChange = useCallback((v) => {
    setAccentLight(v);
    localStorage.setItem("kiyoshi-accent-light", String(v));
  }, []);

  const handleAccentChange = useCallback(
    (color) => {
      setAccent(color);
      if (!accentDynamic) document.documentElement.style.setProperty("--accent", color);
      localStorage.setItem("kiyoshi-accent", color);
    },
    [accentDynamic]
  );

  const handleThemeChange = useCallback((t) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("kiyoshi-theme", t);
    if (t === "light") {
      const now = Date.now();
      if (now - lightClickRef.current.lastTime < 700) {
        lightClickRef.current.count++;
        if (lightClickRef.current.count >= 4) {
          lightClickRef.current.count = 0;
          flashbangTriggerRef.current?.();
        }
      } else {
        lightClickRef.current.count = 1;
      }
      lightClickRef.current.lastTime = now;
    } else {
      lightClickRef.current.count = 0;
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const [searchQuery, setSearchQuery] = useState("");
  // Music navigation domain (see features/music/hooks/use-music-navigation.js): view, back-nav
  // history, the open collection/artist, and the open*/navigateTo/goBack commands. Consumed here
  // via destructure so existing JSX/prop chains are unchanged (Step 12), same pattern as the
  // player controller below. Must run before useProfiles/useNetworkStatus — both inject this
  // hook's setView/setAppKey/setCollection setters into their own reset sequences.
  const {
    view,
    setView,
    appKey,
    setAppKey,
    viewRefreshKey,
    setViewRefreshKey,
    collection,
    setCollection,
    artistView,
    handleSearch,
    removeRecentPlaylist,
    openPlaylist,
    openAlbum,
    openArtist,
    navigateTo,
    goBack,
  } = useMusicNavigation({ setSearchQuery });
  // Player controller owns the audio, track, queue, playing state, and playback commands.
  // Consumed here via destructure so existing JSX/prop chains are unchanged (Step 11).
  // resetLyricsSessionRef is populated further down, once the lyrics-session state exists.
  const resetLyricsSessionRef = useRef(null);
  // These values are declared below the controller. Refs let player-native bridges read
  // the latest settings without reordering the existing settings/hooks graph.
  const playerIntegrationRef = useRef({ discordRpc: true, obsEnabled: false, obsPort: 9848 });
  const lastfm = useLastfmClient();
  const player = usePlayerController({
    addToast,
    resetLyricsSessionRef,
    lastfm,
    integrationsRef: playerIntegrationRef,
  });
  const {
    audioRef,
    currentTrack,
    setCurrentTrack,
    isPlaying,
    stopPlayback,
    setQueue,
    crossfade,
    setCrossfade,
    playbackProgressive,
    setPlaybackProgressive,
    crossfadeOverrides,
    removeCrossfadeOverride,
    refreshNativeIntegrations,
  } = player;
  const [discordRpc, setDiscordRpc] = useState(
    () => localStorage.getItem("kiyoshi-discord-rpc") !== "false"
  );

  // Dynamic accent: when enabled, derive --accent live from the current cover; otherwise
  // fall back to the fixed accent. Re-runs whenever the track or the mode changes.
  useEffect(() => {
    if (!accentDynamic) {
      document.documentElement.style.setProperty("--accent", accent);
      return;
    }
    const url = currentTrack?.thumbnail ? thumb(currentTrack.thumbnail) : null;
    if (!url) {
      document.documentElement.style.setProperty("--accent", accent);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        setAccentSmooth(vibrantAccentFromImage(img, accentSat, accentLight));
      } catch {
        document.documentElement.style.setProperty("--accent", accent);
      }
    };
    img.onerror = () => {
      if (!cancelled) document.documentElement.style.setProperty("--accent", accent);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [accentDynamic, currentTrack?.thumbnail, accent, accentSat, accentLight]);

  // ─── Usage stats: total app usage time + total song playtime (persisted, global) ───
  const usageSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-usage") || 0));
  const playtimeSecRef = useRef(Number(localStorage.getItem("kiyoshi-total-playtime") || 0));
  // App usage: count seconds while the window is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        usageSecRef.current += 1;
        if (usageSecRef.current % 30 === 0)
          localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
      }
    }, 1000);
    const flush = () => localStorage.setItem("kiyoshi-total-usage", String(usageSecRef.current));
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      clearInterval(id);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
  // Song playtime: count seconds while actually playing.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      playtimeSecRef.current += 1;
      if (playtimeSecRef.current % 15 === 0)
        localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current));
    }, 1000);
    return () => {
      localStorage.setItem("kiyoshi-total-playtime", String(playtimeSecRef.current));
      clearInterval(id);
    };
  }, [isPlaying]);

  const [closeTray, setCloseTray] = useState(
    () => localStorage.getItem("kiyoshi-close-tray") !== "false"
  );
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("set_close_to_tray", { enabled: closeTray }).catch(() => {})
    );
  }, [closeTray]);

  // ── OBS overlay server (see features/overlay/hooks/use-obs-overlay.js) ──
  const { obsEnabled, obsPort, obsPortInput, setObsPortInput, toggleObs, saveObsPort } =
    useObsOverlay();
  useEffect(() => {
    playerIntegrationRef.current = { discordRpc, obsEnabled, obsPort };
    refreshNativeIntegrations();
  }, [discordRpc, obsEnabled, obsPort, refreshNativeIntegrations]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // lyricsRefetchKey/forcedLyricsProvider/currentLyricsSource/failedLyricsProviders and the
  // resetLyricsSessionRef.current wiring now live in AppShell (Step 13a-i); the ref itself is
  // still created here since usePlayerController (above) is injected with it.
  const [showLyricsTranslation, setShowLyricsTranslation] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-translation") === "true"
  );
  const [lyricsTranslationLang, setLyricsTranslationLang] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-translation-lang") || "DE"
  );
  const [showRomaji, setShowRomaji] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-romaji") === "true"
  );
  const [syllableZoom, setSyllableZoom] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-syllable-zoom") === "true"
  );
  const [fluidLyrics, setFluidLyrics] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-fluid") === "true"
  );
  // isCustomLyrics, importLyricsRef/removeCustomLyricsRef, the reset-lyrics-on-track-change
  // effect, splitView/splitRatio/splitResizing/startSplitResize, showLyricsRef/splitViewRef,
  // lastInstSwitchRef, setShowLyricsManual, and handleInstrumentalChange now live in AppShell.
  // autoCoverRef stays here (it's mirrored by AppShell but also written by this appearanceSettings
  // memo's onToggleInstrumentalViz below, so it's a shared ref passed down as a prop).
  const [showAgentTags, setShowAgentTags] = useState(
    () => localStorage.getItem("kiyoshi-lyrics-agent-tags") !== "false"
  );
  const [showLyrics, setShowLyrics] = useState(true);
  const autoCoverRef = useRef(false);
  const [queueOpen, setQueueOpen] = useState(false);
  // fullscreen/playerVisible/cursorVisible/hideTimerRef + the idle-cursor effect, and
  // queueSettled + its effect, now live in AppShell (Step 13a-i).

  // Composer-pause and native window title now live in usePlayerController (Step 11d).

  // Playback commands (handlePlay/enqueue/startSongRadio/playByVideoId), the Big Picture
  // bridge, and deep-link handling moved to features/player/use-player-controller.js (Step 11).

  const [language, setLanguage] = useState(() => getInitialLang());

  // ── Downloads + local cache (see features/downloads/hooks/use-download-manager.js) ──
  const downloads = useDownloadManager({ addToast, language });
  // Distributed to views/PlaylistLayout/Player/track-context-menu via DownloadContext (Step 12);
  // App keeps only what the download-queue progress card (still App-owned, passed to AppShell as
  // props) reads/acts on directly.
  const { downloadBatches, downloadQueueMin, setDownloadQueueMin, handleCancelBatch } = downloads;

  // handleSearch/addRecentPlaylist/removeRecentPlaylist/openPlaylist/openAlbum now live in
  // features/music/hooks/use-music-navigation.js (Step 12).

  const [animations, setAnimations] = useState(
    () => localStorage.getItem("kiyoshi-animations") !== "false"
  );
  // queueSettled + its effect now live in AppShell (Step 13a-i).
  const [lyricsFontSize, setLyricsFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-font-size"));
    return isNaN(s) ? 32 : s;
  });
  const [lyricsTranslationFontSize, setLyricsTranslationFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-translation-font-size"));
    return isNaN(s) ? 20 : s;
  });
  const [lyricsRomajiFontSize, setLyricsRomajiFontSize] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-lyrics-romaji-font-size"));
    return isNaN(s) ? 18 : s;
  });
  const [hideExplicit, setHideExplicit] = useState(
    () => localStorage.getItem("kiyoshi-hide-explicit") === "true"
  );
  const [showTrackNumbers, setShowTrackNumbers] = useState(
    () => localStorage.getItem("kodama-track-numbers") === "true"
  );
  const handleTrackNumbersChange = useCallback((on) => {
    setShowTrackNumbers(on);
    localStorage.setItem("kodama-track-numbers", String(on));
  }, []);
  // Anonymous active-user stats: default ON, one-click opt-out. See analytics/.
  const [anonStats, setAnonStats] = useState(
    () => localStorage.getItem("kodama-anon-stats") !== "false"
  );
  const handleAnonStatsChange = useCallback((on) => {
    setAnonStats(on);
    localStorage.setItem("kodama-anon-stats", String(on));
  }, []);
  const [hideUserHandle, setHideUserHandle] = useState(
    () => localStorage.getItem("kiyoshi-hide-handle") === "true"
  );
  const [uiZoom, setUiZoom] = usePersistedState("kiyoshi-ui-zoom", 1.0, UI_ZOOM_STORAGE);

  const [customShortcuts, setCustomShortcuts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kiyoshi-shortcuts") || "{}");
      return { ...DEFAULT_SHORTCUTS, ...saved };
    } catch {
      return { ...DEFAULT_SHORTCUTS };
    }
  });
  const [shortcutLabels, setShortcutLabels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kiyoshi-shortcut-labels") || "{}");
    } catch {
      return {};
    }
  });
  const [recordingShortcut, setRecordingShortcut] = useState(null);
  const customShortcutsRef = useRef(customShortcuts);
  const recordingShortcutRef = useRef(null);
  useEffect(() => {
    customShortcutsRef.current = customShortcuts;
  }, [customShortcuts]);
  useEffect(() => {
    recordingShortcutRef.current = recordingShortcut;
  }, [recordingShortcut]);

  const getShortcutLabel = useCallback(
    (stored) => {
      if (!stored) return "—";
      if (!stored.includes("+")) {
        const label = shortcutLabels[stored] || CODE_DISPLAY_FALLBACK[stored] || stored;
        return label.length === 1 ? label.toUpperCase() : label;
      }
      // Compound: "Ctrl+Equal" → "Ctrl+="
      const parts = stored.split("+");
      const code = parts[parts.length - 1];
      const mods = parts.slice(0, -1);
      const keyLabel = shortcutLabels[code] || CODE_DISPLAY_FALLBACK[code] || code;
      const displayKey = keyLabel.length === 1 ? keyLabel.toUpperCase() : keyLabel;
      return [...mods, displayKey].join("+");
    },
    [shortcutLabels]
  );

  const resetShortcut = useCallback((id) => {
    setCustomShortcuts((prev) => {
      const next = { ...prev, [id]: DEFAULT_SHORTCUTS[id] };
      localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
      return next;
    });
  }, []);

  const [appFontScale, setAppFontScale] = usePersistedState(
    "kiyoshi-font-scale",
    1.0,
    FONT_SCALE_STORAGE
  );

  useLayoutEffect(() => {
    CSS_FONT_SIZES.forEach((s) => {
      document.documentElement.style.setProperty(`--t${s}`, `${Math.round(s * appFontScale)}px`);
    });
  }, [appFontScale]);

  // uiZoom wird direkt im App-Container angewendet (kein document.documentElement),
  // damit position:fixed / 100vh-Werte korrekt bleiben.
  const [lyricsProviders, setLyricsProviders] = useState(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map((p) => p.id));
    try {
      const saved = localStorage.getItem("kiyoshi-lyrics-providers");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remove providers that no longer exist (e.g. old Kimuco entry)
        const filtered = parsed.filter((p) => validIds.has(p.id));
        // Add any new default providers not yet in the saved list
        const ids = filtered.map((p) => p.id);
        const merged = [
          ...filtered,
          ...DEFAULT_LYRICS_PROVIDERS.filter((p) => !ids.includes(p.id)),
        ];
        return merged;
      }
    } catch { /* intentionally ignored */ }
    return DEFAULT_LYRICS_PROVIDERS;
  });
  // Migration: add newly introduced providers / remove obsolete ones
  useEffect(() => {
    const validIds = new Set(DEFAULT_LYRICS_PROVIDERS.map((p) => p.id));
    setLyricsProviders((current) => {
      const filtered = current.filter((p) => validIds.has(p.id));
      const ids = filtered.map((p) => p.id);
      const missing = DEFAULT_LYRICS_PROVIDERS.filter((p) => !ids.includes(p.id));
      if (missing.length === 0 && filtered.length === current.length) return current;
      const merged = [...filtered, ...missing];
      localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(merged));
      return merged;
    });
  }, []);
  const [ipv4First, setIpv4First] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchIpv4FirstSetting()
      .then((d) => {
        if (!cancelled) setIpv4First(!!d.enabled);
      })
      .catch((e) => console.error("[Network] IPv4-first load failed:", e));
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleIpv4First = useCallback(
    (enabled) => {
      const previous = ipv4First;
      setIpv4First(enabled);
      fetchIpv4FirstSetting({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
        .then((d) => setIpv4First(!!d.enabled))
        .catch((e) => {
          console.error("[Network] IPv4-first toggle failed:", e);
          setIpv4First(previous);
        });
    },
    [ipv4First]
  );

  // ── LAN remote control (see features/remote/hooks/use-remote-control.js) ──
  // Enabling starts the token-gated phone endpoints on the (already 0.0.0.0) backend.
  // The Player pushes now-playing state + drains commands while enabled.
  const {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    remoteTrustedIds,
    pairModalOpen,
    setPairModalOpen,
    toggleRemote,
    remoteDeviceAction,
    remoteRememberDevice,
  } = useRemoteControl();

  // App-icon personalization. Applies live to taskbar/window/tray (+ macOS Dock & bundle)
  // via the Rust `set_app_icon` command. The static pinned-shortcut icon stays as installed.
  const [appIcon, setAppIcon] = useState(
    () => localStorage.getItem("kodama-app-icon") || APP_ICON_DEFAULT
  );
  const applyAppIcon = useCallback(async (file) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_app_icon", { file });
    } catch (e) {
      console.error("[AppIcon] set failed:", e);
    }
  }, []);
  const handleAppIconChange = useCallback(
    (file) => {
      setAppIcon(file);
      localStorage.setItem("kodama-app-icon", file);
      applyAppIcon(file);
    },
    [applyAppIcon]
  );
  // Re-apply the user's chosen icon on each launch (only if they customized it).
  useEffect(() => {
    const stored = localStorage.getItem("kodama-app-icon");
    if (stored && stored !== APP_ICON_DEFAULT) applyAppIcon(stored);
  }, [applyAppIcon]);

  // Per-transition crossfade overrides: { "fromId__toId": { secs, fromTitle, toTitle } }.
  // A pair override beats the global default; secs 0 = hard cut for that one transition.
  // ── Profile / Auth ──
  // ── Profiles / auth / session (see features/profiles/hooks/use-profiles.js) ──
  // The account switch/remove/logout commands reset app-wide UI as a single business
  // sequence; those state cells are still App-owned, so their setters are injected while
  // the ordering stays in the profile domain.
  const profile = useProfiles({
    addToast,
    setPinnedIds,
    setView,
    setSearchQuery,
    setAppKey,
    setCurrentTrack,
    setQueue,
    setCollection,
    setOverlayOpen,
    setQueueOpen,
    stopPlayback,
  });
  // Account actions (switch/add/reauth/remove/rename/avatar/logout) are consumed through
  // ProfileContext now (Sidebar, settings account tab, profile-switcher modal — see
  // features/profiles/profile-context.jsx); App keeps only the startup/auth-gate state and
  // `profiles`/`fetchProfiles`, which it still reads directly (home greeting, network status).
  const {
    profiles,
    showLogin,
    setShowLogin,
    showLangPicker,
    setShowLangPicker,
    showProfileSwitcher,
    setShowProfileSwitcher,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    fetchProfiles,
  } = profile;

  // Keepalive ping to prevent server connection timeout
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/status`).catch(() => {});
    }, 30000); // ping every 30s
    return () => clearInterval(interval);
  }, []);

  // Cached-song id loading now lives in features/downloads/hooks/use-download-manager.js.

  // Liked-song loading + optimistic toggle now live in features/music/hooks/use-likes.js.

  // OBS overlay auto-start on mount lives in features/overlay/hooks/use-obs-overlay.js.

  // ── Liked-songs domain (see features/music/hooks/use-likes.js) ──
  const { likedIds, handleToggleLike } = useLikes({ lastfm });

  // ── Network status + offline mode (see app/hooks/use-network-status.js) ──
  const { offlineMode, isActuallyOffline, isOffline } = useNetworkStatus({
    fetchProfiles,
    setAppKey,
    setView,
  });

  // Debug float window toggle now lives in AppShell (Step 13a-i).

  // Auth bootstrap (validate → cache fallback → background poll) lives in
  // features/profiles/hooks/use-profiles.js.

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    localStorage.setItem("kiyoshi-lang", lang);
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("update_tray_labels", {
        showLabel: translate(lang, "trayShow"),
        quitLabel: translate(lang, "trayQuit"),
      }).catch(() => {});
    });
  };

  // Sync tray labels with current language on startup
  useEffect(() => {
    const lang = localStorage.getItem("kiyoshi-lang") || "de";
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("update_tray_labels", {
        showLabel: translate(lang, "trayShow"),
        quitLabel: translate(lang, "trayQuit"),
      }).catch(() => {});
    });
  }, []);

  // Mouse wheel volume control — only on player bar area
  useEffect(() => {
    const onWheel = (e) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Only adjust volume when hovering over the volume area
      const playerBar = e.target.closest?.("[data-volume-area]");
      if (!playerBar) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.02 : -0.02;
      const dv = Math.min(1, Math.max(0, Math.sqrt(audio.volume) + delta));
      audio.volume = dv * dv;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [audioRef]);

  // artistView/openArtist/navigateTo/goBack now live in
  // features/music/hooks/use-music-navigation.js (Step 12).

  // Clear-selection-on-view-change and the keyboard-shortcut effect now live in AppShell
  // (Step 13a-i). openFeedback previously lived here too.

  // Settings domain slices — each is an independent, memoized value/actions object so a change in
  // one domain (e.g. a lyric toggle) does not invalidate consumers of another (e.g. appearance).
  // App remains the temporary owner of the underlying state/persistence; these objects only carry
  // it into the settings feature via SettingsProviders. See features/settings/settings-context.jsx.
  const appearanceSettings = useMemo(
    () => ({
      accent,
      onAccentChange: handleAccentChange,
      accentDynamic,
      onAccentDynamicChange: handleAccentDynamicChange,
      accentSat,
      onAccentSatChange: handleAccentSatChange,
      accentLight,
      onAccentLightChange: handleAccentLightChange,
      appIcon,
      onAppIconChange: handleAppIconChange,
      theme,
      onThemeChange: handleThemeChange,
      animations,
      onAnimationsChange: (v) => {
        setAnimations(v);
        localStorage.setItem("kiyoshi-animations", v);
      },
      highContrast,
      onToggleHighContrast: () => {
        const next = !highContrast;
        setHighContrast(next);
        document.documentElement.setAttribute("data-highcontrast", String(next));
        localStorage.setItem("kiyoshi-high-contrast", String(next));
      },
      appFont,
      onAppFontChange: handleAppFontChange,
      appFontScale,
      onFontScaleChange: (v) => {
        setAppFontScale(v);
      },
      uiZoom,
      onUiZoomChange: (v) => {
        setUiZoom(v);
      },
      showTrackNumbers,
      onTrackNumbersChange: handleTrackNumbersChange,
      hideExplicit,
      onHideExplicitChange: (v) => {
        setHideExplicit(v);
        localStorage.setItem("kiyoshi-hide-explicit", v);
      },
      ambientBackground,
      onToggleAmbientBackground: () => {
        const next = !ambientBackground;
        setAmbientBackground(next);
        localStorage.setItem("kiyoshi-ambient-bg", String(next));
      },
      ambientVisualizer,
      onToggleAmbientVisualizer: () => {
        const next = !ambientVisualizer;
        setAmbientVisualizer(next);
        localStorage.setItem("kiyoshi-ambient-visualizer", String(next));
      },
      instrumentalViz,
      onToggleInstrumentalViz: (v) => {
        setInstrumentalViz(v);
        localStorage.setItem("kiyoshi-instrumental-viz", v ? "true" : "false");
        if (!v && autoCoverRef.current) {
          autoCoverRef.current = false;
          setShowLyrics(true);
        }
      },
      vizConfig,
      onUpdateViz: updateViz,
      vizPreviewTrack: currentTrack,
      vizPreviewPlaying: isPlaying,
    }),
    [
      accent,
      handleAccentChange,
      accentDynamic,
      handleAccentDynamicChange,
      accentSat,
      handleAccentSatChange,
      accentLight,
      handleAccentLightChange,
      appIcon,
      handleAppIconChange,
      theme,
      handleThemeChange,
      animations,
      highContrast,
      appFont,
      handleAppFontChange,
      appFontScale,
      setAppFontScale,
      uiZoom,
      setUiZoom,
      showTrackNumbers,
      handleTrackNumbersChange,
      hideExplicit,
      ambientBackground,
      ambientVisualizer,
      instrumentalViz,
      vizConfig,
      updateViz,
      currentTrack,
      isPlaying,
    ]
  );

  // Autoplay/crossfade/progressive-mode state and persistence are owned by the player controller
  // (Step 11f); App only adapts the controller's values/actions into the settings shape.
  const playbackSettings = useMemo(
    () => ({
      autoplay: player.autoplay,
      onAutoplayChange: player.setAutoplay,
      crossfade,
      onCrossfadeChange: setCrossfade,
      crossfadeOverrides,
      onRemoveCrossfadeOverride: removeCrossfadeOverride,
      playbackProgressive,
      onPlaybackProgressiveChange: setPlaybackProgressive,
    }),
    [
      player.autoplay,
      player.setAutoplay,
      crossfade,
      setCrossfade,
      crossfadeOverrides,
      removeCrossfadeOverride,
      playbackProgressive,
      setPlaybackProgressive,
    ]
  );

  const lyricsSettings = useMemo(
    () => ({
      lyricsFontSize,
      onLyricsFontSizeChange: (v) => {
        setLyricsFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-font-size", v);
      },
      lyricsTranslationFontSize,
      onLyricsTranslationFontSizeChange: (v) => {
        setLyricsTranslationFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-translation-font-size", v);
      },
      lyricsRomajiFontSize,
      onLyricsRomajiFontSizeChange: (v) => {
        setLyricsRomajiFontSize(v);
        localStorage.setItem("kiyoshi-lyrics-romaji-font-size", v);
      },
      lyricsProviders,
      onLyricsProvidersChange: (v) => {
        setLyricsProviders(v);
        localStorage.setItem("kiyoshi-lyrics-providers", JSON.stringify(v));
      },
      showRomaji,
      onToggleRomaji: () => {
        const next = !showRomaji;
        setShowRomaji(next);
        localStorage.setItem("kiyoshi-lyrics-romaji", String(next));
      },
      showAgentTags,
      onToggleAgentTags: () => {
        const next = !showAgentTags;
        setShowAgentTags(next);
        localStorage.setItem("kiyoshi-lyrics-agent-tags", String(next));
      },
      syllableZoom,
      onToggleSyllableZoom: () => {
        const next = !syllableZoom;
        setSyllableZoom(next);
        localStorage.setItem("kiyoshi-lyrics-syllable-zoom", String(next));
      },
      fluidLyrics,
      onToggleFluidLyrics: () => {
        const next = !fluidLyrics;
        setFluidLyrics(next);
        localStorage.setItem("kiyoshi-lyrics-fluid", String(next));
      },
    }),
    [
      lyricsFontSize,
      lyricsTranslationFontSize,
      lyricsRomajiFontSize,
      lyricsProviders,
      showRomaji,
      showAgentTags,
      syllableZoom,
      fluidLyrics,
    ]
  );

  const integrationSettings = useMemo(
    () => ({
      closeTray,
      onCloseTrayChange: (v) => {
        setCloseTray(v);
        localStorage.setItem("kiyoshi-close-tray", String(v));
        import("@tauri-apps/api/core").then(({ invoke }) =>
          invoke("set_close_to_tray", { enabled: v }).catch(() => {})
        );
      },
      discordRpc,
      onDiscordRpcChange: (v) => {
        setDiscordRpc(v);
        localStorage.setItem("kiyoshi-discord-rpc", v);
        if (!v)
          import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke("clear_discord_rpc").catch(() => {})
          );
      },
      ipv4First,
      onIpv4FirstChange: toggleIpv4First,
      obsEnabled,
      obsPort,
      obsPortInput,
      setObsPortInput,
      toggleObs,
      onObsPortSave: saveObsPort,
      remoteEnabled,
      remoteDevices,
      remoteTrustedIds,
      onToggleRemote: toggleRemote,
      onRemoteDevice: remoteDeviceAction,
      onRememberDevice: remoteRememberDevice,
      onPairDevice: () => setPairModalOpen(true),
    }),
    [
      closeTray,
      discordRpc,
      ipv4First,
      toggleIpv4First,
      obsEnabled,
      obsPort,
      obsPortInput,
      setObsPortInput,
      toggleObs,
      saveObsPort,
      remoteEnabled,
      remoteDevices,
      remoteTrustedIds,
      toggleRemote,
      remoteDeviceAction,
      remoteRememberDevice,
      setPairModalOpen,
    ]
  );

  const shortcutSettings = useMemo(
    () => ({
      customShortcuts,
      shortcutLabels,
      recordingShortcut,
      setRecordingShortcut,
      getShortcutLabel,
      resetShortcut,
    }),
    [
      customShortcuts,
      shortcutLabels,
      recordingShortcut,
      setRecordingShortcut,
      getShortcutLabel,
      resetShortcut,
    ]
  );

  // AnimatedView moved to AppShell (Step 13a-i).

  // ── AppShell prop bundles (Step 13a-ii) ──────────────────────────────────────
  // Everything below is pinned to App by a settings-memo closure or a profile/navigation-reset
  // injection (see the Step 13 boundary map). Grouped into named objects instead of a flat prop
  // list, mirroring the appearanceSettings-style pattern; AppShell isn't memoized, so these are
  // plain object literals rather than useMemo — object identity doesn't gate any re-render here.
  const appShellNav = {
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
  };
  const appShellUi = {
    overlayOpen,
    setOverlayOpen,
    queueOpen,
    setQueueOpen,
    showLyrics,
    setShowLyrics,
    uiZoom,
    setUiZoom,
  };
  const appShellShortcuts = {
    customShortcutsRef,
    recordingShortcutRef,
    setCustomShortcuts,
    setShortcutLabels,
    setRecordingShortcut,
  };
  const appShellAppearancePrefs = {
    animations,
    hideExplicit,
    ambientBackground,
    ambientVisualizer,
    vizConfig,
    instrumentalViz,
  };
  const appShellLyricsPrefs = {
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
  };
  const appShellAuthGate = {
    showLogin,
    setShowLogin,
    addingProfile,
    setAddingProfile,
    reauthName,
    setReauthName,
    showProfileSwitcher,
    setShowProfileSwitcher,
  };
  const appShellRemote = {
    remoteEnabled,
    remoteInfo,
    remoteDevices,
    pairModalOpen,
    setPairModalOpen,
    remoteDeviceAction,
    remoteRememberDevice,
  };
  const appShellNetwork = { offlineMode, isActuallyOffline, isOffline };
  const appShellDownloadQueue = {
    downloadBatches,
    downloadQueueMin,
    setDownloadQueueMin,
    handleCancelBatch,
  };
  const appShellPrivacySettings = {
    anonStats,
    handleAnonStatsChange,
    hideUserHandle,
    setHideUserHandle,
  };
  const appShellBridges = { autoCoverRef, flashbangTriggerRef, resetLyricsSessionRef };

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <LangContext.Provider value={language}>
        <TrackNumberContext.Provider value={showTrackNumbers}>
          <AnimationContext.Provider value={animations}>
            <FontScaleContext.Provider value={appFontScale}>
              <ZoomContext.Provider value={uiZoom}>
                <ProfileProvider controller={profile}>
                  <DownloadProvider controller={downloads}>
                    <PlayerProvider controller={player}>
                      <SettingsProviders
                        appearance={appearanceSettings}
                        playback={playbackSettings}
                        lyrics={lyricsSettings}
                        integrations={integrationSettings}
                        shortcuts={shortcutSettings}
                      >
                        <style>{GLOBAL_KEYFRAMES}</style>
                        {!animations && (
                          <style>{`*, *::before, *::after { transition: none !important; animation: none !important; }`}</style>
                        )}
                        {showSplash && <SplashScreen fading={splashFading} />}
                        {/* Language picker first on very first launch, before FFmpeg setup */}
                        {showLangPicker && !showLogin && (
                          <LanguagePickerScreen
                            currentLanguage={language}
                            onConfirm={(lang) => {
                              localStorage.setItem("kiyoshi-lang", lang);
                              setLanguage(lang);
                              setShowLangPicker(false);
                              if (!profiles.length) setShowLogin(true);
                            }}
                          />
                        )}
                        {!ffmpegSetupDone && !showLangPicker && (
                          <FfmpegSetupScreen onDone={() => setFfmpegSetupDone(true)} />
                        )}
                        {ffmpegUpdate && (
                          <FfmpegUpdateBanner
                            installed={ffmpegUpdate.installed}
                            latest={ffmpegUpdate.latest}
                            onClose={() => setFfmpegUpdate(null)}
                          />
                        )}

                        {/* Toast Notifications */}
                        <ToastProvider
                          placement="bottom end"
                          className="bottom-[120px]! z-[100000]!"
                        />

                        <AppShell
                          language={language}
                          addToast={addToast}
                          handleLanguageChange={handleLanguageChange}
                          obsEnabled={obsEnabled}
                          likedIds={likedIds}
                          handleToggleLike={handleToggleLike}
                          nav={appShellNav}
                          shellUi={appShellUi}
                          shortcuts={appShellShortcuts}
                          appearancePrefs={appShellAppearancePrefs}
                          lyricsPrefs={appShellLyricsPrefs}
                          authGate={appShellAuthGate}
                          remote={appShellRemote}
                          network={appShellNetwork}
                          downloadQueue={appShellDownloadQueue}
                          privacySettings={appShellPrivacySettings}
                          bridges={appShellBridges}
                        />
                      </SettingsProviders>
                    </PlayerProvider>
                  </DownloadProvider>
                </ProfileProvider>
              </ZoomContext.Provider>
            </FontScaleContext.Provider>
          </AnimationContext.Provider>
        </TrackNumberContext.Provider>
      </LangContext.Provider>
    </IconContext.Provider>
  );
}
