import { useState, useRef, useCallback } from "react";

// useState that mirrors its value into localStorage.
//
// Before this existed every preference was hand-rolled: a lazy useState reading
// localStorage, plus a matching setItem call in every handler that changed it —
// scattered across callbacks and even inline JSX props, which is how the same key
// ended up written in several places with slightly different encodings.
//
// The codec is inferred from the *shape of the default value*, so call sites stay
// one-liners and the stored encoding is consistent per key:
//   usePersistedState("k", "dark")  → string, stored as-is
//   usePersistedState("k", true)    → boolean, stored "true"/"false"
//   usePersistedState("k", 0.5)     → number, stored via String()/parseFloat()
//   usePersistedState("k", [])      → anything else, stored as JSON
//
// This matches the semantics the hand-rolled versions had: a `true` default
// reproduces `getItem(k) !== "false"`, a `false` default reproduces
// `getItem(k) === "true"`, and a numeric default reproduces the parseFloat/isNaN
// fallback dance.

function encode(v) {
  if (typeof v === "string") return v;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function decode(raw, fallback) {
  if (raw === null) return fallback;
  switch (typeof fallback) {
    case "string":  return raw;
    case "boolean": return raw === "true";
    case "number": {
      const n = parseFloat(raw);
      return Number.isNaN(n) ? fallback : n;
    }
    default:
      try { return JSON.parse(raw); } catch { return fallback; }
  }
}

export function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    // localStorage can throw (private mode, disabled storage) — fall back to the default.
    try { return decode(localStorage.getItem(key), defaultValue); }
    catch { return defaultValue; }
  });

  // Mirrors the current value so functional updates (setX(prev => ...)) resolve without
  // putting a side effect inside the state updater. Updated eagerly in `set` so several
  // functional updates within one tick still see each other.
  const valueRef = useRef(value);

  const set = useCallback((next) => {
    const resolved = typeof next === "function" ? next(valueRef.current) : next;
    valueRef.current = resolved;
    try { localStorage.setItem(key, encode(resolved)); } catch {}
    setValue(resolved);
  }, [key]);

  return [value, set];
}
