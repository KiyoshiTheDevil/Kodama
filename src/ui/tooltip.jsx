// Hover tooltip (delayed show, portalled to <body>). Extracted from App.jsx.
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useZoom } from "../context.jsx";

export function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, below: false });
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const zoom = useZoom();
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
        // Above by default, below when there is not enough room — a control in a 52px window
        // header would otherwise put its tooltip off the top edge, where the window simply
        // clips it away. 44px covers the tooltip's own height plus its offset.
        const below = r.top < 44;
        setPos({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below });
        clearTimeout(showTimer.current);
        showTimer.current = setTimeout(() => setVisible(true), 350);
      }}
      onMouseLeave={hide}
    >
      {children}
      {visible && createPortal(
        // Positioned in real (already-zoomed) screen pixels from getBoundingClientRect, portalled
        // to plain <body> — matches react-aria's own assumption that overlays live in an unzoomed
        // context, so position math here stays untouched by the app's UI zoom. `zoom` goes on the
        // INNER content div only: putting it on this outer positioned element too would scale its
        // own left/top a second time (verified — an element's own `zoom` multiplies its own
        // offset, not just its content), throwing the tooltip off far from its anchor at any zoom
        // other than 100%.
        <div style={{
          position: "fixed", left: pos.x, top: pos.y + (pos.below ? 6 : -6),
          transform: `translate(-50%, ${pos.below ? "0" : "-100%"})`,
          pointerEvents: "none", zIndex: 99999,
          animation: `${leaving ? "tooltipOut" : "tooltipIn"}${pos.below ? "Below" : ""} 0.12s ease forwards`,
        }}>
          <div style={{
            zoom,
            background: "var(--bg-elevated)", color: "var(--text-primary)",
            padding: "5px 9px", borderRadius: "var(--r-md)",
            fontSize: "var(--t11)", fontWeight: 500,
            border: "0.5px solid var(--border)",
            whiteSpace: "nowrap",
            boxShadow: "var(--elevation-2)",
          }}>{text}</div>
        </div>,
        document.body
      )}
    </span>
  );
}
