// What runs in the background and wants the title bar's pill on a phone (the logo's place):
// a long job reports itself here (ProgressToast does, in the compact layout) and App's title bar
// shows the newest one. Offline and downloads have their own pills and come first.
import { useSyncExternalStore } from "react";

let items = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());

/** Report a job ({ label, percent }), or end it with null. */
export function setIslandItem(id, item) {
  const rest = items.filter((x) => x.id !== id);
  items = item ? [...rest, { id, ...item }] : rest;
  emit();
}

export function useIslandItems() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => items);
}
