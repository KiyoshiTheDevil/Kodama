// Chrome shared by Kodama's borderless tool windows (the Overlay Editor, the Equalizer).
// These lived inside OverlayEditor.jsx while it was the only one of its kind; a second window
// in the same visual language needs the same pieces, and a copy would have drifted.
import { useState, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Resolves per document, so this is the main window in the main window and the tool window
// in each tool window — which is what lets one set of controls serve all of them.
const currentWindow = getCurrentWebviewWindow();

/**
 * Figma's selection blue, shared by Kodama's tool windows. They keep a fixed accent instead of
 * following the app's for two reasons: the Overlay Editor is a design surface where the user's
 * own colour would hide the selection inside the artwork, and beyond that the tool windows are
 * a family — one of them wearing the player's accent while the other did not made them look
 * like they came from different applications.
 */
export const TOOL_ACCENT = "#0D99FF";
export const TOOL_ACCENT_DIM = "rgba(13,153,255,0.10)";

/** Pin the tool accent on this window's document. Call once, from the window's entry point. */
export function useToolAccent() {
  useEffect(() => {
    // On the document root rather than a wrapper: dropdowns and tooltips render into a portal
    // on document.body and would otherwise keep the app's accent. Each of these windows has
    // its own document, so nothing else is affected.
    const root = document.documentElement;
    root.style.setProperty("--accent", TOOL_ACCENT);
    root.style.setProperty("--accent-dim", TOOL_ACCENT_DIM);
  }, []);
}

// Header controls sit on a filled, rounded chip rather than being transparent until hovered:
// on a 52px bar the bare icons read as floating specks, and the design gives every one of them
// a surface. --surface-2/-3 are exactly the "control" and "control hovered" tokens.
export const HDR_ICON_BTN =
  "w-[46px]! h-[30px]! bg-[var(--surface-2)]! hover:bg-[var(--surface-3)]! text-primary!";

export const HDR_H = 30;
export const HDR_NOTCH = 6;

/**
 * Grouped controls follow the same rule as the lyrics chips (see lyrics/tool-chips.jsx): the
 * free ends of a group keep the pill radius, the touching ends get a small notch.
 *
 * The trap that comes with it, twice learned: a 24px outer radius on a 30px-tall control means
 * two radii adding up to 48 along a 30px side, and the browser then scales ALL FOUR corners by
 * 30/48 — the 24 silently becomes 15 AND the 6px notch becomes 3.75. The pill value simply IS
 * half the height, which is the look the 24 was after, and keeping it there is what lets the
 * notch stay exactly 6. Pass the real height whenever it is not 30.
 */
export const hdrCorners = (left, right, height = HDR_H) => {
  const pill = height / 2;
  const l = left ? HDR_NOTCH : pill;
  const r = right ? HDR_NOTCH : pill;
  return `${l}px ${r}px ${r}px ${l}px`;
};

// The three glyphs, drawn here rather than taken from the icon set.
//
// They used to be mixed: Minus and X came from Font Awesome while the squares were hand-drawn
// at 1px, so three buttons sitting side by side had two different stroke weights and two
// different cap styles. The restore glyph was worse than inconsistent — its back square ran to
// exactly x=10 and its path to x=0, touching both edges of the viewBox with no margin, which
// made it read as larger and heavier than its neighbours.
//
// One 10x10 grid, one stroke weight, one margin, round caps throughout: the softness is what
// ties them to the rest of Kodama's chrome.
const GLYPH = { width: 11, height: 11, viewBox: "0 0 10 10", fill: "none", stroke: "currentColor",
  strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" };

const GlyphMinimize = () => <svg {...GLYPH}><path d="M0.8 5h8.4" /></svg>;
const GlyphMaximize = () => <svg {...GLYPH}><rect x="0.8" y="0.8" width="8.4" height="8.4" rx="1.6" /></svg>;
// The back square is an open path, not a rect: where the two overlap the front one already
// draws the line, and a full rect behind it puts two strokes on the same pixels.
const GlyphRestore = () => (
  <svg {...GLYPH}>
    <path d="M2.6 2.6V1.8a1 1 0 0 1 1-1h4.6a1 1 0 0 1 1 1v4.6a1 1 0 0 1-1 1h-0.8" />
    <rect x="0.8" y="2.6" width="6.6" height="6.6" rx="1.4" />
  </svg>
);
const GlyphClose = () => <svg {...GLYPH}><path d="M1 1l8 8M9 1l-8 8" /></svg>;

/**
 * Minimise / maximise / close for a window drawn without system decorations.
 *
 * Shared by the main window and the tool windows, which each drew their own copy until the two
 * had drifted apart in size, colour and hover behaviour. `getCurrentWebviewWindow()` resolves
 * per document, so the same component controls whichever window it is mounted in.
 *
 * The chip is transparent until the pointer arrives, so at rest these are three quiet glyphs
 * rather than three filled buttons competing with the title beside them. The shape underneath
 * is still the header's own grammar — outer ends pilled, touching ends notched, exactly like
 * the import/export and undo/redo groups — which is what the hover reveals.
 */
export function WindowControls({ height = HDR_H, width = 40 }) {
  const [max, setMax] = useState(false);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    let cancel = false;
    const check = () => currentWindow.isMaximized().then((v) => { if (!cancel) setMax(v); });
    check();
    const un = currentWindow.onResized(() => check());
    return () => { cancel = true; un.then((fn) => fn()); };
  }, []);

  const buttons = [
    { id: "min", label: "Minimize", corners: hdrCorners(false, true, height), glyph: <GlyphMinimize />,
      action: () => currentWindow.minimize() },
    { id: "max", label: max ? "Restore" : "Maximize", corners: hdrCorners(true, true, height),
      glyph: max ? <GlyphRestore /> : <GlyphMaximize />,
      action: () => currentWindow.toggleMaximize() },
    { id: "close", label: "Close", corners: hdrCorners(true, false, height), glyph: <GlyphClose />,
      action: () => currentWindow.close() },
  ];

  return (
    // position:relative is load-bearing in the main window: its drag region is an absolutely
    // positioned sibling that reaches to within 80px of the right edge, and this group is wider
    // than that. Without a positioning context of its own the group paints *under* the drag
    // region, which swallows the clicks on whichever buttons the overlap reaches.
    <div className="flex items-center ml-1.5 shrink-0"
      style={{ gap: HDR_NOTCH, pointerEvents: "all", position: "relative" }}>
      {buttons.map((b) => {
        const on = hovered === b.id;
        // Only close departs from the surface tokens, and only while hovered: it is the one
        // control here that cannot be undone, and every desktop states that in red.
        const danger = b.id === "close" && on;
        return (
          <button key={b.id} type="button" aria-label={b.label}
            onClick={(e) => { e.stopPropagation(); b.action(); }}
            onPointerEnter={() => setHovered(b.id)}
            onPointerLeave={() => setHovered(null)}
            className="flex items-center justify-center border-0 cursor-default shrink-0 transition-colors"
            style={{
              width, height,
              borderRadius: b.corners,
              background: danger ? "#c42b1c" : on ? "var(--surface-2)" : "transparent",
              color: danger ? "#fff" : on ? "var(--text-primary)" : "var(--text-secondary)",
            }}>
            {b.glyph}
          </button>
        );
      })}
    </div>
  );
}
