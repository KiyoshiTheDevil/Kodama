import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "../../shared/api/client.js";
import { parseDurationToSeconds } from "../../lyrics/parse.js";
import { useAnimations, useLang } from "../../context.jsx";
import { useLyricsSettings } from "../settings/settings-context.jsx";
import {
  registerAudio as bpRegisterAudio,
  registerPlayerCommands as bpRegisterCommands,
  setNowPlaying as bpSetNowPlaying,
} from "../../bigpicture/playerBridge.js";
import { PlayerControls } from "./player-controls.jsx";
import { useSleepTimer } from "./hooks/use-sleep-timer.js";
import { useTrackMetadata } from "./hooks/use-track-metadata.js";
import {
  usePlaybackStatus,
  useQueueState,
  usePlaybackConfig,
  usePlayerActions,
} from "./player-context.jsx";

export function Player({
  expanded,
  onExpandToggle,
  showLyrics,
  onToggleLyrics,
  queueOpen,
  onToggleQueue,
  fullscreen,
  onToggleFullscreen,
  remoteEnabled = false,
  onOpenAlbum,
  onOpenArtist,
  onExportSong,
  onDownloadSong,
  cachedSongIds,
  downloadingIds,
  onRefetchLyrics,
  currentLyricsSource = "",
  onSwitchLyricsProvider,
  failedLyricsProviders = new Set(),
  language = "de",
  showLyricsTranslation = false,
  onToggleLyricsTranslation,
  lyricsTranslationLang = "DE",
  onSetLyricsTranslationLang,
  isCustomLyrics = false,
  onImportLyrics,
  onRemoveCustomLyrics,
  onPremiumDetected,
  onCreatePlaylist,
  onAddToPlaylist,
  buildShareLink,
}) {
  // Core playback + crossfade config come from PlayerContext (Step 11) rather than props.
  const { track, isPlaying, audioRef } = usePlaybackStatus();
  const { queue } = useQueueState();
  const { crossfade, crossfadeOverrides, playbackProgressive } = usePlaybackConfig();
  const { setTrack, setIsPlaying, setQueue } = usePlayerActions();
  // lyricsProviders is a settings preference, not player state — read the single source of
  // truth from SettingsContext instead of threading a duplicate copy through App (Step 11).
  const { lyricsProviders } = useLyricsSettings();
  const [progress, setProgress] = useState(0);
  // Stable ref so fetchUrl can read the current playback mode without re-subscribing.
  const playbackProgressiveRef = useRef(playbackProgressive);
  playbackProgressiveRef.current = playbackProgressive;
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem("kiyoshi-volume"));
    return isNaN(saved) ? 0.4 : Math.max(0, Math.min(1, saved));
  });
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likePulsing, setLikePulsing] = useState(false);
  const [prevBouncing, setPrevBouncing] = useState(false);
  const [nextBouncing, setNextBouncing] = useState(false);
  const { sleepTimerEnd, setSleepTimerEnd, sleepRemaining, formatSleepRemaining } =
    useSleepTimer({ audioRef, setIsPlaying });
  const { fetchedBrowseIds, fetchMoreBrowseIds } = useTrackMetadata(track);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("none");
  const t = useLang();

  // LRU cache: videoId -> url (max 50 entries, Map preserves insertion order)
  const URL_CACHE_MAX = 50;
  const urlCache = useRef(new Map());

  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const queueRef = useRef(queue);
  const trackRef = useRef(track);
  const crossfadeRef = useRef(crossfade);
  const volumeRef = useRef(volume);
  const prevVolumeRef = useRef(volume > 0 ? volume : 0.4);
  // Quadratic volume curve — human hearing is logarithmic, so v² feels linear
  const volCurve = (v) => v * v;

  const crossfadeActiveRef = useRef(false); // a crossfade is pending or in flight
  const crossfadePendingTrackRef = useRef(null); // next track, set until Rust confirms "started"
  const crossfadeFailedTrackRef = useRef(null); // videoId a crossfade failed for (don't retry it)
  const skipStreamResetRef = useRef(false); // suppress audio_play after a crossfade advance
  const _lastProgressTs = useRef(0); // throttle: last time setProgress was called
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);
  useEffect(() => {
    crossfadeRef.current = crossfade;
  }, [crossfade]);
  const crossfadeOverridesRef = useRef(crossfadeOverrides);
  useEffect(() => {
    crossfadeOverridesRef.current = crossfadeOverrides;
  }, [crossfadeOverrides]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onVolumeChange = () => {
      const raw = audio.volume;
      const v = Math.sqrt(raw); // reverse the v² curve to get display value
      // Only update if the volume actually differs from current state to avoid
      // feedback loops (IpcAudio fires volumechange after every set volume).
      if (Math.abs(v - volumeRef.current) < 0.005) return;
      setVolume(v);
      if (v > 0) prevVolumeRef.current = v;
      localStorage.setItem("kiyoshi-volume", v);
    };
    audio.addEventListener("volumechange", onVolumeChange);
    return () => audio.removeEventListener("volumechange", onVolumeChange);
  }, []);

  const getAdjacentTrack = useCallback((dir) => {
    const q = queueRef.current;
    const t = trackRef.current;
    if (!q.length || !t) return null;
    const idx = q.findIndex((x) => x.videoId === t.videoId);
    if (idx === -1) return null;
    if (dir === "next") {
      if (shuffleRef.current) return q[Math.floor(Math.random() * q.length)];
      return q[(idx + 1) % q.length];
    }
    return q[(idx - 1 + q.length) % q.length];
  }, []);

  const urlCacheGet = (videoId) => {
    const c = urlCache.current;
    if (!c.has(videoId)) return null;
    // Move to end (most-recently-used)
    const val = c.get(videoId);
    c.delete(videoId);
    c.set(videoId, val);
    return val;
  };
  const urlCachePut = (videoId, url) => {
    const c = urlCache.current;
    c.delete(videoId); // remove old position if exists
    c.set(videoId, url);
    if (c.size > URL_CACHE_MAX) c.delete(c.keys().next().value); // evict oldest
  };

  const fetchUrl = useCallback(
    async (videoId) => {
      const cached = urlCacheGet(videoId);
      if (cached) return cached;
      // Prefer locally cached song (served via backend, works for both Rust & HTML5)
      try {
        const cr = await fetch(`${API}/song/cached/${videoId}`, { method: "HEAD" });
        if (cr.ok) {
          const cachedUrl = `${API}/song/cached/${videoId}`;
          urlCachePut(videoId, cachedUrl);
          return cachedUrl;
        }
      } catch {}
      const useRust = audioRef.current && audioRef.current._fallback === false;
      // Progressive (default): hand the Rust core the range-streaming proxy URL so it starts
      // playing as soon as the header is fetched, instead of waiting for a full yt-dlp download.
      if (useRust && playbackProgressiveRef.current) {
        const proxyUrl = `${API}/audio-stream/${videoId}`;
        urlCachePut(videoId, proxyUrl);
        return proxyUrl;
      }
      // Classic: download via yt-dlp to disk and return the file path (Rust reads from disk).
      if (useRust) {
        try {
          const r = await fetch(`${API}/stream-prepare/${videoId}`);
          const d = await r.json();
          if (d.premium_only) {
            onPremiumDetected?.(videoId);
            return null;
          }
          if (d.path) {
            // Prefix with file:// so Rust knows it's a local path
            const fileUrl = `file://${d.path.replace(/\\/g, "/")}`;
            urlCachePut(videoId, fileUrl);
            return fileUrl;
          }
        } catch (e) {
          console.error(`[stream-prepare] ${videoId}:`, e);
        }
      }
      // HTML5 fallback: fetch direct googlevideo URL (browser handles cookies)
      let lastStreamError = null;
      for (let i = 1; i <= 3; i++) {
        try {
          const r = await fetch(`${API}/stream/${videoId}`);
          const d = await r.json();
          if (d.premium_only) {
            onPremiumDetected?.(videoId);
            return null;
          }
          if (d.url) {
            urlCachePut(videoId, d.url);
            return d.url;
          }
          if (d.error) lastStreamError = d.error;
        } catch (e) {
          lastStreamError = String(e);
        }
        if (i < 3) await new Promise((res) => setTimeout(res, 800));
      }
      if (lastStreamError) console.error(`[stream] ${videoId}: ${lastStreamError}`);
      return null;
    },
    [onPremiumDetected]
  );

  // Preload upcoming tracks in the background so sequential listening (album/playlist/queue)
  // has near-instant transitions and "next". Warm the next TWO tracks (most listening is
  // in order) plus the previous one. Sequential (not concurrent) to avoid starving the
  // current song's own download of bandwidth. Shuffle's "next" is random/unpredictable, so
  // there we only warm the immediate in-order neighbour as a cheap best-effort.
  const preloadAdjacent = useCallback(async () => {
    await new Promise((res) => setTimeout(res, 1500)); // let the current song's download get ahead
    const q = queueRef.current;
    const t = trackRef.current;
    if (!q.length || !t) return;
    const idx = q.findIndex((x) => x.videoId === t.videoId);
    if (idx === -1) return;
    const targets = shuffleRef.current
      ? [q[(idx + 1) % q.length]]
      : [q[(idx + 1) % q.length], q[(idx + 2) % q.length], q[(idx - 1 + q.length) % q.length]];
    for (const tk of targets) {
      if (!tk || tk.videoId === t.videoId) continue;
      if (playbackProgressiveRef.current) {
        // Progressive: prewarm the URL resolution (the ~2-4s yt-dlp extraction) so the next
        // play is extraction-free. No bytes are downloaded — playback streams on demand.
        try {
          await fetch(`${API}/audio-stream/${tk.videoId}/warm`);
        } catch {}
      } else if (!urlCache.current.has(tk.videoId)) {
        // Classic: pre-download to disk.
        try {
          await fetchUrl(tk.videoId);
        } catch {}
      }
    }
  }, [fetchUrl]);

  useEffect(() => {
    if (!track) return;
    // Check if track is liked
    fetch(`${API}/liked/ids`)
      .then((r) => r.json())
      .then((d) => setIsLiked((d.ids || []).includes(track.videoId)))
      .catch(() => {});
  }, [track?.videoId]);

  useEffect(() => {
    if (!track) return;
    setLoading(true);
    setStreamUrl(null);
    let cancelled = false;

    fetchUrl(track.videoId).then((url) => {
      if (cancelled) return;
      if (url) {
        setStreamUrl(url);
      } else {
        console.error("Stream fehlgeschlagen");
      }
      setLoading(false);
    });

    preloadAdjacent();
    return () => {
      cancelled = true;
    };
  }, [track]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !streamUrl) return;

    // When a crossfade advanced the track (Rust signalled "started"), Rust is already
    // playing the incoming track on its second sink — skip audio_play, just sync UI.
    const skipSrcReset = skipStreamResetRef.current;
    skipStreamResetRef.current = false;

    if (skipSrcReset) {
      // Audio already playing from the Rust crossfade — just sync state.
      // Don't touch a.src — Rust is mid-blend; fall through to (re)attach listeners.
      // Leave crossfadeActiveRef set: it stays true until Rust emits "done".
      setIsPlaying(true);
      if (a.duration) setDuration(a.duration);
    } else {
      // A fresh/manual play cancels any pending crossfade (Rust's Play stops sink2).
      crossfadeActiveRef.current = false;
      crossfadePendingTrackRef.current = null;
      crossfadeFailedTrackRef.current = null;
      a.src = streamUrl;
      a.volume = volCurve(volume);
      volumeRef.current = volume;
      a.play().catch((e) => console.error("[Player] play() error:", e));
      setIsPlaying(true);
      setProgress(0);
    }

    // IpcAudio may return 0 when Rust can't determine duration from metadata;
    // fall back to the track's formatted duration string in that case.
    const onDur = () => {
      const d = a.duration > 0 ? a.duration : parseDurationToSeconds(track?.duration) || 0;
      setDuration(d);
    };

    const onEnd = () => {
      // If a crossfade has already started, Rust drives the transition — ignore the
      // outgoing track's end. (Once Rust promotes + emits "done", the guard clears
      // and a later natural end of the promoted track advances normally.)
      if (crossfadeActiveRef.current && !crossfadePendingTrackRef.current) return;
      // A crossfade that was still *pending* (build not started) is aborted here.
      crossfadeActiveRef.current = false;
      crossfadePendingTrackRef.current = null;
      if (repeatRef.current === "one") {
        a.currentTime = 0;
        a.play();
      } else {
        const next = getAdjacentTrack("next");
        if (next) setTrack(next);
        else if (repeatRef.current === "none") setIsPlaying(false);
      }
    };

    // Combined timeupdate handler: throttled progress + Rust-core crossfade trigger.
    const onTimeUpdate = () => {
      // Throttle setProgress to max 4× per second to avoid excessive re-renders.
      const now = performance.now();
      if (now - _lastProgressTs.current >= 250) {
        _lastProgressTs.current = now;
        setProgress(a.currentTime);
      }

      if (!a.duration) return;
      // Crossfade is a Rust-core feature (two sinks, OBS-capturable). If we fell
      // back to HTML5 audio (Rust binary missing), skip it entirely.
      if (audioRef.current?._fallback !== false) return;
      if (crossfadeActiveRef.current || repeatRef.current === "one") return;
      // Don't keep retrying a crossfade that already failed for this very track.
      if (crossfadeFailedTrackRef.current === trackRef.current?.videoId) return;

      const next = getAdjacentTrack("next");
      if (!next) return;

      // Per-transition override beats the global default; secs 0 = hard cut for this pair.
      const ov = crossfadeOverridesRef.current[`${trackRef.current?.videoId}__${next.videoId}`];
      const cfWin = ov ? ov.secs : crossfadeRef.current;
      if (!cfWin || cfWin <= 0) return;

      const remaining = a.duration - a.currentTime;
      if (remaining > cfWin || remaining <= 0.05) return;

      // Mark immediately so we trigger exactly once. The guard stays set until Rust
      // confirms the outcome via "started"/"done"/"failed" — never reset by re-renders,
      // which is what previously caused a re-trigger storm during the build window.
      crossfadeActiveRef.current = true;
      crossfadePendingTrackRef.current = next;
      const fromId = trackRef.current?.videoId;
      fetchUrl(next.videoId).then((url) => {
        // Bail if the track changed underneath us (manual skip / natural end) while
        // the URL was resolving — otherwise we'd start a stale crossfade.
        if (
          !url ||
          trackRef.current?.videoId !== fromId ||
          crossfadePendingTrackRef.current !== next
        ) {
          if (trackRef.current?.videoId === fromId) {
            crossfadeActiveRef.current = false;
            crossfadePendingTrackRef.current = null;
          }
          return;
        }
        // Rust runs both sinks simultaneously (outgoing down, incoming up) so the
        // blend is captured by OBS / the visualizer just like normal playback. The UI
        // advances only once Rust emits "audio-crossfade-started" (see listener below).
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("audio_crossfade", { url, seekTo: 0, duration: cfWin }).catch((e) =>
            console.error("[Player] audio_crossfade error:", e)
          );
        });
      });
    };

    // Always register listeners — even after a crossfade advance.
    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnd);
    };
  }, [streamUrl]);

  // Rust crossfade lifecycle. The UI advances to the incoming track exactly when the
  // blend actually starts ("started"), and the guard clears only on a definitive
  // outcome ("done"/"failed") — never on a re-render. This is what prevents the
  // re-trigger storm that came from clearing the guard during the async build window.
  useEffect(() => {
    let unlistens = [];
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      const reg = (name, fn) =>
        listen(name, fn).then((u) => {
          if (cancelled) u();
          else unlistens.push(u);
        });

      reg("audio-crossfade-started", () => {
        const next = crossfadePendingTrackRef.current;
        crossfadePendingTrackRef.current = null;
        // Rust is now audibly playing `next` on its second sink — move the UI to it
        // and suppress the duplicate audio_play in the streamUrl effect.
        if (next) {
          skipStreamResetRef.current = true;
          setTrack(next);
        }
      });
      reg("audio-crossfade-done", () => {
        crossfadeActiveRef.current = false;
      });
      reg("audio-crossfade-failed", () => {
        // Mark this track so we don't immediately retry; outgoing keeps playing and
        // will hand off via the normal `ended` path once it finishes.
        crossfadeFailedTrackRef.current = trackRef.current?.videoId || null;
        crossfadeActiveRef.current = false;
        crossfadePendingTrackRef.current = null;
      });
    });
    return () => {
      cancelled = true;
      unlistens.forEach((u) => u());
    };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      a.play();
      setIsPlaying(true);
    }
  };

  // OS media controls (Windows SMTC / macOS Now Playing / Linux MPRIS + keyboard media keys)
  // emit a `media-control` event from Rust; drive the player from it. Subscribe once and read
  // the latest handlers through a ref so we don't re-bind the listener on every render.
  const mediaCtlRef = useRef({});
  mediaCtlRef.current = { togglePlay, getAdjacentTrack, setTrack, setIsPlaying };
  useEffect(() => {
    let unlisten;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("media-control", (e) => {
        const { action, position } = e.payload || {};
        const h = mediaCtlRef.current;
        const a = audioRef.current;
        switch (action) {
          case "play":
            if (a && a.paused) {
              a.play();
              h.setIsPlaying(true);
            }
            break;
          case "pause":
            if (a && !a.paused) {
              a.pause();
              h.setIsPlaying(false);
            }
            break;
          case "toggle":
            h.togglePlay();
            break;
          case "next": {
            const tk = h.getAdjacentTrack("next");
            if (tk) h.setTrack(tk);
            break;
          }
          case "previous": {
            const tk = h.getAdjacentTrack("prev");
            if (tk) h.setTrack(tk);
            break;
          }
          case "stop":
            if (a) {
              a.pause();
              h.setIsPlaying(false);
            }
            break;
          case "seek":
            if (a && typeof position === "number") a.currentTime = position;
            break;
          default:
            break;
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // LAN remote bridge: while enabled, push now-playing state to the backend and drain
  // commands the phone enqueued — executed through the same playback controls as media keys.
  const runPlaybackAction = (action) => {
    const h = mediaCtlRef.current;
    if (action === "playpause") h.togglePlay();
    else if (action === "next") {
      const tk = h.getAdjacentTrack("next");
      if (tk) h.setTrack(tk);
    } else if (action === "prev") {
      const tk = h.getAdjacentTrack("prev");
      if (tk) h.setTrack(tk);
    } else if (action === "shuffle") setShuffle((s) => !s);
    else if (action === "repeat") cycleRepeat();
  };
  const remoteNpRef = useRef({});
  remoteNpRef.current = { track, isPlaying, progress, duration, shuffle, repeat };
  useEffect(() => {
    if (!remoteEnabled) return;
    // One combined request per tick (push state + receive pending commands) instead of two
    // separate polling loops — keeps background activity (and its GC churn) low.
    const sync = () => {
      const {
        track: t,
        isPlaying: p,
        progress: pos,
        duration: dur,
        shuffle: sh,
        repeat: rp,
      } = remoteNpRef.current;
      const artists = Array.isArray(t?.artists)
        ? t.artists
            .map((a) => (a && a.name) || a)
            .filter(Boolean)
            .join(", ")
        : t?.artists || "";
      fetch(`${API}/remote/_sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            title: t?.title || "",
            artists,
            thumbnail: t?.thumbnail || "",
            isPlaying: !!p,
            position: Math.floor(pos || 0),
            duration: Math.floor(dur || 0),
            hasTrack: !!t,
            shuffle: !!sh,
            repeat: rp || "none",
          },
        }),
      })
        .then((r) => r.json())
        .then((d) => (d.commands || []).forEach(runPlaybackAction))
        .catch(() => {});
    };
    sync();
    const iv = setInterval(sync, 1000);
    return () => {
      clearInterval(iv);
    };
  }, [remoteEnabled]);

  // Big Picture bridge: expose playback commands (re-registered each render so they close over
  // current state) + push a formatted now-playing snapshot to the in-process store.
  useEffect(() => {
    bpRegisterCommands({
      action: runPlaybackAction,
      seek: (sec) => {
        const a = audioRef.current;
        if (a) a.currentTime = Math.max(0, sec);
      },
    });
    bpRegisterAudio(audioRef.current); // hand the IpcAudio clock to Big Picture's lyrics view
  });
  useEffect(() => {
    const tr = track;
    const artists = Array.isArray(tr?.artists)
      ? tr.artists
          .map((a) => (a && a.name) || a)
          .filter(Boolean)
          .join(", ")
      : tr?.artists || "";
    bpSetNowPlaying({
      title: tr?.title || "",
      artists,
      thumbnail: tr?.thumbnail || "",
      isPlaying: !!isPlaying,
      position: Math.floor(progress || 0),
      duration: Math.floor(duration || 0),
      hasTrack: !!tr,
      shuffle: !!shuffle,
      repeat: repeat || "none",
      track: tr || null, // raw track object so Big Picture's lyrics view can fetch for it
    });
  }, [track, isPlaying, progress, duration, shuffle, repeat]);

  // Seek drag state for the HeroUI seek slider (seconds while dragging, else null).
  const [seekDrag, setSeekDrag] = useState(null);

  const toggleLike = async () => {
    if (!track) return;
    const newRating = isLiked ? "INDIFFERENT" : "LIKE";
    setIsLiked(!isLiked);
    if (!isLiked) {
      setLikePulsing(true);
      setTimeout(() => setLikePulsing(false), 450);
    }
    try {
      await fetch(`${API}/like/${track.videoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: newRating,
          title: track.title || "",
          artists: track.artists || "",
          album: track.album || "",
          thumbnail: track.thumbnail || "",
          duration: track.duration || "",
        }),
      });
      // Last.fm Loved sync (backend no-ops if not connected)
      const lfArtist = (track.artists || "").replace(/\s*-\s*Topic$/i, "").trim();
      const lfTitle = (track.title || "").trim();
      if (lfArtist && lfTitle) {
        fetch(`${API}/lastfm/${newRating === "LIKE" ? "love" : "unlove"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist: lfArtist, track: lfTitle }),
        }).catch(() => {});
      }
    } catch {
      setIsLiked(isLiked); // revert on error
    }
  };

  const cycleRepeat = () => {
    setRepeat((r) => (r === "none" ? "all" : r === "all" ? "one" : "none"));
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60),
      sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const anim = useAnimations();

  return (
    <PlayerControls
      {...{
        anim,
        audioRef,
        buildShareLink,
        cachedSongIds,
        currentLyricsSource,
        cycleRepeat,
        downloadingIds,
        duration,
        expanded,
        failedLyricsProviders,
        fetchMoreBrowseIds,
        fetchedBrowseIds,
        fmt,
        formatSleepRemaining,
        fullscreen,
        getAdjacentTrack,
        isCustomLyrics,
        isLiked,
        isPlaying,
        language,
        likePulsing,
        loading,
        lyricsProviders,
        lyricsTranslationLang,
        nextBouncing,
        onAddToPlaylist,
        onDownloadSong,
        onExpandToggle,
        onExportSong,
        onImportLyrics,
        onOpenAlbum,
        onOpenArtist,
        onRefetchLyrics,
        onRemoveCustomLyrics,
        onSetLyricsTranslationLang,
        onSwitchLyricsProvider,
        onToggleFullscreen,
        onToggleLyrics,
        onToggleLyricsTranslation,
        onToggleQueue,
        prevBouncing,
        prevVolumeRef,
        progress,
        queueOpen,
        repeat,
        seekDrag,
        setNextBouncing,
        setPrevBouncing,
        setSeekDrag,
        setShuffle,
        setSleepTimerEnd,
        setTrack,
        setVolume,
        showLyrics,
        showLyricsTranslation,
        shuffle,
        sleepRemaining,
        sleepTimerEnd,
        t,
        toggleLike,
        togglePlay,
        track,
        volCurve,
        volume,
      }}
    />
  );
}
