// A menu as a sheet from the bottom, for the compact layout. Items with `sub` open their list
// in the same sheet (with a way back) instead of a second menu beside it: at phone width a
// submenu that opens on hover had nowhere to go and no way back to the main list.
//
// items: [{ id, label, icon, onPress, sub: items, danger, disabled, checked, hint, divider,
//          keepOpen, custom }]
// `divider: true` starts a new group above the item. Pressing an item without `sub` runs it
// and closes the sheet, unless `keepOpen` (a toggle you may want to flip and see). `custom` is
// a node drawn as the row instead of a button (a stepper, say).
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLang, useZoom } from "../context.jsx";
import { CaretLeft, CaretRight, Check } from "../icons.jsx";

export function ActionSheet({ open, onClose, items, title }) {
  const t = useLang();
  const zoom = useZoom();
  const [stack, setStack] = useState([]); // the sub-lists walked into, as { title, items }
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { if (open) { setStack([]); setLeaving(false); } }, [open]);
  // Pull it down by the grabber to close it, as with the queue: past 90px, or flicked.
  const panelRef = useRef(null);
  const drag = useRef(null);
  const onGrabDown = (e) => {
    if (!panelRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    panelRef.current.style.animation = "none";
    panelRef.current.style.transition = "none";
  };
  const onGrabMove = (e) => {
    const d = drag.current;
    if (!d || !panelRef.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    panelRef.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onGrabUp = () => {
    const d = drag.current;
    const el = panelRef.current;
    drag.current = null;
    if (!d || !el) return;
    const fast = d.dy > 30 && d.dy / Math.max(1, performance.now() - d.t0) > 0.6;
    el.style.transition = "transform 0.22s cubic-bezier(0.22,1,0.36,1)";
    if (d.dy > 90 || fast) {
      el.style.transform = "translateY(110%)";
      setTimeout(() => onClose?.(), 200);
    } else {
      el.style.transform = "";
    }
  };
  // Slides down first, then tells the owner it is closed.
  const close = () => { setLeaving(true); setTimeout(() => { setLeaving(false); onClose?.(); }, 180); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const page = stack[stack.length - 1];
  const list = page ? page.items : items;

  const row = (it) => it.custom ? <div key={it.id} style={{ padding: "4px 16px" }}>{it.custom}</div> : (
    <button key={it.id} type="button" disabled={it.disabled}
      onClick={() => {
        if (it.sub) { setStack((s) => [...s, { title: it.label, items: it.sub }]); return; }
        it.onPress?.();
        if (!it.keepOpen) close();
      }}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 46, padding: "0 16px",
        border: 0, background: "transparent", cursor: "default", borderRadius: "var(--r-lg)",
        fontFamily: "var(--font)", fontSize: "var(--t14)", textAlign: "start",
        color: it.danger ? "var(--status-danger)" : it.checked ? "var(--accent)" : "var(--text-primary)",
        opacity: it.disabled ? 0.45 : 1,
      }}
      className="hover:bg-hover"
    >
      {it.icon && <span style={{ width: 18, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{it.icon}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
      {it.hint && <span style={{ fontSize: "var(--t12)", color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{it.hint}</span>}
      {it.checked && <Check size={14} style={{ flexShrink: 0 }} />}
      {it.sub && <CaretRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
    </button>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100500, zoom }} onClick={close}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: leaving ? "fadeOut 0.18s ease forwards" : "fadeIn 0.2s ease" }} />
      <div ref={panelRef} role="menu" aria-label={page?.title || title} onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", left: 8, right: 8, bottom: 8, maxHeight: "74%", display: "flex", flexDirection: "column",
          background: "var(--overlay)", borderRadius: 24, boxShadow: "0 -10px 48px rgba(0,0,0,0.55)", overflow: "hidden",
          animation: leaving ? "sheetUp 0.18s ease-in reverse forwards" : "sheetUp 0.26s cubic-bezier(0.22,1,0.36,1)",
        }}>
        <div className="touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}
          style={{ height: 26, flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--fill-strong)" }} />
        </div>
        {page && (
          <button type="button" onClick={() => setStack((s) => s.slice(0, -1))}
            style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 16px", border: 0, background: "transparent",
              cursor: "default", fontFamily: "var(--font)", fontSize: "var(--t14)", fontWeight: 700, color: "var(--text-primary)", flexShrink: 0 }}>
            <CaretLeft size={14} />{page.title}
            <span className="sr-only">{t("back")}</span>
          </button>
        )}
        <div className="scrollable" style={{ overflowY: "auto", padding: "0 6px 8px" }}>
          {list.map((it) => (
            <div key={it.id}>
              {it.divider && <div style={{ height: 1, background: "var(--border)", margin: "6px 10px" }} />}
              {row(it)}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
