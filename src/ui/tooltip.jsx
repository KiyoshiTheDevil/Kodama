// Hover tooltip (delayed show, portalled). Extracted from App.jsx.
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useZoom, usePortalRoot } from "../context.jsx";

export function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const zoom = useZoom();
  const portalRootRef = usePortalRoot();
  if (!text) return children;

  const hide = () => {
    clearTimeout(showTimer.current);
    if (visible) {
      setLeaving(true);
      hideTimer.current = setTimeout(() => { setVisible(false); setLeaving(false); }, 120);
    }
  };

  return (
    <span style={{ display: "contents" }}
      onMouseEnter={e => {
        clearTimeout(hideTimer.current);
        setLeaving(false);
        const el = e.currentTarget.firstElementChild || e.target;
        const r = el.getBoundingClientRect();
        setPos({ x: r.left + r.width / 2, y: r.top });
        clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setVisible(true), 350);
      }}
      onMouseLeave={hide}
    >
      {children}
      {visible && createPortal(
        <div style={{
          position: "fixed",
          // getBoundingClientRect() above returns real (already-zoomed) screen pixels, but this
          // portals into the zoomed app root (see App.jsx's PortalRootContext), so its own
          // local coordinate system is scaled by `zoom` again — divide back down to local
          // units, same convention as ContextMenu's anchor positioning.
          left: pos.x / zoom, top: (pos.y - 6) / zoom,
          transform: "translate(-50%, -100%)",
          background: "var(--bg-elevated)", color: "var(--text-primary)",
          padding: "5px 9px", borderRadius: 6,
          fontSize: "var(--t11)", fontWeight: 500,
          pointerEvents: "none", zIndex: 99999,
          border: "0.5px solid var(--border)",
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          animation: `${leaving ? "tooltipOut" : "tooltipIn"} 0.12s ease forwards`,
        }}>{text}</div>,
        portalRootRef?.current || document.body
      )}
    </span>
  );
}
