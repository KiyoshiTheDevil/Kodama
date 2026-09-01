// Chrome shared by Kodama's borderless tool windows (the Overlay Editor, the Equalizer).
// These lived inside OverlayEditor.jsx while it was the only one of its kind; a second window
// in the same visual language needs the same pieces, and a copy would have drifted.
import { useState, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, X } from "../icons.jsx";

const toolWindow = getCurrentWebviewWindow();

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

/** Minimise / maximise / close for a window drawn without system decorations. */
export function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    let cancel = false;
    const check = () => toolWindow.isMaximized().then((v) => { if (!cancel) setMax(v); });
    check();
    const un = toolWindow.onResized(() => check());
    return () => { cancel = true; un.then((fn) => fn()); };
  }, []);
  const base = "w-9 h-7 flex items-center justify-center rounded text-secondary transition-colors shrink-0";
  return (
    <div className="flex items-center gap-0.5 ml-1" style={{ pointerEvents: "all" }}>
      <button type="button" className={`${base} hover:bg-[var(--bg-hover)]`} onClick={() => toolWindow.minimize()} aria-label="Minimize"><Minus size={11} /></button>
      <button type="button" className={`${base} hover:bg-[var(--bg-hover)]`} onClick={() => toolWindow.toggleMaximize()} aria-label="Maximize">
        {max
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="0" width="8" height="8" rx="0.5" /><path d="M0 2v7a1 1 0 0 0 1 1h7" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="0.5" /></svg>}
      </button>
      <button type="button" className={`${base} hover:bg-[#c42b1c] hover:text-white!`} onClick={() => toolWindow.close()} aria-label="Close"><X size={11} /></button>
    </div>
  );
}
