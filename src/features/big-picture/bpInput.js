// Tracks the last-used input device so the keybind bar can show the matching glyphs (controller
// buttons vs. keyboard caps). Controller callbacks set "pad"; real keydowns set "key" (synthetic
// key events dispatched by the controller path are tagged bpSynthetic and ignored here).
import { useSyncExternalStore } from "react";

let _mode = "key"; // "pad" | "key"
const listeners = new Set();

export function setInputMode(m) {
  if (m !== _mode) {
    _mode = m;
    listeners.forEach((l) => l());
  }
}
export function getInputMode() {
  return _mode;
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useInputMode() {
  return useSyncExternalStore(subscribe, getInputMode);
}
