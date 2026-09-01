// The live diagnostics panel. Floats over whatever is on screen, because the numbers it shows
// are only meaningful while the faulty state is visible — walking to a settings page to read
// them can undo the very condition being measured.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, X } from "../icons.jsx";
import { diagText, readDiag, subscribeDiag } from "./live.js";

const POS_KEY = "kodama-diag-pos";
const W = 320;

export function DiagOverlay({ onClose }) {
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);

  // Bottom right to begin with, because that is the least likely corner to hold something you
  // are reading. Wherever it is dragged to is remembered: a tester reproducing a fault should
  // not have to move it again on every restart.
  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) return saved;
    } catch { /* fall through to the default */ }
    return { left: window.innerWidth - W - 16, top: Math.max(16, window.innerHeight - 360) };
  });

  // Clamp back inside on resize, or a panel parked against one edge becomes unreachable when
  // the window is made smaller.
  useEffect(() => {
    const onResize = () => setPos((p) => ({
      left: Math.max(0, Math.min(p.left, window.innerWidth - 80)),
      top: Math.max(0, Math.min(p.top, window.innerHeight - 40)),
    }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* private window */ }
  }, [pos]);

  const startDrag = (e) => {
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault();
    const r = panelRef.current.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev) => setPos({
      // Never fully off screen: at least a corner of the header has to stay grabbable.
      left: Math.max(-W + 80, Math.min(window.innerWidth - 80, ev.clientX - ox)),
      top: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - oy)),
    });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "move";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // The board is not React state; it notifies, and this redraws. Sections publish from scroll
  // handlers, so the panel repaints as the numbers move.
  useEffect(() => subscribeDiag(() => tick((n) => n + 1)), []);

  const sections = readDiag();

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9998] max-h-[60vh] flex flex-col rounded-xl border border-border shadow-2xl"
      style={{ left: pos.left, top: pos.top, width: W, background: "rgba(20,20,20,0.96)", backdropFilter: "blur(10px)" }}
    >
      <div onPointerDown={startDrag}
        className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-border select-none"
        style={{ cursor: "move" }}>
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success,#3ec79a)]" />
        <span className="flex-1 font-semibold text-primary" style={{ fontSize: "var(--t12)" }}>Diagnose</span>
        <button type="button" data-no-drag aria-label="Copy"
          onClick={() => {
            navigator.clipboard.writeText(diagText()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }).catch(() => {});
          }}
          className="w-6 h-6 flex items-center justify-center rounded-[var(--r-md)] border-0 bg-transparent text-secondary hover:text-primary hover:bg-hover cursor-default">
          <Copy size={12} />
        </button>
        <button type="button" data-no-drag aria-label="Close" onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-[var(--r-md)] border-0 bg-transparent text-secondary hover:text-primary hover:bg-hover cursor-default">
          <X size={12} />
        </button>
      </div>

      <div className="overflow-y-auto p-3 flex flex-col gap-3">
        {copied && <div className="text-[var(--status-success,#3ec79a)]" style={{ fontSize: "var(--t11)" }}>In die Zwischenablage kopiert</div>}
        {sections.length === 0 && (
          <div className="text-muted" style={{ fontSize: "var(--t11)" }}>
            Noch nichts zu messen. Öffne eine Playlist und scrolle.
          </div>
        )}
        {sections.map(({ name, values }) => (
          <div key={name}>
            <div className="text-secondary font-semibold mb-1" style={{ fontSize: "var(--t11)" }}>{name}</div>
            <div className="flex flex-col gap-0.5">
              {Object.entries(values).map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-2">
                  <span className="text-muted shrink-0" style={{ fontSize: "var(--t10)", minWidth: 92 }}>{k}</span>
                  {/* break-all: a resolved element's description is one long token and would
                      otherwise push the panel wider than the screen. */}
                  <span className="text-primary tabular-nums break-all" style={{ fontSize: "var(--t11)" }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="text-muted pt-1 border-t border-border" style={{ fontSize: "var(--t10)" }}>
          {window.innerWidth}×{window.innerHeight} · dpr {window.devicePixelRatio}
        </div>
      </div>
    </div>,
    document.body,
  );
}
