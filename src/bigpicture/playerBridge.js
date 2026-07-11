// In-process bridge between the Player (which lives in the App tree) and the separate Big Picture
// root. The Player pushes a formatted now-playing snapshot + registers command handlers; Big
// Picture reads the state via useNowPlaying() and drives playback via the send* helpers. Same
// single audio engine, two UIs — no HTTP, no duplication.
import { useSyncExternalStore } from "react";

let _state = {
  title: "", artists: "", thumbnail: "",
  isPlaying: false, position: 0, duration: 0, hasTrack: false,
  shuffle: false, repeat: "none", track: null,
};
const _listeners = new Set();

export function setNowPlaying(s) {
  let changed = false;
  for (const k in s) { if (_state[k] !== s[k]) { changed = true; break; } }
  if (!changed) return;
  _state = s;
  _listeners.forEach(l => l());
}
function subscribe(l) { _listeners.add(l); return () => _listeners.delete(l); }
function getSnapshot() { return _state; }
export function useNowPlaying() { return useSyncExternalStore(subscribe, getSnapshot); }

// Handlers are registered from two places (the Player owns transport/seek; App owns play), so
// registration MERGES instead of replacing. Big Picture invokes them via the send* helpers.
let _handlers = { action: null, seek: null, play: null, enqueue: null };
export function registerPlayerCommands(h) { _handlers = { ..._handlers, ...h }; }

// The real playback clock is the IpcAudio shim (currentTime/paused + timeupdate events), not a
// DOM <audio> element. The Player registers it here so Big Picture's lyrics view can hand it to
// the shared LyricsOverlay engine as its audioRef.
let _audio = null;
export function registerAudio(a) { _audio = a; }
export function getAudio() { return _audio; }
export function sendPlayerCommand(action) { _handlers.action && _handlers.action(action); }
export function sendSeek(seconds) { _handlers.seek && _handlers.seek(seconds); }
export function sendPlay(track, trackList) { _handlers.play && _handlers.play(track, trackList); }
export function sendEnqueue(track, mode) { _handlers.enqueue && _handlers.enqueue(track, mode); } // mode: "next" | "end"
