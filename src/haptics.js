// Short buzzes on Android, through the system's own haptics (MediaBridge.haptic), so they follow
// the phone's touch-feedback setting. Nothing anywhere else.
//
// Kinds: "tap" (a button that does something right away), "tick" (switching between places),
// "toggle-on" / "toggle-off", "long-press", "drag-start", "gesture-end" (a drag let go),
// "confirm", "reject".

export function haptic(kind = "tap") {
  try { window.KodamaAndroid?.haptic?.(kind); } catch { /* the bridge is gone, nothing to feel */ }
}

// A press handler that buzzes first.
export function withHaptic(fn, kind = "tap") {
  return fn ? (...args) => { haptic(kind); return fn(...args); } : fn;
}
