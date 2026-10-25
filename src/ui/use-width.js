// An element's own width, kept current: for views that lay themselves out by the room they
// get (the compact layout, small windows, high zoom) rather than by the window's width.
// Returns [ref, width]; the ref is a callback ref, so it measures whenever the element mounts.
import { useState, useRef, useCallback } from "react";

export function useWidth(initial = 1200) {
  const [width, setWidth] = useState(initial);
  const ro = useRef(null);
  const ref = useCallback((el) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.current.observe(el);
  }, []);
  return [ref, width];
}
