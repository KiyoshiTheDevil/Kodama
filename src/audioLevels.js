// Shared real-time audio levels streamed from the Rust audio thread (`audio-levels`
// event, ~30fps). One listener feeds a mutable singleton; visualizer components read
// `audioLevels.bands` / `.level` inside their own rAF loop (no React re-renders).
export const audioLevels = {
  bands: new Array(48).fill(0),
  level: 0,
  ts: 0, // performance.now() of the last update — lets consumers detect staleness
};

let started = false;
export function startAudioLevels() {
  if (started) return;
  started = true;
  import("@tauri-apps/api/event")
    .then(({ listen }) => {
      listen("audio-levels", ({ payload }) => {
        if (payload && Array.isArray(payload.bands)) audioLevels.bands = payload.bands;
        audioLevels.level = (payload && payload.level) || 0;
        audioLevels.ts = performance.now();
      });
    })
    .catch(() => {});
}
