// Per-song lyric timing correction, shared by the lyrics view and the video-sync captions.
// Both render the same lyrics through separate code paths, so the correction has to live
// outside either of them — otherwise adjusting it in one view would do nothing in the other.
import { useState, useRef, useEffect, useCallback } from "react";

// 0.1s: fine enough to actually land on the beat. A full second is ten clicks, which is
// acceptable — corrections are usually a couple of tenths, not seconds.
export const OFFSET_STEP = 0.1;

// All offsets in one entry, so a large library doesn't scatter hundreds of localStorage keys.
// Bounded: the oldest corrections drop out past the cap, since an offset for a song you no
// longer play costs nothing to lose.
const OFFSETS_KEY = "kodama-lyrics-offsets";
const OFFSETS_MAX = 400;

export function readOffsets() {
  try {
    const o = JSON.parse(localStorage.getItem(OFFSETS_KEY) || "{}");
    return (o && typeof o === "object") ? o : {};
  } catch { return {}; }
}

// Both views are mounted at the same time — the lyrics pane stays in the tree while a
// video is on screen, only its pointer events change. Without this, adjusting the
// offset in one view would leave the other holding a stale value (and a stale ref,
// which its rAF loop reads every frame) until the track changed.
const listeners = new Set();

export function writeOffset(videoId, seconds) {
  if (!videoId) return;
  try {
    const all = readOffsets();
    // Re-inserting keeps the key at the end, so the cap evicts genuinely stale entries.
    delete all[videoId];
    if (seconds) all[videoId] = seconds;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - OFFSETS_MAX))) delete all[k];
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(all));
  } catch {}
  listeners.forEach(fn => fn(videoId, seconds));
}

/**
 * The correction for one song. `ref` is for rAF loops, which must not close over state.
 * `adjust(null)` resets; the value is clamped, because past a few seconds the lyrics are not
 * merely out of sync — they are the wrong lyrics, and a slider into the void would hide that.
 */
export function useLyricOffset(videoId) {
  const [offset, setOffset] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    const v = readOffsets()[videoId] || 0;
    ref.current = v;   // set in the same tick: the rAF loop reads the ref, not the state
    setOffset(v);
  }, [videoId]);

  // Adopt changes made by the other view for the same song.
  useEffect(() => {
    const onChange = (id, value) => {
      if (id !== videoId || value === ref.current) return;
      ref.current = value;
      setOffset(value);
    };
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, [videoId]);

  // Reads and writes the ref rather than using a state updater, so repeated clicks in one tick
  // still accumulate and the persist stays out of the (pure) updater.
  const adjust = useCallback((delta) => {
    const next = delta === null ? 0
      : Math.round(Math.min(10, Math.max(-10, ref.current + delta)) * 100) / 100;
    ref.current = next;
    setOffset(next);
    writeOffset(videoId, next);
  }, [videoId]);

  return { offset, offsetRef: ref, adjustOffset: adjust };
}
