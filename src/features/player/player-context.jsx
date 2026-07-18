/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";

// Player context (Step 11): split state vs. actions so a pure-actions consumer (e.g. a play
// button in a track row) does not re-render on every progress/track/queue change. Both are backed
// by the single usePlayerController instance in App — this only distributes it without prop
// drilling. `track` mirrors the controller's `currentTrack`; `setTrack` mirrors `setCurrentTrack`.
const PlayerStateContext = createContext(null);
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
    crossfade,
    crossfadeOverrides,
    playbackProgressive,
    setCrossfadeOverride,
    removeCrossfadeOverride,
  } = controller;

  const state = useMemo(
    () => ({
      track: currentTrack,
      isPlaying,
      queue,
      audioRef,
      queueRef,
      crossfade,
      crossfadeOverrides,
      playbackProgressive,
    }),
    [currentTrack, isPlaying, queue, audioRef, queueRef, crossfade, crossfadeOverrides, playbackProgressive]
  );
  const actions = useMemo(
    () => ({
      setTrack: setCurrentTrack,
      setIsPlaying,
      setQueue,
      handlePlay,
      enqueue,
      startSongRadio,
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
      setCrossfadeOverride,
      removeCrossfadeOverride,
    ]
  );

  return (
    <PlayerStateContext.Provider value={state}>
      <PlayerActionsContext.Provider value={actions}>{children}</PlayerActionsContext.Provider>
    </PlayerStateContext.Provider>
  );
}

export const usePlayerState = () => useRequired(PlayerStateContext, "usePlayerState");
export const usePlayerActions = () => useRequired(PlayerActionsContext, "usePlayerActions");
