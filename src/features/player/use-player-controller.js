import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "../../shared/api/client.js";
import { translate } from "../../i18n.js";
import { IpcAudio } from "./ipc-audio.js";
import { registerPlayerCommands as bpRegisterCommands } from "../../bigpicture/playerBridge.js";
import { useLastfmScrobbling } from "../integrations/lastfm.js";
import { usePlayerNativeBridges } from "./hooks/use-player-native-bridges.js";
import { useWindowTitle } from "./hooks/use-window-title.js";

// Player controller (Step 11): the single owner of the IpcAudio instance, the current track,
// the queue, the playing flag, and the play/enqueue/radio/deep-link commands + play-history
// writes. App consumes this via destructure, so existing JSX and prop chains are unchanged;
// consumers migrate to player-context in later Step 11 increments.
//
// Lyrics-session reset (clearing forced/current/failed providers on a new track) is injected as a
// ref rather than as setters, because App's lyrics-session state is declared *after* this hook is
// called — passing the setters directly would hit a temporal-dead-zone error in the dep arrays.
export function usePlayerController({ addToast, resetLyricsSessionRef, lastfm, integrationsRef }) {
  // One IpcAudio for the app lifetime. Kept as a ref so it survives re-renders and stays a
  // singleton (duplicating it would duplicate native audio, listeners, and OBS capture).
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new IpcAudio();

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  // Latest queue for keyboard/callback paths without stale closures.
  const queueRef = useRef([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Native window/taskbar title follows playback.
  useWindowTitle(currentTrack, isPlaying);
  useLastfmScrobbling({ currentTrack, isPlaying, lastfm });
  const [integrationRevision, setIntegrationRevision] = useState(0);
  const refreshNativeIntegrations = useCallback(() => {
    setIntegrationRevision((revision) => revision + 1);
  }, []);
  usePlayerNativeBridges({
    audioRef,
    currentTrack,
    isPlaying,
    integrationsRef,
    integrationRevision,
  });

  // Pause audio without touching track/queue — used by the Composer-pause event below and by
  // any caller (e.g. the profile switch/remove/logout reset) that clears currentTrack/queue and
  // must stop the actual playing audio in the same step, not just reset the UI.
  const stopPlayback = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Pause Kodama's own playback when the Composer (community-lyrics editor) window opens, so the
  // user isn't hearing the main player and the editor's audio at once. openComposer() (in the
  // lyrics feature) fires this event; we pause here to keep React state in sync.
  useEffect(() => {
    window.addEventListener("kodama-pause-playback", stopPlayback);
    return () => window.removeEventListener("kodama-pause-playback", stopPlayback);
  }, [stopPlayback]);

  // Playback config (autoplay + crossfade + progressive mode) lives at the controller boundary so
  // the player transport and the settings UI read a single source rather than a settings-owned
  // copy (Step 11d/11f). Setters are persistence-aware so App only adapts these values for
  // Settings instead of also owning the storage writes.
  const [autoplay, setAutoplayState] = useState(
    () => localStorage.getItem("kiyoshi-autoplay") !== "false"
  );
  const setAutoplay = useCallback((v) => {
    setAutoplayState(v);
    localStorage.setItem("kiyoshi-autoplay", v);
  }, []);
  const [crossfade, setCrossfadeState] = useState(() => {
    const s = parseInt(localStorage.getItem("kiyoshi-crossfade"));
    return isNaN(s) ? 0 : s;
  });
  const setCrossfade = useCallback((v) => {
    setCrossfadeState(v);
    localStorage.setItem("kiyoshi-crossfade", v);
  }, []);
  // Progressive playback (default): stream the song for a fast start. Off = classic full
  // download first (more stable on weak devices). Both stay in the Rust audio core.
  const [playbackProgressive, setPlaybackProgressiveState] = useState(
    () => localStorage.getItem("kodama-playback-mode") !== "classic"
  );
  const setPlaybackProgressive = useCallback((v) => {
    setPlaybackProgressiveState(v);
    localStorage.setItem("kodama-playback-mode", v ? "progressive" : "classic");
  }, []);
  const [crossfadeOverrides, setCrossfadeOverrides] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kodama-crossfade-overrides")) || {};
    } catch {
      return {};
    }
  });
  const setCrossfadeOverride = useCallback((fromId, toId, secs, fromTitle, toTitle) => {
    if (!fromId || !toId) return;
    setCrossfadeOverrides((prev) => {
      const next = { ...prev, [`${fromId}__${toId}`]: { secs, fromTitle, toTitle } };
      localStorage.setItem("kodama-crossfade-overrides", JSON.stringify(next));
      return next;
    });
  }, []);
  const removeCrossfadeOverride = useCallback((key) => {
    setCrossfadeOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem("kodama-crossfade-overrides", JSON.stringify(next));
      return next;
    });
  }, []);

  const handlePlay = useCallback((track, trackList) => {
    setCurrentTrack(track);
    resetLyricsSessionRef.current?.();
    if (trackList) {
      const seen = new Set();
      const deduped = trackList.filter((t) => {
        if (!t.videoId || seen.has(t.videoId)) return false;
        seen.add(t.videoId);
        return true;
      });
      setQueue(deduped);
    }
    // Save to play history
    if (track?.videoId) {
      try {
        const key = `kiyoshi-history-${window.__activeProfile || "default"}`;
        const stored = JSON.parse(localStorage.getItem(key) || "[]");
        const entry = { ...track, playedAt: Date.now() };
        // Don't add duplicate of the very last played track
        const filtered = stored.filter((t, i) => !(i === 0 && t.videoId === track.videoId));
        localStorage.setItem(key, JSON.stringify([entry, ...filtered].slice(0, 200)));
        window.dispatchEvent(new Event("kiyoshi-history-updated"));
      } catch { /* intentionally ignored */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enqueue a track for Big Picture's context menu: "next" inserts it right after the current
  // track, "end" appends it. The queue is the source of truth for next/prev (getAdjacentTrack),
  // so a plain splice is enough. With nothing playing yet, just start it.
  const enqueue = useCallback(
    (track, mode) => {
      if (!track?.videoId) return;
      if (!currentTrack) {
        handlePlay(track, [track]);
        return;
      }
      if (track.videoId === currentTrack.videoId) return;
      setQueue((q) => {
        const n = q.filter((x) => x.videoId !== track.videoId); // move if already queued
        const i = n.findIndex((x) => x.videoId === currentTrack.videoId);
        const at = mode === "next" ? (i < 0 ? n.length : i + 1) : n.length;
        n.splice(at, 0, track);
        return n;
      });
    },
    [currentTrack, handlePlay]
  );

  // Big Picture bridge: expose "play this track" + enqueue (the Player already owns transport/seek).
  useEffect(() => {
    bpRegisterCommands({ play: handlePlay, enqueue });
  }, [handlePlay, enqueue]);

  // Start an autoplay radio/mix seeded from a single track. Reads the language from localStorage
  // (not a `language` state cell, which is declared further down in App → would be a TDZ ref here).
  const startSongRadio = useCallback(
    async (track) => {
      if (!track?.videoId) return;
      const fail = () =>
        addToast(translate(localStorage.getItem("kiyoshi-lang") || "de", "radioFailed"), "error");
      try {
        const r = await fetch(`${API}/radio/_?videoId=${encodeURIComponent(track.videoId)}`);
        const d = await r.json();
        if (d.tracks?.length) handlePlay(d.tracks[0], d.tracks);
        else fail();
      } catch {
        fail();
      }
    },
    [handlePlay, addToast]
  );

  // Play a song from just a videoId (shared kodama://song/<id> deep link): fetch minimal
  // metadata so the player has a title/cover, then play. Falls back to a bare track.
  const playByVideoId = useCallback(
    async (videoId) => {
      try {
        const d = await fetch(`${API}/song/meta/${videoId}`).then((r) => r.json());
        if (d && d.videoId && !d.error) handlePlay(d);
        else handlePlay({ videoId, title: videoId, artists: "" });
      } catch {
        handlePlay({ videoId, title: videoId, artists: "" });
      }
    },
    [handlePlay]
  );

  // Deep links: kodama://song/<videoId>. Handles both cold start (getCurrent) and while
  // the app is already running (onOpenUrl, routed via the single-instance plugin).
  useEffect(() => {
    let unlisten;
    const handle = (url) => {
      const m = String(url || "").match(/^kodama:\/\/song\/([A-Za-z0-9_-]{6,})/i);
      if (m) playByVideoId(m[1]);
    };
    (async () => {
      try {
        const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        const start = await getCurrent();
        if (start && start.length) start.forEach(handle);
        unlisten = await onOpenUrl((urls) => urls.forEach(handle));
      } catch (e) {
        console.error("[DeepLink]", e);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [playByVideoId]);

  return {
    audioRef,
    currentTrack,
    setCurrentTrack,
    isPlaying,
    setIsPlaying,
    stopPlayback,
    queue,
    setQueue,
    queueRef,
    handlePlay,
    enqueue,
    startSongRadio,
    playByVideoId,
    autoplay,
    setAutoplay,
    crossfade,
    setCrossfade,
    playbackProgressive,
    setPlaybackProgressive,
    crossfadeOverrides,
    setCrossfadeOverride,
    removeCrossfadeOverride,
    refreshNativeIntegrations,
  };
}
