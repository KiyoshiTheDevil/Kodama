// The player's state and commands, in-process, for code in the main window that is not the Player.
//
// The Player pushes a formatted now-playing snapshot and registers the handlers; the background
// extensions (extensions/background.jsx) read the one and call the other. The mini player is a
// window of its own and cannot reach this; it has miniplayer/bridge.js.

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
/** Fires on every progress tick, so a subscriber decides what is news. */
export function subscribeNowPlaying(l) { _listeners.add(l); return () => _listeners.delete(l); }
export function getNowPlaying() { return _state; }

let _action = null;
export function registerPlayerAction(fn) { _action = fn; }
export function sendPlayerCommand(action) { _action && _action(action); }

// The real playback clock is the IpcAudio shim (currentTime/paused + timeupdate events), not a
// DOM <audio> element.
let _audio = null;
export function registerAudio(a) { _audio = a; }
export function getAudio() { return _audio; }
