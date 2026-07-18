/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";

// Player context (Step 11): split into narrow state contexts plus one actions context, so a
// consumer that only needs (say) the playing track for row highlighting does not re-render on
// queue reorders or a crossfade-slider drag. All are backed by the single usePlayerController
// instance in App — this only distributes it without prop drilling. `track` mirrors the
// controller's `currentTrack`; `setTrack` mirrors `setCurrentTrack`.
const PlaybackStatusContext = createContext(null);
const QueueStateContext = createContext(null);
const PlaybackConfigContext = createContext(null);
const PlayerActionsContext = createContext(null);

function useRequired(context, name) {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used within a PlayerProvider`);
  return value;
}

export function PlayerProvider({ controller, children }) {
  const {
    audioRef,
    currentTrack,
    isPlaying,
    queue,
    queueRef,
    setCurrentTrack,
    setIsPlaying,
    setQueue,
    handlePlay,
    enqueue,
    startSongRadio,
    autoplay,
    setAutoplay,
    crossfade,
    setCrossfade,
    crossfadeOverrides,
    playbackProgressive,
    setPlaybackProgressive,
    setCrossfadeOverride,
    removeCrossfadeOverride,
  } = controller;

  // Playback state: the currently playing track, its playing flag, and the audio element ref.
  const playbackStatus = useMemo(
    () => ({ track: currentTrack, isPlaying, audioRef }),
    [currentTrack, isPlaying, audioRef]
  );
  // Queue state: the queue itself and its stale-closure-safe ref.
  const queueState = useMemo(() => ({ queue, queueRef }), [queue, queueRef]);
  // Playback configuration: autoplay, crossfade (+ per-transition overrides), progressive mode.
  const playbackConfig = useMemo(
    () => ({ autoplay, crossfade, crossfadeOverrides, playbackProgressive }),
    [autoplay, crossfade, crossfadeOverrides, playbackProgressive]
  );
  // Transport, queue, and configuration actions in one stable object.
  const actions = useMemo(
    () => ({
      setTrack: setCurrentTrack,
      setIsPlaying,
      setQueue,
      handlePlay,
      enqueue,
      startSongRadio,
      setAutoplay,
      setCrossfade,
      setPlaybackProgressive,
      setCrossfadeOverride,
      removeCrossfadeOverride,
    }),
    [
      setCurrentTrack,
      setIsPlaying,
      setQueue,
      handlePlay,
      enqueue,
      startSongRadio,
      setAutoplay,
      setCrossfade,
      setPlaybackProgressive,
      setCrossfadeOverride,
      removeCrossfadeOverride,
    ]
  );

  return (
    <PlaybackStatusContext.Provider value={playbackStatus}>
      <QueueStateContext.Provider value={queueState}>
        <PlaybackConfigContext.Provider value={playbackConfig}>
          <PlayerActionsContext.Provider value={actions}>{children}</PlayerActionsContext.Provider>
        </PlaybackConfigContext.Provider>
      </QueueStateContext.Provider>
    </PlaybackStatusContext.Provider>
  );
}

export const usePlaybackStatus = () => useRequired(PlaybackStatusContext, "usePlaybackStatus");
export const useQueueState = () => useRequired(QueueStateContext, "useQueueState");
export const usePlaybackConfig = () => useRequired(PlaybackConfigContext, "usePlaybackConfig");
export const usePlayerActions = () => useRequired(PlayerActionsContext, "usePlayerActions");
