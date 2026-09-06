// A long-running job, reported in the corner instead of in the page.
//
// Loading a large playlist arrives in pages, and the count climbs for a while. That used to be
// a bar wedged between the header and the column titles, which pushed the table down and then
// pulled it back up when it finished - motion in the part of the screen you are trying to read.
//
// So it sits with the toasts instead: same corner, same offset clear of the player bar. Unlike
// a real toast it is not dismissed on a timer, because it is not an announcement - it is the
// state of something still happening, and it goes when that is done.
import { createPortal } from "react-dom";
import { Spinner } from "@heroui/react";

/**
 * @param label   what is happening
 * @param percent 0-100, or null when the work has no measurable end
 */
export function ProgressToast({ label, percent }) {
  const pct = typeof percent === "number" ? Math.max(0, Math.min(100, percent)) : null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="animate-[pillRiseIn_0.26s_cubic-bezier(0.22,1,0.36,1)]"
      style={{
        // Level with the toast stack (see ToastProvider in App.jsx), and just under it: a real
        // announcement is worth covering this for the few seconds it lasts.
        position: "fixed", bottom: 120, insetInlineEnd: 24, zIndex: 99999,
        width: 260, padding: "12px 14px",
        background: "var(--bg-elevated)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--elevation-3)",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: pct === null ? 0 : 9 }}>
        <Spinner size="sm" />
        <span style={{ fontSize: "var(--t12)", color: "var(--text-secondary)", flex: 1, minWidth: 0 }}
          className="truncate">{label}</span>
        {pct !== null && (
          <span style={{ fontSize: "var(--t12)", color: "var(--accent)", fontWeight: 600 }}>{pct}%</span>
        )}
      </div>
      {pct !== null && (
        <div style={{ height: 3, background: "var(--bg-base)", borderRadius: "var(--r-full)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: "var(--r-full)",
            background: "linear-gradient(90deg,var(--accent),#c020e0)",
            transition: "width 0.25s ease",
          }} />
        </div>
      )}
    </div>,
    document.body
  );
}
