// A long-running job, reported in the corner instead of in the page.
//
// Loading a large playlist arrives in pages, and the count climbs for a while. That used to be
// a bar wedged between the header and the column titles, which pushed the table down and then
// pulled it back up when it finished - motion in the part of the screen you are trying to read.
//
// Built from HeroUI's own toast classes rather than styled to look like one: it sits beside
// real toasts, so anything hand-matched would drift the first time the theme moved. Only the
// placement is ours, since .toast expects to be laid out by the toast region and this one is
// not in it. Unlike a real toast it is not dismissed on a timer, because it is not an
// announcement - it is the state of something still happening, and it goes when that is done.
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
      className="toast animate-[pillRiseIn_0.26s_cubic-bezier(0.22,1,0.36,1)]"
      style={{
        // .toast is absolute and stretched by its region; this one places itself, level with
        // the toast stack (see ToastProvider in App.jsx) and clear of the player bar.
        position: "fixed", left: "auto", right: "auto",
        bottom: 120, insetInlineEnd: 24, zIndex: 99999,
        width: 280, pointerEvents: "none",
      }}
    >
      {/* .toast aligns to the top, which is right for a title over a description but not
          for a title over a bar - there the spinner reads as sitting too high. The
          content beside it already centres itself; this matches it. */}
      <div className="toast__indicator self-center"><Spinner size="sm" /></div>
      <div className="toast__content">
        <div className="flex items-center gap-2 w-full">
          <span className="toast__title truncate">{label}</span>
          {pct !== null && (
            <span className="toast__title ms-auto text-accent tabular-nums">{pct}%</span>
          )}
        </div>
        {pct !== null && (
          <div className="w-full mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg,var(--accent),#c020e0)",
                transition: "width 0.25s ease",
              }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
