import { useEffect, useRef } from "react";
import { ArrowClockwise } from "../icons.jsx";
import { haptic } from "../haptics.js";

// Pull down at the top of the content to reload it, as on a phone: the title bar's Refresh button
// has no room there. A round badge follows the finger down from under the title bar; past the
// threshold it turns to the accent and buzzes once, and letting go there reloads. The badge is
// moved by hand, not through state, so the pull costs no React render per touch move.
const THRESHOLD = 72;
const MAX = 110;

export default function PullRefresh({ scrollRef, onRefresh, enabled, rootKey, top = 0 }) {
  const badgeRef = useRef(null);
  const iconRef = useRef(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    const badge = badgeRef.current;
    if (!enabled || !el || !badge) return;
    let startX = 0, startY = 0, pull = 0, armed = false, state = "idle"; // idle | maybe | pulling | busy

    const show = (d, animate) => {
      badge.style.transition = animate ? "transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.2s" : "none";
      badge.style.transform = `translate(-50%, ${d - 44}px) rotate(${d * 3}deg)`;
      badge.style.opacity = d > 4 ? String(Math.min(1, d / 40)) : "0";
    };
    const setArmed = (a) => {
      if (a === armed) return;
      armed = a;
      badge.dataset.armed = a ? "1" : "";
      if (a) haptic("tick");
    };
    const onStart = (e) => {
      if (state === "busy" || e.touches.length !== 1 || el.scrollTop > 0) { state = state === "busy" ? "busy" : "idle"; return; }
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; state = "maybe";
    };
    const onMove = (e) => {
      if (state !== "maybe" && state !== "pulling") return;
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
      if (state === "maybe") {
        // A sideways swipe (a shelf, a card) or a scroll up is not a pull.
        if (Math.abs(dx) > 10 && Math.abs(dx) > dy) { state = "idle"; return; }
        if (dy < -4 || el.scrollTop > 0) { state = "idle"; return; }
        if (dy < 10) return;
        state = "pulling";
      }
      // The finger travels further than the badge does, which reads as a rubber band.
      pull = Math.min(MAX, Math.max(0, dy - 10) * 0.5);
      show(pull, false);
      setArmed(pull >= THRESHOLD);
    };
    const onEnd = () => {
      if (state !== "pulling") { if (state === "maybe") state = "idle"; return; }
      if (armed) {
        state = "busy";
        show(THRESHOLD - 8, true);
        iconRef.current?.classList.add("pull-refresh-spin");
        refreshRef.current?.();
        // Long enough to see that something happened, also when the view comes from the cache.
        setTimeout(() => {
          iconRef.current?.classList.remove("pull-refresh-spin");
          setArmed(false);
          show(0, true);
          state = "idle";
        }, 900);
      } else {
        state = "idle";
        show(0, true);
      }
    };
    const opts = { passive: true };
    el.addEventListener("touchstart", onStart, opts);
    el.addEventListener("touchmove", onMove, opts);
    el.addEventListener("touchend", onEnd, opts);
    el.addEventListener("touchcancel", onEnd, opts);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, scrollRef, rootKey]);

  if (!enabled) return null;
  return (
    <div ref={badgeRef} className="pull-refresh" aria-hidden="true"
      style={{ top, transform: "translate(-50%, -44px)", opacity: 0 }}>
      <span ref={iconRef} style={{ display: "flex" }}><ArrowClockwise size={18} /></span>
    </div>
  );
}
