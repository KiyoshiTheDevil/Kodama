// A menu as a sheet from the bottom, for the compact layout: the whole width, flush with the
// bottom edge. Items with `sub` open their list in the same sheet instead of a second menu
// beside it: at phone width a submenu that opens on hover had nowhere to go. The list it came
// from folds into a pill above the sheet ("<- Sleep timer"), which is also the way back: the
// sheet visibly shrinks into that pill while the sub-list rises below it, and Back grows the
// pill out into the sheet again (morph(), below).
//
// items: [{ id, label, icon, onPress, sub: items, danger, disabled, checked, hint, divider,
//          keepOpen, custom, flush }]
// `divider: true` starts a new group above the item. Pressing an item without `sub` runs it
// and closes the sheet, unless `keepOpen` (a toggle you may want to flip and see). `custom` is
// a node drawn as the row instead of a button (a stepper, say); `flush` lets it run edge to edge.
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLang, useZoom, useAnimations } from "../context.jsx";
import { ArrowLeft, CaretRight, Check } from "../icons.jsx";
import { haptic } from "../haptics.js";

export function ActionSheet({ open, onClose, items, title }) {
  const t = useLang();
  const zoom = useZoom();
  const animations = useAnimations();
  // The sub-lists walked into, by item id. Looked up in the current items on every render, so a
  // page shows what its owner shows now (the sleep timer's time left), not what it was.
  const [stack, setStack] = useState([]);
  const [leaving, setLeaving] = useState(false);
  const [pressed, setPressed] = useState(null);
  useEffect(() => { if (open) { setStack([]); setLeaving(false); setPressed(null); } }, [open]);
  // Pull it down by the grabber to close it, as with the queue: past 90px, or flicked. The pill
  // above the sheet goes along, so the whole stack moves.
  const panelRef = useRef(null);
  const menuRef = useRef(null);
  const crumbRef = useRef(null);
  const morphRef = useRef(null); // what the step in or out measured before the lists changed
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
  // Measured before the lists change; morph() runs once the new one is laid out. Offsets, not
  // getBoundingClientRect: the sheet sits inside the UI zoom, and offsets stay in its own pixels.
  const snapshot = (type) => {
    const wrap = panelRef.current, menu = menuRef.current, crumb = crumbRef.current;
    if (!animations || !wrap || !menu) { morphRef.current = null; return; }
    const clone = menu.cloneNode(true);
    clone.removeAttribute("role");
    clone.setAttribute("aria-hidden", "true");
    morphRef.current = {
      type, clone, height: menu.offsetHeight,
      // A copy starts scrolled to the top; the list it stands in for may not have been.
      scroll: menu.querySelector(".scrollable")?.scrollTop || 0,
      // The pill, from the bottom of the stack: the stack's height changes with the list.
      crumb: crumb && { fromBottom: wrap.offsetHeight - crumb.offsetTop, left: crumb.offsetLeft, width: crumb.offsetWidth, height: crumb.offsetHeight },
    };
  };
  const enter = (id) => { snapshot("in"); setStack((s) => [...s, id]); };
  const back = () => { haptic("tick"); snapshot("out"); setStack((s) => s.slice(0, -1)); };

  useLayoutEffect(() => {
    const m = morphRef.current;
    morphRef.current = null;
    const wrap = panelRef.current, menu = menuRef.current;
    if (!m || !wrap || !menu) return;
    const EASE = "cubic-bezier(0.32,0.72,0,1)";
    const DUR = 380;
    const W = wrap.offsetWidth;
    const clone = m.clone;
    // Only a plain surface changes shape: a clip-path animation repaints its element on every
    // frame, and with the whole list (and the sheet's shadow) inside, the web view fell behind
    // and left parts of the sheet blank for a frame, the player showing through. The lists
    // themselves only fade, which the compositor does without painting anything. Their content
    // only: a surface fading with it let the page behind show through the sheet.
    const fade = (el, frames, opts) => { for (const ch of el.children) ch.animate(frames, opts); };
    const ghost = document.createElement("div");
    Object.assign(ghost.style, { position: "absolute", left: "0", right: "0", bottom: "0", zIndex: "2", pointerEvents: "none",
      background: "var(--overlay)", borderRadius: "24px 24px 0 0", willChange: "clip-path" });
    Object.assign(clone.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: `${m.height}px`, pointerEvents: "none", boxShadow: "none" });
    const keepScroll = () => { const sc = clone.querySelector(".scrollable"); if (sc) sc.scrollTop = m.scroll; };
    const FULL = "inset(0px 0px 0px 0px round 24px 24px 0px 0px)";
    const pillBox = (H, top, left, width, height) => `inset(${top}px ${W - left - width}px ${H - top - height}px ${left}px round 22px)`;
    if (m.type === "in") {
      // The old sheet shrinks into the pill; its rows fade on top of it as it starts.
      const crumb = crumbRef.current;
      if (!crumb) return;
      const top = crumb.offsetTop - (wrap.offsetHeight - m.height);
      ghost.style.height = `${m.height}px`;
      clone.style.background = "transparent";
      clone.style.zIndex = "3";
      wrap.appendChild(ghost);
      wrap.appendChild(clone);
      keepScroll();
      ghost.animate([{ clipPath: FULL }, { clipPath: pillBox(m.height, top, crumb.offsetLeft, crumb.offsetWidth, crumb.offsetHeight) }], { duration: DUR, easing: EASE, fill: "forwards" });
      clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR * 0.35, fill: "forwards" });
      crumb.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: DUR });
      // The new list is there underneath from the start and fades in, so nothing but the
      // shrinking surface moves.
      fade(menu, [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: DUR * 0.8, easing: "ease-out" });
      setTimeout(() => { ghost.remove(); clone.remove(); }, DUR + 20);
    } else {
      // The surface grows from the pill over the old sub-list, which stays put underneath; the
      // list it came from fades in once the surface is nearly there.
      const c = m.crumb;
      const H = menu.offsetHeight;
      clone.style.zIndex = "1";
      ghost.style.height = `${H}px`;
      wrap.appendChild(clone);
      keepScroll();
      if (c) {
        const top = (wrap.offsetHeight - c.fromBottom) - menu.offsetTop;
        wrap.appendChild(ghost);
        ghost.animate([{ clipPath: pillBox(H, top, c.left, c.width, c.height) }, { clipPath: FULL }], { duration: DUR, easing: EASE, fill: "forwards" });
      }
      fade(clone, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR * 0.5, fill: "forwards" });
      // The list's own surface stays out of sight until the growing one has reached it.
      menu.style.position = "relative";
      menu.style.zIndex = "3";
      const bg = menu.style.background;
      if (c) menu.style.background = "transparent";
      fade(menu, [{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: DUR });
      setTimeout(() => { ghost.remove(); clone.remove(); menu.style.position = ""; menu.style.zIndex = ""; menu.style.background = bg; }, DUR + 20);
    }
  }, [stack]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      // Back steps out of a sub-list first, as the pill does.
      if (stack.length) back(); else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  let list = items;
  let page = null;
  for (const id of stack) {
    const it = list.find((x) => x.id === id);
    if (!it?.sub) break;
    page = it;
    list = it.sub;
  }

  // A pressed row stays lit until the sheet has gone: a tap is shorter than the slide down.
  const row = (it) => it.custom ? <div key={it.id} style={{ padding: it.flush ? "4px 0" : "4px 12px" }}>{it.custom}</div> : (
    <button key={it.id} type="button" disabled={it.disabled}
      onPointerDown={() => setPressed(it.id)}
      onPointerLeave={() => { if (!leaving) setPressed((p) => (p === it.id ? null : p)); }}
      onPointerCancel={() => setPressed(null)}
      onClick={() => {
        haptic(it.sub ? "tick" : "tap");
        if (it.sub) { setPressed(null); enter(it.id); return; }
        setPressed(it.id);
        it.onPress?.();
        if (!it.keepOpen) close(); else setTimeout(() => setPressed(null), 160);
      }}
      className="sheet-row"
      data-pressed={pressed === it.id ? "" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 50, padding: "0 20px",
        border: 0, cursor: "default",
        fontFamily: "var(--font)", fontSize: "var(--t14)", textAlign: "start",
        color: it.danger ? "var(--status-danger)" : it.checked ? "var(--accent)" : "var(--text-primary)",
        opacity: it.disabled ? 0.45 : 1,
      }}
    >
      {it.icon && <span style={{ width: 18, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>{it.icon}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
      {it.hint && <span style={{ fontSize: "var(--t12)", color: "var(--accent)", fontWeight: 600, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{it.hint}</span>}
      {it.checked && <Check size={14} style={{ flexShrink: 0 }} />}
      {it.sub && <CaretRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
    </button>
  );

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100500, zoom }} onClick={close}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", animation: leaving ? "fadeOut 0.18s ease forwards" : "fadeIn 0.2s ease" }} />
      <div ref={panelRef}
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "80%", display: "flex", flexDirection: "column",
          // A leaving animation of its own: the same name run in reverse is not restarted by the
          // browser, which jumps to its end instead, and the sheet vanished in one frame.
          animation: leaving ? "sheetDown 0.2s ease-in forwards" : "sheetUp 0.26s cubic-bezier(0.22,1,0.36,1)",
        }}>
        {/* The list this one was opened from, folded into a pill: its name and the way back. */}
        {page && (
          <button ref={crumbRef} key={stack.join("/")} type="button" onClick={(e) => { e.stopPropagation(); back(); }}
            className="sheet-row sheet-crumb"
            style={{
              display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 16px",
              margin: "0 12px 10px", border: 0, borderRadius: 999, cursor: "default", flexShrink: 0,
              background: "var(--overlay)", boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
              fontFamily: "var(--font)", fontSize: "var(--t14)", fontWeight: 700, color: "var(--text-primary)",
            }}>
            <ArrowLeft size={15} />
            <span style={{ flex: 1, minWidth: 0, textAlign: "start", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.label}</span>
            {page.hint && <span style={{ fontSize: "var(--t13)", color: "var(--accent)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{page.hint}</span>}
            <span className="sr-only">{t("back")}</span>
          </button>
        )}
        <div ref={menuRef} role="menu" aria-label={page?.label || title} onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex", flexDirection: "column", minHeight: 0,
            // A small shadow: a wide blur over the full width is costly to repaint on a phone.
            background: "var(--overlay)", borderRadius: "24px 24px 0 0", boxShadow: "0 -2px 16px rgba(0,0,0,0.35)", overflow: "hidden",
            paddingBottom: "var(--safe-bottom-z)",
          }}>
          <div className="touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}
            style={{ height: 26, flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--fill-strong)" }} />
          </div>
          <div key={stack.join("/")} className="scrollable" style={{ overflowY: "auto", paddingBottom: 10 }}>
            {list.map((it) => (
              <div key={it.id}>
                {it.divider && <div style={{ height: 1, background: "var(--border)", margin: "6px 20px" }} />}
                {row(it)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
