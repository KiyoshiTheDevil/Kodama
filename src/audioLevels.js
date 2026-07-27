// Shared real-time audio levels streamed from the Rust audio thread (`audio-levels`
// event, ~30fps). One listener feeds a mutable singleton; visualizer components read
// `audioLevels.bands` / `.level` inside their own rAF loop (no React re-renders).
export const audioLevels = {
  bands: new Array(48).fill(0),
  level: 0,
  ts: 0, // performance.now() of the last update — lets consumers detect staleness
};

// The guard lives on globalThis, not in module scope: Vite re-evaluates this module on hot
// reload, which would reset a plain `let` and register a second listener for an event that
// fires ~30x a second — one more per reload, all writing to the same singleton.
export function startAudioLevels() {
  if (globalThis.__kodamaAudioLevels) return;
  globalThis.__kodamaAudioLevels = true;
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
