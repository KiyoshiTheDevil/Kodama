import { QueuePanel } from "@/features/player/player-ui.jsx";

// Sliding queue panel docked to the right edge, with its ambient-blur background and the
// left-edge resize handle. Extracted verbatim from AppShell.jsx (Step 13c).
export function QueueDock({
  fullscreen,
  queueWidth,
  queueOpen,
  queueSettled,
  ambientBackground,
  queueResizing,
  animations,
  startQueueResize,
  setQueueOpen,
  likedIds,
  handleToggleLike,
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: fullscreen ? 0 : 8,
        right: fullscreen ? 0 : 8,
        width: fullscreen ? 360 : queueWidth,
        bottom: fullscreen ? 0 : 112,
        zIndex: fullscreen ? 104 : 101,
        transform: queueOpen
          ? queueSettled
            ? "none"
            : "translateX(0)"
          : "translateX(calc(100% + 16px))",
        willChange: queueOpen && queueSettled ? "auto" : "transform",
        background: ambientBackground
          ? queueSettled
            ? "rgba(18,18,18,0.5)"
            : "rgba(18,18,18,0.92)"
          : "var(--bg-surface)",
        backdropFilter: ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
        WebkitBackdropFilter:
          ambientBackground && queueSettled ? "blur(32px) saturate(1.4)" : "none",
        border: ambientBackground ? "0.5px solid rgba(255,255,255,0.08)" : "none",
        borderRadius: fullscreen ? 0 : "var(--r-xl)",
        overflow: "hidden",
        transition: queueResizing
          ? "none"
          : animations
            ? "transform 0.3s cubic-bezier(0.4,0,0.2,1), background 0.25s ease"
            : "transform 0.1s ease",
        display: "flex",
        flexDirection: "column",
        pointerEvents: queueOpen ? "all" : "none",
      }}
    >
      {/* Drag handle to resize the panel (mirrors the sidebar handle) */}
      {!fullscreen && queueOpen && (
        <div
          onMouseDown={startQueueResize}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 8,
            cursor: "ew-resize",
            zIndex: 50,
          }}
          onMouseEnter={(e) => {
            const bar = e.currentTarget.firstChild;
            if (bar) bar.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const bar = e.currentTarget.firstChild;
            if (bar) bar.style.opacity = queueResizing ? "1" : "0";
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 1,
              transform: "translateY(-50%)",
              width: 3,
              height: 44,
              borderRadius: 2,
              background: "var(--accent)",
              opacity: queueResizing ? 1 : 0,
              transition: "opacity 0.15s",
              pointerEvents: "none",
            }}
          />
        </div>
      )}
      <QueuePanel
        onClose={() => setQueueOpen(false)}
        likedIds={likedIds}
        onToggleLike={handleToggleLike}
        visible={queueOpen}
      />
    </div>
  );
}
