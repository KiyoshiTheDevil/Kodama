// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — Figma-style direct-manipulation editor
//
//  Full-bleed canvas (pan + zoom) with the real engine in an <iframe> (zero
//  render drift, pointer-events:none) and a transparent React interaction layer
//  on top: click to select, drag to move, 8 handles to resize, knob to rotate.
//  Floating panels: left = layers, right = inspector. Live drag preview goes to
//  the iframe via postMessage; commits persist (localStorage + POST v2 → SSE/OBS).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo, createContext, useContext } from "react";
// createPortal removed — font picker is now lifted to OverlayEditor level
import {
  Button, Switch,
  TextFieldRoot, InputRoot,
  SelectRoot, SelectTrigger, SelectValue, SelectIndicator, SelectPopover,
  ListBox, ListBoxItem,
  SeparatorRoot,
  Dropdown, DropdownTrigger, DropdownPopover, DropdownItem, DropdownSection,
  ScrollShadowRoot,
} from "@heroui/react";
import { DropdownMenu } from "../ui/zoomed-heroui.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { HDR_ICON_BTN, HDR_H, HDR_NOTCH, hdrCorners, WindowControls } from "../ui/window-chrome.jsx";
import {
  ImageSquare, VinylRecord, TextSize, WaveformLines, PaintBrushBroad, Sparkles, Storefront,
  Eye, EyeSlash, Lock, LockOpen, Plus, Trash, Copy, Scissors, Clipboard, Check, ArrowsClockwise, Droplet, PencilSimple,
  ArrowsOut, ArrowClockwise, CaretDown, CaretRight, CursorArrow, ObjectGroup, ObjectUngroup, Play, PaintRoller, Shapes, Folder,
  X, Minus, UploadSimple, DownloadSimple, FileImport, FileExport, FloppyDisk, Swatches, MagnifyingGlass, DotsSixVertical,
  OvlOpacity, OvlCornerRadius, OvlCornerSingle, OvlStrokeWeight, OvlDropShadow, OvlGlow, OvlLayerBlur, OvlInnerShadow,
} from "../icons.jsx";
import {
  isV2Doc, normalizeOverlayDoc, defaultOverlayDoc, LAYER_FACTORIES, uniformCorners, defaultCanvas, SHADER_PRESETS,
} from "./schema.js";
import { readElements, writeElements, makeElement, placeElement, foldersOf, moveToFolder, renameFolder, dissolveFolder, cleanFolder, readFolderList, writeFolderList } from "./elements.js";
import { ColorPicker } from "../ui/color-picker.jsx";
import { openStoreWeb } from "../store/web.js";
import { useCoverPalette, setCoverPalette, setCoverText, parseCover, resolveColor, coverName, coverPickerProps } from "./cover-colors.js";
import {
  tidyGroups, groupsOf, expandToGroups, selectedGroup, nextGroupName, groupLayers, ungroupLayers,
  setGroup, cloneLayers, buildRows, dropRow, boundsOf, membersOf, pickOnClick, pickOnDoubleClick,
  groupsToUngroup, placeAbove, selectionColors, replaceColor, chainOf, findGroup, reorderNodes,
} from "./groups.js";
import { copyProps, pasteProps, copyItem, pasteItem, removeItem } from "./style-clipboard.js";

const TYPE_META = {
  albumArt: { icon: VinylRecord, label: "Album Art" },
  text:     { icon: TextSize, label: "Text" },
  progress: { icon: WaveformLines, label: "Progress" },
  image:    { icon: ImageSquare, label: "Image" },
  shape:    { icon: PaintBrushBroad, label: "Shape" },
  shader:   { icon: Sparkles, label: "Shader" },
};
const ADD_TYPES = ["text", "albumArt", "progress", "image", "shape", "shader"];
const PAN_SPEED = 0.5; // wheel-scroll pan damping (raw wheel deltas feel too coarse at 1:1)

// Fonts preloaded by the engine HTML (must match the <link> in server.py).
const FONT_LIST = [
  { value: "system-ui, sans-serif", label: "System", category: "system" },
  ...["Outfit", "Inter", "Roboto", "Nunito", "Exo 2", "Poppins", "Raleway", "Montserrat",
      "DM Sans", "Ubuntu", "Lexend", "Space Grotesk", "Sora", "Barlow", "Figtree",
      "Plus Jakarta Sans", "Kanit", "Oxanium", "Chakra Petch"]
    .map((f) => ({ value: `'${f}', sans-serif`, label: f, category: "google" })),
];
const BIND_OPTS = (t) => ["title", "subtitle", "artist", "album", "position", "duration", "static"]
  .map((v) => ({ value: v, label: t("ovlBind_" + v) }));
const ALIGN_OPTS = (t) => [{ value: "left", label: t("ovlLeft") }, { value: "center", label: t("ovlCenter") }, { value: "right", label: t("ovlRight") }];
const VALIGN_OPTS = (t) => [{ value: "top", label: t("ovlTop") }, { value: "middle", label: t("ovlMiddle") }, { value: "bottom", label: t("ovlBottom") }];
const WEIGHT_OPTS = (t) => [{ value: "400", label: t("ovlRegular") }, { value: "700", label: t("ovlBold") }];
const FIT_OPTS = () => [{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "fill", label: "Fill" }];
const SHAPE_OPTS = (t) => ["rect", "circle", "ellipse", "triangle", "polygon", "star", "line"].map((v) => ({ value: v, label: t("ovlShape_" + v) }));
const CAP_OPTS = (t) => [{ value: "round", label: t("ovlCapRound") }, { value: "butt", label: t("ovlCapButt") }];
const ENTRANCE_OPTS = (t) => ["none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight",
  "enterLeft", "enterRight", "enterTop", "enterBottom", "zoom",
  "zoomOut", "pop", "blurIn", "flipX", "flipY", "rotateIn", "dropIn", "wipeRight", "wipeLeft", "wipeUp"].map((v) => ({ value: v, label: t("ovlEntr_" + v) }));
const LOOP_OPTS = (t) => ["none", "pulse", "float", "spin"].map((v) => ({ value: v, label: t("ovlLoop_" + v) }));
const CORNER_OPTS  = (t) => [{ value: "r", label: t("ovlRound") }, { value: "b", label: t("ovlBevel") }];
const QUALITY_OPTS = (t) => [{ value: "low", label: t("ovlQualityLow") }, { value: "high", label: t("ovlQualityHigh") }];

function togglePart(parts, key, on) {
  const set = new Set(parts || []);
  if (on) set.add(key); else set.delete(key);
  return ["artist", "album"].filter((k) => set.has(k));
}

const HANDLES = [
  { dir: "nw", x: 0,   y: 0,   cur: "nwse" }, { dir: "n", x: 0.5, y: 0, cur: "ns" },
  { dir: "ne", x: 1,   y: 0,   cur: "nesw" }, { dir: "e", x: 1, y: 0.5, cur: "ew" },
  { dir: "se", x: 1,   y: 1,   cur: "nwse" }, { dir: "s", x: 0.5, y: 1, cur: "ns" },
  { dir: "sw", x: 0,   y: 1,   cur: "nesw" }, { dir: "w", x: 0, y: 0.5, cur: "ew" },
];
const DIRV = {
  nw: { x: -1, y: -1 }, n: { x: 0, y: -1 }, ne: { x: 1, y: -1 }, e: { x: 1, y: 0 },
  se: { x: 1, y: 1 }, s: { x: 0, y: 1 }, sw: { x: -1, y: 1 }, w: { x: -1, y: 0 },
};

// Figma-style inline align/flip glyphs (inherit currentColor).
const _svg = (kids) => <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{kids}</svg>;
const ALIGN_GLYPH = {
  hL: _svg(<><rect x="1" y="1.5" width="1.4" height="13" rx=".7" /><rect x="4" y="3.6" width="10" height="3" rx="1" /><rect x="4" y="8.9" width="6.5" height="3" rx="1" /></>),
  hC: _svg(<><rect x="7.3" y="1.5" width="1.4" height="13" rx=".7" /><rect x="3" y="3.6" width="10" height="3" rx="1" /><rect x="5" y="8.9" width="6" height="3" rx="1" /></>),
  hR: _svg(<><rect x="13.6" y="1.5" width="1.4" height="13" rx=".7" /><rect x="2" y="3.6" width="10" height="3" rx="1" /><rect x="5.5" y="8.9" width="6.5" height="3" rx="1" /></>),
  vT: _svg(<><rect x="1.5" y="1" width="13" height="1.4" rx=".7" /><rect x="3.6" y="4" width="3" height="10" rx="1" /><rect x="8.9" y="4" width="3" height="6.5" rx="1" /></>),
  vM: _svg(<><rect x="1.5" y="7.3" width="13" height="1.4" rx=".7" /><rect x="3.6" y="3" width="3" height="10" rx="1" /><rect x="8.9" y="5" width="3" height="6" rx="1" /></>),
  vB: _svg(<><rect x="1.5" y="13.6" width="13" height="1.4" rx=".7" /><rect x="3.6" y="2" width="3" height="10" rx="1" /><rect x="8.9" y="5.5" width="3" height="6.5" rx="1" /></>),
};
const FLIP_H = <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.6" /><path d="M6.3 3.5 2 8l4.3 4.5z" fill="currentColor" /><path d="M9.7 3.5 14 8l-4.3 4.5z" fill="currentColor" opacity=".45" /></svg>;
const FLIP_V = <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="1.6 1.6" /><path d="M3.5 6.3 8 2l4.5 4.3z" fill="currentColor" /><path d="M3.5 9.7 8 14l4.5-4.3z" fill="currentColor" opacity=".45" /></svg>;
const BLEND_OPTS = () => [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
].map((v) => ({ value: v, label: v.replace("-", " ").replace(/^\w/, (c) => c.toUpperCase()) }));
const STROKE_POS_OPTS = (t) => [
  { value: "inside", label: t("ovlStrokeInside") || "Inside" },
  { value: "center", label: t("ovlStrokeCenter") || "Center" },
  { value: "outside", label: t("ovlStrokeOutside") || "Outside" },
];
// Glyphs for the three effects the engine renders.
const EFFECT_GLYPH = {
  shadow: <OvlDropShadow size={13} />,
  innerShadow: <OvlInnerShadow size={13} />,
  glow: <OvlGlow size={13} />,
  blur: <OvlLayerBlur size={13} />,
};

const EFFECT_DEFAULTS = {
  shadow: { color: "#000000", x: 0, y: 2, blur: 8, opacity: 50 },
  innerShadow: { color: "#000000", x: 0, y: 2, blur: 8, opacity: 50 },
  glow: { color: "#ffffff", blur: 10 },
  blur: { amount: 4 },
};
const EFFECT_TYPE_OPTS = (t) => [
  { value: "shadow", label: t("ovlFxShadow"), icon: EFFECT_GLYPH.shadow },
  { value: "innerShadow", label: t("ovlFxInnerShadow") || "Inner shadow", icon: EFFECT_GLYPH.innerShadow },
  { value: "glow", label: t("ovlFxGlow"), icon: EFFECT_GLYPH.glow },
  { value: "blur", label: t("ovlFxBlur"), icon: EFFECT_GLYPH.blur },
];
const makeEffect = (type) => ({ id: Math.random().toString(36).slice(2), type, visible: true, ...EFFECT_DEFAULTS[type] });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rot(x, y, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function loadInitialDoc() {
  try { const v2 = JSON.parse(localStorage.getItem("kiyoshi-overlay-doc")); if (isV2Doc(v2)) return normalizeOverlayDoc(v2); } catch {}
  try { const v1 = JSON.parse(localStorage.getItem("kiyoshi-obs-config")); if (v1) return normalizeOverlayDoc(v1); } catch {}
  return defaultOverlayDoc();
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

const LAYER_ROW_H = 30;
const GROUP_INDENT = 18;   // how far a group's members sit in from its header

// The menu bar: which of its menus is open, shared, so that with one open, moving the pointer
// onto another trigger opens that one instead, the way every desktop menu bar behaves. An open
// menu lays an invisible layer over the page, so the other triggers never see a hover of their
// own; the pointer is followed on the document and tested against their boxes instead.
const MenuBarCtx = createContext(null);
function MenuBar({ children, className }) {
  const [open, setOpen] = useState(null);
  const barRef = useRef(null);
  useEffect(() => {
    if (open == null) return;
    const onMove = (e) => {
      for (const el of barRef.current?.querySelectorAll("[data-menubar-id]") || []) {
        const id = el.getAttribute("data-menubar-id");
        if (id === open) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { setOpen(id); return; }
      }
    };
    document.addEventListener("pointermove", onMove, true);
    return () => document.removeEventListener("pointermove", onMove, true);
  }, [open]);
  return (
    <MenuBarCtx.Provider value={{ open, setOpen }}>
      <div ref={barRef} className={className}>{children}</div>
    </MenuBarCtx.Provider>
  );
}

// Menu bar entry. The design puts the bar at 52px with 30px controls, so the trigger height
// lives here rather than being repeated at each of the four menus.
function MenuBtn({ label, children, width = 230, corners }) {
  const bar = useContext(MenuBarCtx);
  const ctl = bar ? {
    isOpen: bar.open === label,
    onOpenChange: (o) => bar.setOpen((cur) => (o ? label : cur === label ? null : cur)),
  } : {};
  return (
    <Dropdown {...ctl}>
      <DropdownTrigger
        data-menubar-id={label}
        style={{ borderRadius: corners }}
        className="h-[30px] px-4 border-0 bg-[var(--surface-2)] text-[length:var(--t14)] text-primary hover:bg-[var(--surface-3)] transition-colors cursor-pointer">
        {label}
      </DropdownTrigger>
      <DropdownPopover placement="bottom start" style={{ minWidth: width }}>
        {children}
      </DropdownPopover>
    </Dropdown>
  );
}

// A Preferences row: the tick column is always reserved so the labels line up whether or not
// the option is on, the way every menu of this kind behaves.
function PrefTick({ on }) {
  return <span className="inline-flex w-[13px] justify-center shrink-0">{on ? <Check size={12} weight="bold" /> : null}</span>;
}

// ── Inspector controls ────────────────────────────────────────────────────────
// Section header with an optional right-aligned action node (e.g. a small toggle).
// Round/bevel corners: parked, not removed. The control was a full-width segmented toggle in
// Appearance, which made a rarely-used choice the loudest thing in the section, and the design
// has no place for it yet. Covers both offers of the choice, on a layer and on the canvas, so
// bevel is simply not reachable for now rather than half gone. The property itself is untouched
// -- documents keep whatever corner type they were saved with, it just cannot be changed here.
const SHOW_CORNER_TYPE = false;

// Corner glyphs for the per-corner radius fields: the drawn single corner, rotated for the
// other three. A letter pair (TL, TR ...) has to be read; the shape is recognised at a glance.
const _corner = (deg) => <OvlCornerSingle size={12} style={deg ? { transform: `rotate(${deg}deg)` } : undefined} />;
const CORNER_GLYPH = {
  TL: _corner(0),
  TR: _corner(90),
  BR: _corner(180),
  BL: _corner(270),
};

// Section heading, per the design: a real heading in the panel's own voice rather than a small
// grey caption, with a rule separating it from what came before.
//
// Sizes go through inline var(--tNN) instead of the text-tNN utilities: those classes generate
// nothing (the theme declares the scale under Tailwind 3's --font-size-* while the project is on
// Tailwind 4), so anything set with them silently keeps the inherited size.
function Section({ title, right, children }) {
  return (
    <div className="border-t border-border pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
      {(title || right) && (
        <div className="flex items-center justify-between mb-2 min-h-[20px]">
          {title && <span style={{ fontSize: "var(--t15)" }} className="font-semibold text-primary">{title}</span>}
          {right}
        </div>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

// Secondary action with no surface: the design leaves these bare so they sit beside a field
// without reading as a control in their own right.
function BareIconBtn({ onPress, active, label, children }) {
  return (
    <button type="button" onClick={onPress} aria-label={label} title={label} aria-pressed={active}
      className={`shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer transition-colors ${active ? "text-accent" : "text-secondary hover:text-primary"}`}>
      {children}
    </button>
  );
}

// Caption above a block of fields. The design names a block from above instead of putting a
// label to the left of every control, which lets the fields use the full width of the panel.
function SubLabel({ children }) {
  return <span style={{ fontSize: "var(--t12)" }} className="block text-muted mb-1">{children}</span>;
}

// A block: caption, then its fields. Saves repeating the wrapper at every group.
function Field({ label, children }) {
  return (
    <div>
      {label && <SubLabel>{label}</SubLabel>}
      {children}
    </div>
  );
}
// The type-specific sections used to put a label to the left of a boxed NumberField, which is
// the dialect the rest of the inspector was moved away from: caption above, field across the
// full width. Built on PillNum so these also get the drag-to-scrub prefix behaviour.
function NumField({ label, value, onChange, min, max, step = 1, prefix }) {
  return (
    <Field label={label}>
      <PillNum prefix={prefix} ariaLabel={label} value={value} onChange={onChange}
        min={min} max={max} step={step} />
    </Field>
  );
}
// Compact pill with a short prefix (X/Y/W/H …) — a plain controlled <input> (HeroUI's
// NumberField input sizing was unreliable). Prefix overlaid absolutely; live edits flow
// through on every valid keystroke; external value updates sync only while not focused.
function PillNum({ prefix, ariaLabel, value, onChange, min, max, step = 1 }) {
  const fmtNum = (v) => (v == null || Number.isNaN(v)) ? "0" : String(step < 1 ? Math.round(v * 100) / 100 : Math.round(v));
  const [text, setText] = useState(() => fmtNum(value));
  const focused = useRef(false);
  const inputRef = useRef(null);
  useEffect(() => { if (!focused.current) setText(fmtNum(value)); }, [value]);
  const clampN = (n) => {
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    return n;
  };
  const onInput = (e) => {
    const raw = e.target.value;
    setText(raw);
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) onChange(clampN(n));
  };
  const commit = () => {
    focused.current = false;
    const n = parseFloat(text);
    if (Number.isNaN(n)) setText(fmtNum(value));
    else { const c = clampN(n); setText(fmtNum(c)); onChange(c); }
  };
  // Drag the prefix horizontally to scrub the value (Figma-style).
  const onScrub = (e) => {
    e.preventDefault();
    // A field the cursor was in keeps its focus through the drag (the pointerdown is prevented),
    // so its number stood still while the value moved, and leaving the field afterwards wrote the
    // stale number back. Leave the field first, and show every step of the drag in it.
    if (focused.current) inputRef.current?.blur();
    const startX = e.clientX;
    const startVal = (value == null || Number.isNaN(value)) ? 0 : value;
    const move = (ev) => {
      const n = Math.round((startVal + (ev.clientX - startX) * step) / step) * step;
      const c = clampN(Math.round(n * 100) / 100);
      setText(fmtNum(c));
      onChange(c);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "ew-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="flex items-center gap-1.5 h-[30px] w-full min-w-0 pl-3 pr-2 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-transparent focus-within:border-accent transition-colors">
      {prefix != null && (
        <span onPointerDown={onScrub} aria-hidden="true"
          className="shrink-0 flex items-center text-secondary select-none whitespace-nowrap"
          style={{ cursor: "ew-resize", fontSize: "var(--t12)" }}>{prefix}</span>
      )}
      <input
        ref={inputRef}
        value={text}
        inputMode="numeric"
        aria-label={ariaLabel || (typeof prefix === "string" ? prefix : undefined)}
        onFocus={() => { focused.current = true; }}
        onChange={onInput}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
        className="flex-1 min-w-0 bg-transparent outline-none text-primary tabular-nums"
        style={{ fontSize: "var(--t13)" }}
      />
    </div>
  );
}
function OvlTextField({ label, value, onChange, placeholder }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {label && <span className="text-muted shrink-0" style={{ fontSize: "var(--t12)" }}>{label}</span>}
      <TextFieldRoot value={value ?? ""} onChange={onChange} aria-label={label || placeholder} className="flex-1 min-w-0">
        <InputRoot className="text-[length:var(--t12)]! h-8! bg-[var(--surface-2)]! border-border!" placeholder={placeholder} />
      </TextFieldRoot>
    </div>
  );
}
function ColorField({ label, value, onChange, opacity, onOpacity, corners }) {
  const pal = useCoverPalette();
  // A colour bound to the cover shows its name instead of a hex value; picking an own colour
  // in the picker (or typing one after clearing) unbinds it.
  const bound = !!parseCover(value);
  const hex = bound ? value : typeof value === "string" && value[0] === "#" ? value.slice(0, 7) : "#000000";
  return (
    <div style={{ borderRadius: corners || "var(--r-full)" }}
      className="flex items-center gap-2 h-[30px] pl-2 pr-3 bg-[var(--surface-2)] border border-transparent transition-colors focus-within:border-accent">
      <ColorPicker variant="editor" value={hex} onChange={onChange} cover={coverPickerProps(pal)} swatch={{ width: 18, height: 18, borderRadius: "var(--r-full)", border: "1px solid var(--border)" }} />
      {bound ? (
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="truncate text-primary" style={{ fontSize: "var(--t13)" }}>{coverName(value)}</span>
        </span>
      ) : (
        <input value={(value ?? "").replace(/^#/, "")} onChange={(e) => onChange("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-primary uppercase"
          style={{ fontSize: "var(--t13)" }} aria-label={(label || "") + " hex"} />
      )}
      {onOpacity ? (
        <div className="flex items-center shrink-0">
          <input value={opacity ?? 100} onChange={(e) => onOpacity(clamp(parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10), 0, 100))}
            className="w-7 bg-transparent outline-none text-muted text-right tabular-nums"
            style={{ fontSize: "var(--t12)" }} aria-label={(label || "") + " opacity"} />
          <span className="text-muted" style={{ fontSize: "var(--t12)" }}>%</span>
        </div>
      ) : opacity != null && <span className="text-muted shrink-0 tabular-nums" style={{ fontSize: "var(--t12)" }}>{opacity}%</span>}
    </div>
  );
}
function PercentField({ label, value, onChange, corners }) {
  return (
    <div style={{ borderRadius: corners || "var(--r-full)" }}
      className="flex items-center shrink-0 w-[68px] h-[30px] px-3 bg-[var(--surface-2)] border border-transparent transition-colors focus-within:border-accent">
      <input value={value ?? 100}
        onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10), 0, 100))}
        className="w-full min-w-0 bg-transparent outline-none text-primary tabular-nums"
        style={{ fontSize: "var(--t13)" }} aria-label={label} />
      <span className="text-muted shrink-0" style={{ fontSize: "var(--t13)" }}>%</span>
    </div>
  );
}

function SwitchField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted" style={{ fontSize: "var(--t12)" }}>{label}</span>
      <Switch isSelected={!!checked} onChange={onChange} aria-label={label}>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch>
    </div>
  );
}
// Labelled selects follow the fields: caption above, control across the full width. Unlabelled
// ones already sat inline inside a row (stroke position, effect type) and stay that way.
function SelectField({ label, value, onChange, options }) {
  // The wrapper is chosen inline, not as a component made here: a component created during
  // render is a new type every render, so React threw the whole select away and rebuilt it on
  // each redraw of the editor, closing an open menu the moment anything else changed.
  const select = (
      <SelectRoot
        selectedKey={value} onSelectionChange={(k) => onChange(String(k))}
        aria-label={label} className={label ? "w-full" : "flex-1 min-w-0"}
      >
        {/* Pill, 30px, borderless until focus -- the same field shape as PillNum and
            ColorField, so a dropdown does not read as a different kind of control. */}
        <SelectTrigger style={{ fontSize: "var(--t13)" }}
          className="h-[30px]! px-3! gap-2! rounded-[var(--r-full)]! bg-[var(--surface-2)]! border-transparent! data-[focused]:border-accent!">
          <SelectValue style={{ fontSize: "var(--t13)" }} />
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {options.map((o) => (
              <ListBoxItem key={o.value} id={o.value} style={{ fontSize: "var(--t13)" }}>
                {o.icon && <span className="shrink-0 inline-flex items-center mr-2 text-secondary">{o.icon}</span>}
                {o.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </SelectRoot>
  );
  return label
    ? <Field label={label}>{select}</Field>
    : <div className="flex items-center justify-between gap-2">{select}</div>;
}
// Icon/label segmented control (e.g. align L/C/R) — a pill matching the input fields,
// with rounded inner segments (no hard per-segment dividers).
// A group of buttons, following the same rule as everywhere else in the editor: each is its own
// 30px chip, the free ends of the group keep the pill radius and the touching ends get a notch.
// It used to be a bordered track with small segments inside, which read as a different kind of
// control from the fields beside it.
function Segmented({ value, onChange, options }) {
  const last = options.length - 1;
  return (
    <div className="flex gap-1.5">
      {options.map((o, i) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-label={o.aria || o.value}
          aria-pressed={value === o.value}
          className={[
            "flex-1 h-[30px] flex items-center justify-center border-0 cursor-pointer transition-colors",
            value === o.value ? "text-white" : "text-muted hover:text-primary hover:bg-[var(--surface-3)]",
          ].join(" ")}
          style={{
            borderRadius: hdrCorners(i > 0, i < last, 30),
            fontSize: "var(--t12)",
            background: value === o.value ? "var(--accent)" : "var(--surface-2)",
          }}
        >{o.icon || o.label}</button>
      ))}
    </div>
  );
}
// Row of compact icon buttons (rotate / flip) — same pill look as Segmented.
function IconBtnRow({ actions }) {
  const last = actions.length - 1;
  return (
    <div className="flex gap-1.5">
      {actions.map((a, i) => (
        <button key={i} type="button" onClick={a.onAction} aria-label={a.aria} title={a.aria}
          aria-pressed={a.active}
          className={[
            "w-[34px] h-[30px] shrink-0 flex items-center justify-center border-0 cursor-pointer transition-colors",
            a.active ? "text-white" : "text-secondary hover:text-primary hover:bg-[var(--surface-3)]",
          ].join(" ")}
          style={{
            borderRadius: hdrCorners(i > 0, i < last, 30),
            background: a.active ? "var(--accent)" : "var(--surface-2)",
          }}
        >{a.icon}</button>
      ))}
    </div>
  );
}

// One entry of the inspector (a fill, a stroke, an effect, the animation) can be selected, as in
// Figma: Ctrl+C then copies that entry instead of the layer, Ctrl+V on another element adds it
// there (or replaces the selected entry of the same kind), Delete removes just it.
const PropSelCtx = createContext(null);
function PropRow({ kind, index = 0, className = "", children }) {
  const ps = useContext(PropSelCtx);
  const on = !!ps?.sel && ps.sel.kind === kind && (ps.sel.index ?? 0) === index;
  return (
    <div data-propsel className={className} onClickCapture={() => { if (!on) ps?.select({ kind, index }); }}
      // A tinted ground rather than an outline, as in Figma: it reads as "this one is picked"
      // without boxing in the fields. The inset is always there, so picking moves nothing.
      style={{
        margin: "-5px -6px", padding: "5px 6px", borderRadius: "var(--r-lg)",
        background: on ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
        transition: "background-color 0.12s",
      }}>
      {children}
    </div>
  );
}

// ── Paints: solid colour or gradient ─────────────────────────────────────────
// A paint is { type: "solid", color, opacity } or { type: "linear" | "radial", stops: [{ color,
// pos }], angle, opacity }; the renderer (server.py, paintCss / svgPaint) draws the same shape.
const gradDefaultStops = (c) => [{ color: c || "#ffffff", pos: 0 }, { color: "#000000", pos: 100 }];
const isGradient = (p) => p?.type === "linear" || p?.type === "radial";
function paintPreviewCss(p) {
  const st = (p.stops && p.stops.length > 1 ? p.stops : gradDefaultStops(p.color))
    .slice().sort((a, b) => (a.pos || 0) - (b.pos || 0)).map((x) => `${resolveColor(x.color)} ${x.pos ?? 0}%`).join(", ");
  return p.type === "radial" ? `radial-gradient(ellipse at center, ${st})` : `linear-gradient(${p.angle ?? 90}deg, ${st})`;
}
function PaintTypeGlyph({ type }) {
  const bg = type === "linear" ? "linear-gradient(90deg, currentColor, transparent)"
    : type === "radial" ? "radial-gradient(circle, currentColor 15%, transparent 75%)" : "currentColor";
  return <span className="inline-block w-3 h-3 shrink-0 rounded-[3px]" style={{ background: bg, boxShadow: "inset 0 0 0 1px currentColor" }} />;
}

// The colour field with a fill-type switch in front of it. For a gradient the field shows the
// gradient itself; its stops and angle are edited below (GradientFields).
function PaintField({ t, paint, onChange, rightNotch = false, opacity, onOpacity }) {
  const type = isGradient(paint) ? paint.type : "solid";
  const setType = (ty) => {
    if (ty === "solid") onChange({ type: "solid" });
    else onChange({ type: ty, stops: paint?.stops?.length > 1 ? paint.stops : gradDefaultStops(paint?.color), angle: paint?.angle ?? 90 });
  };
  const fieldCorners = hdrCorners(true, rightNotch, 30);
  return (
    <div className="flex items-center min-w-0" style={{ gap: HDR_NOTCH }}>
      <Dropdown>
        <DropdownTrigger aria-label={t("ovlPaintType")}
          className="shrink-0 h-[30px] w-[30px] flex items-center justify-center border-0 bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)] cursor-pointer"
          style={{ borderRadius: hdrCorners(false, true, 30) }}>
          <PaintTypeGlyph type={type} />
        </DropdownTrigger>
        <DropdownPopover placement="bottom start" className="[--dd-min-w:11rem]">
          <DropdownMenu aria-label={t("ovlPaintType")} onAction={(k) => setType(String(k))}>
            {["solid", "linear", "radial"].map((v) => (
              <DropdownItem key={v} id={v} textValue={t("ovlPaint_" + v)}>
                <PaintTypeGlyph type={v} />{t("ovlPaint_" + v)}{type === v && <Check size={11} className="ml-auto" />}
              </DropdownItem>
            ))}
          </DropdownMenu>
        </DropdownPopover>
      </Dropdown>
      <div className="flex-1 min-w-0">
        {type === "solid" ? (
          <ColorField corners={fieldCorners} value={paint?.color} onChange={(c) => onChange({ color: c })} opacity={opacity} onOpacity={onOpacity} />
        ) : (
          <div className="h-[30px] flex items-center gap-2 pl-2 pr-3 bg-[var(--surface-2)]" style={{ borderRadius: fieldCorners }}>
            <div className="flex-1 h-[16px] rounded-[var(--r-full)]" style={{ background: paintPreviewCss({ ...paint, type }), boxShadow: "inset 0 0 0 1px var(--border)" }} />
            {onOpacity && (
              <div className="flex items-center shrink-0">
                <input value={opacity ?? 100} onChange={(e) => onOpacity(clamp(parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10), 0, 100))}
                  className="w-7 bg-transparent outline-none text-muted text-right tabular-nums" style={{ fontSize: "var(--t12)" }} aria-label={t("ovlOpacity")} />
                <span className="text-muted" style={{ fontSize: "var(--t12)" }}>%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A gradient's angle (linear) and its colour stops, each a colour and a position.
function GradientFields({ t, paint, onChange }) {
  if (!isGradient(paint)) return null;
  const stops = paint.stops?.length > 1 ? paint.stops : gradDefaultStops(paint.color);
  const setStop = (i, patch) => onChange({ stops: stops.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addStop = () => {
    const sorted = [...stops].sort((a, b) => (a.pos || 0) - (b.pos || 0));
    // Into the widest gap, in the colour of its left end.
    let at = 0, gap = -1;
    for (let i = 0; i < sorted.length - 1; i++) { const g = (sorted[i + 1].pos ?? 0) - (sorted[i].pos ?? 0); if (g > gap) { gap = g; at = i; } }
    const pos = Math.round(((sorted[at].pos ?? 0) + (sorted[at + 1]?.pos ?? 100)) / 2);
    onChange({ stops: [...stops, { color: sorted[at].color, pos }] });
  };
  return (
    <div className="flex flex-col gap-1.5 pl-[36px]">
      {paint.type === "linear" && (
        <PillNum prefix="∠" ariaLabel={t("ovlAngle")} value={paint.angle ?? 90} min={0} max={360} onChange={(v) => onChange({ angle: v })} />
      )}
      {stops.map((st, i) => (
        <div key={i} className="flex items-center" style={{ gap: HDR_NOTCH }}>
          <div className="flex-1 min-w-0"><ColorField corners={hdrCorners(false, true, 30)} value={st.color} onChange={(c) => setStop(i, { color: c })} /></div>
          <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlStopPos")} value={st.pos ?? 0} onChange={(v) => setStop(i, { pos: v })} />
          {stops.length > 2 ? (
            <button type="button" onClick={() => onChange({ stops: stops.filter((_, j) => j !== i) })} aria-label={t("ovlRemove") || "Remove"}
              className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-muted hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
          ) : <span className="w-7 shrink-0" />}
        </div>
      ))}
      <button type="button" onClick={addStop}
        className="self-start h-[26px] px-3 rounded-[var(--r-full)] border-0 bg-transparent text-secondary hover:text-primary hover:bg-[var(--surface-2)] cursor-pointer"
        style={{ fontSize: "var(--t12)" }}>{t("ovlAddStop")}</button>
    </div>
  );
}

// Figma-style fill list: ordered solid paints (index 0 = front). Add / reorder via the
// header "+", toggle visibility (eye), remove (−). Each row edits color + opacity.
function FillList({ t, fills, onChange }) {
  const list = Array.isArray(fills) ? fills : [];
  const set = (i, patch) => onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => onChange([{ id: Math.random().toString(36).slice(2), type: "solid", color: "#ffffff", opacity: 100, visible: true }, ...list]);
  const ps = useContext(PropSelCtx);
  const remove = (i) => { onChange(list.filter((_, j) => j !== i)); ps?.select(null); };
  return (
    <Section title={t("ovlFill")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddFill") || "Add fill"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((f, i) => (
        <PropRow key={f.id || i} kind="fill" index={i} className="group/frow flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><PaintField t={t} paint={f} rightNotch onChange={(patch) => set(i, patch)} /></div>
          <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlOpacity")} value={f.opacity ?? 100} onChange={(o) => set(i, { opacity: o })} />
          <BareIconBtn onPress={() => set(i, { visible: f.visible === false })} label={t("ovlVisible")}>
            {f.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </BareIconBtn>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"} title={t("ovlRemove") || "Remove"}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-muted hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
          </div>
          <GradientFields t={t} paint={f} onChange={(patch) => set(i, patch)} />
        </PropRow>
      ))}
    </Section>
  );
}

// Figma-style stroke list: multiple stroke paints (colour + opacity each) sharing a
// single weight + position. Add via header "+", toggle/remove per row.
function StrokeList({ t, strokes, weight, position, onChange, onWeight, onPosition, positions, title, gradients = false, join, onJoin }) {
  const list = Array.isArray(strokes) ? strokes : [];
  const set = (i, patch) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => onChange([{ id: Math.random().toString(36).slice(2), color: "#ffffff", opacity: 100, visible: true }, ...list]);
  const ps = useContext(PropSelCtx);
  const remove = (i) => { onChange(list.filter((_, j) => j !== i)); ps?.select(null); };
  return (
    <Section title={title || t("ovlStroke") || t("ovlBorder")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddStroke") || "Add stroke"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((s, i) => (
        <PropRow key={s.id || i} kind="stroke" index={i} className="group/srow flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
          {/* A gradient only where the renderer can draw one (the text outline, which is SVG). */}
          <div className="flex-1 min-w-0">{gradients
            ? <PaintField t={t} paint={s} rightNotch onChange={(patch) => set(i, patch)} />
            : <ColorField corners={hdrCorners(false, true, 30)} value={s.color} onChange={(c) => set(i, { color: c })} />}</div>
          <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlOpacity")} value={s.opacity ?? 100} onChange={(o) => set(i, { opacity: o })} />
          <BareIconBtn onPress={() => set(i, { visible: s.visible === false })} label={t("ovlVisible")}>
            {s.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </BareIconBtn>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"} title={t("ovlRemove") || "Remove"}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-muted hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
          </div>
          {gradients && <GradientFields t={t} paint={s} onChange={(patch) => set(i, patch)} />}
        </PropRow>
      ))}
      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-2 items-end">
          <Field label={t("ovlStrokePosition") || "Position"}>
            <SelectField value={position} options={STROKE_POS_OPTS(t).filter((o) => !positions || positions.includes(o.value))} onChange={onPosition} />
          </Field>
          <Field label={t("ovlStrokeWeight") || "Weight"}>
            <PillNum prefix={<OvlStrokeWeight size={12} />} ariaLabel={t("ovlStrokeWeight") || "Weight"} value={weight} min={0} max={40} step={0.5} onChange={onWeight} />
          </Field>
        </div>
      )}
      {list.length > 0 && onJoin && (
        /* Corners, as in Figma: round, sharp (miter) or bevelled. */
        <Field label={t("ovlStrokeJoin")}>
          <SelectField value={join || "round"} onChange={onJoin}
            options={["round", "miter", "bevel"].map((v) => ({ value: v, label: t("ovlStrokeJoin_" + v) }))} />
        </Field>
      )}
    </Section>
  );
}

// Figma-style effects list: add/remove drop-shadow / glow / blur entries (each a small
// card with a type dropdown + its params + visibility/remove). Rendered as a CSS filter
// stack by the engine.
function EffectList({ t, effects, onChange }) {
  const list = Array.isArray(effects) ? effects : [];
  const set = (i, patch) => onChange(list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setType = (i, ty) => onChange(list.map((e, j) => (j === i ? { id: e.id, type: ty, visible: e.visible, ...EFFECT_DEFAULTS[ty] } : e)));
  const add = () => onChange([...list, makeEffect("shadow")]);
  const ps = useContext(PropSelCtx);
  const remove = (i) => { onChange(list.filter((_, j) => j !== i)); ps?.select(null); };
  return (
    <Section title={t("ovlEffects")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddEffect") || "Add effect"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((e, i) => (
        <PropRow key={e.id || i} kind="effect" index={i} className="flex items-start gap-1.5">
          {/* The two actions sit beside the whole effect, not just its first row, so every
              field below lines up with the pill above it. Indenting the parameters instead
              left them offset from the control they belong to, and running them full width
              put them under the eye and the minus. */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <SelectField value={e.type} options={EFFECT_TYPE_OPTS(t)} onChange={(ty) => setType(i, ty)} />
          {(e.type === "shadow" || e.type === "innerShadow") && (<>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0"><ColorField corners={hdrCorners(false, true, 30)} value={e.color} onChange={(c) => set(i, { color: c })} /></div>
              <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlOpacity")} value={e.opacity ?? 50} onChange={(o) => set(i, { opacity: o })} />
            </div>
            <Field label={t("ovlOffset") || "Offset"}>
              <div className="grid grid-cols-2 gap-2">
                <PillNum prefix="X" value={e.x ?? 0} onChange={(v) => set(i, { x: v })} />
                <PillNum prefix="Y" value={e.y ?? 2} onChange={(v) => set(i, { y: v })} />
              </div>
            </Field>
            <Field label={t("ovlBlur")}>
              <PillNum ariaLabel={t("ovlBlur")} value={e.blur ?? 8} min={0} max={60} onChange={(v) => set(i, { blur: v })} />
            </Field>
          </>)}
          {e.type === "glow" && (<>
            <ColorField value={e.color} onChange={(c) => set(i, { color: c })} />
            <Field label={t("ovlBlur")}>
              <PillNum ariaLabel={t("ovlBlur")} value={e.blur ?? 10} min={0} max={60} onChange={(v) => set(i, { blur: v })} />
            </Field>
          </>)}
          {e.type === "blur" && (
            <Field label={t("ovlAmount")}>
              <PillNum ariaLabel={t("ovlAmount")} value={e.amount ?? 4} min={0} max={40} onChange={(v) => set(i, { amount: v })} />
            </Field>
          )}
          </div>
          <BareIconBtn onPress={() => set(i, { visible: e.visible === false })} label={t("ovlVisible")}>
            {e.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </BareIconBtn>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"} title={t("ovlRemove") || "Remove"}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
        </PropRow>
      ))}
    </Section>
  );
}

// The editor pins its own surfaces the same way it pins its own accent: it is a tool, and the
// canvas has to read as a fixed, neutral ground whatever theme the app is in — otherwise the
// colours someone designs an overlay in would be judged against a moving background.
// Zoom limits. The ceiling was 500%, which is exactly where the pixel grid starts — so the
// grid could never actually be used. Single-pixel work wants considerably more room.
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 32;

const CANVAS_BG = "#1e1e1e";

// The shell every floating panel of the editor uses: the canvas card's surface and radius, no
// border, a soft shadow. Panels used to wear an older popover shell (hairline border, 12px
// corners), which read as a different program from the canvas next to them.
const PANEL_SHELL = { background: CANVAS_BG, borderRadius: "var(--r-2xl)", boxShadow: "var(--elevation-4)" };
const PANEL_FOOT = "color-mix(in srgb, #000 22%, " + CANVAS_BG + ")";
const CHECKER = "repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, rgba(255,255,255,0.02) 0% 50%) 0 0/16px 16px";

// A row of chips that belong together: pill on the free ends, the notch where they touch, the
// same rule as the header and the tool row.
function ChipGroup({ items, height = 30 }) {
  const shown = items.filter(Boolean);
  const last = shown.length - 1;
  return (
    <div className="flex items-center shrink-0" style={{ gap: HDR_NOTCH }}>
      {shown.map((it, i) => (
        <button key={it.key} type="button" onClick={it.onPress} disabled={it.disabled} title={it.title}
          aria-label={it.aria || (typeof it.label === "string" ? it.label : undefined)}
          className={[
            "flex items-center justify-center gap-1.5 border-0 cursor-pointer transition-colors whitespace-nowrap",
            "disabled:opacity-40 disabled:cursor-default",
            it.active ? "bg-accent text-white hover:brightness-110"
              : it.danger ? "bg-[var(--surface-2)] text-[var(--status-danger)] hover:bg-[var(--surface-3)]"
              : "bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)]",
          ].join(" ")}
          style={{ height, minWidth: height, padding: it.label ? "0 12px" : 0, borderRadius: hdrCorners(i > 0, i < last, height), fontSize: "var(--t12)" }}>
          {it.icon}{it.label}
          {it.kbd && <span className="opacity-50 ml-1" style={{ fontSize: "var(--t11)" }}>{it.kbd}</span>}
        </button>
      ))}
    </div>
  );
}

// The editor's right-click menu: one component for the canvas, the layers panel and the element
// library, in the panel shell. Items are { key, label, icon, kbd, danger, disabled, onSelect,
// children } or "-" for a divider; an item with children opens a submenu to the side on hover.
// Kept inside the window: measured after it opens and pushed back in from the right and bottom.
function ContextMenu({ menu, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [sub, setSub] = useState(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
    });
    setSub(null);
  }, [menu]);
  if (!menu || !items?.length) return null;
  const row = (it, close) => (
    <button type="button" disabled={it.disabled}
      onClick={() => { if (it.children) return; it.onSelect?.(); close(); }}
      className={`w-full flex items-center gap-2.5 h-8 px-3 rounded-[var(--r-full)] border-0 bg-transparent text-left cursor-pointer disabled:opacity-35 disabled:cursor-default ${it.danger ? "text-[var(--status-danger)]" : "text-primary"} enabled:hover:bg-[var(--surface-2)]`}
      style={{ fontSize: "var(--t12)" }}>
      <span className="w-3.5 shrink-0 flex items-center justify-center text-secondary">{it.icon}</span>
      <span className="flex-1 truncate">{it.label}</span>
      {it.kbd && <span className="text-muted shrink-0" style={{ fontSize: "var(--t11)" }}>{it.kbd}</span>}
      {it.children && <CaretRight size={9} className="text-muted shrink-0" />}
    </button>
  );
  return (
    <div className="fixed inset-0 z-[9998]" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div ref={ref} onPointerDown={(e) => e.stopPropagation()}
        className="absolute p-1 flex flex-col min-w-[220px]"
        style={{ ...PANEL_SHELL, borderRadius: "var(--r-xl)", left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}>
        {items.map((it, i) => (it === "-" ? (
          <div key={"sep" + i} className="h-px my-1 mx-2.5 bg-border" />
        ) : (
          <div key={it.key} className="relative" onMouseEnter={() => setSub(it.children ? it.key : null)}>
            {row(it, onClose)}
            {it.children && sub === it.key && (
              <div className="absolute left-full top-[-4px] ml-1 p-1 flex flex-col min-w-[190px] max-h-[60vh] overflow-y-auto"
                style={{ ...PANEL_SHELL, borderRadius: "var(--r-xl)" }}>
                {it.children.map((c, j) => (c === "-" ? <div key={"s" + j} className="h-px my-1 mx-2.5 bg-border" /> : <div key={c.key}>{row(c, onClose)}</div>))}
              </div>
            )}
          </div>
        )))}
      </div>
    </div>
  );
}

// The editor's search field: a pill with the glass, the text, and a clear button once typed in.
function SearchPill({ value, onChange, placeholder, autoFocus, height = 30, className = "" }) {
  return (
    <div className={`flex items-center gap-2 px-3 bg-[var(--surface-2)] border border-transparent focus-within:border-accent transition-colors ${className}`}
      style={{ height, borderRadius: height / 2 }}>
      <MagnifyingGlass size={12} className="text-muted shrink-0" />
      <input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent outline-none text-primary placeholder:text-muted" style={{ fontSize: "var(--t12)" }} />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear"
          className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full border-0 bg-[var(--surface-3)] text-secondary hover:text-primary cursor-pointer">
          <X size={8} />
        </button>
      )}
    </div>
  );
}

// Toolbar chip height. hdrCorners turns this into the pill radius (half of it), so changing it
// here keeps the group's outer curve correct on its own. At 30 the pill value is 15, the same
// as the header groups.
const TOOL_H = 30;

// One tool in the bottom toolbar. 30px like every other control in the editor, and the active
// state is a filled rounded square — an isIconOnly HeroUI button rounds to a circle, which read
// as a different species of control from everything else here.
function ToolBtn({ active, label, onPress, bare = false, corners, children }) {
  return (
    <Tooltip text={label}>
      <button type="button" onClick={onPress} aria-label={label} aria-pressed={active}
        style={{ height: TOOL_H, borderRadius: bare ? undefined : corners }}
        className={`px-4 flex items-center justify-center border-0 cursor-pointer transition-colors ${
          bare
            ? "bg-transparent text-current hover:brightness-125"
            : active ? "bg-accent text-white" : "bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)]"
        }`}>
        {children}
      </button>
    </Tooltip>
  );
}

// Built once per render rather than written out six times: the row is the same control repeated.
const TOOLBAR_ITEMS = (t) => [
  { key: "select", label: t("ovlSelect") || "Select", icon: <CursorArrow size={16} />, tool: null, isActive: (tool) => !tool },
  { key: "shape", label: TYPE_META.shape.label, icon: <PaintBrushBroad size={16} />, variants: ["rect", "ellipse", "line", "triangle", "polygon", "star"] },
  { key: "text", label: TYPE_META.text.label, icon: <TextSize size={16} />, tool: { type: "text" }, isActive: (tool) => tool?.type === "text" },
  { key: "albumArt", label: TYPE_META.albumArt.label, icon: <VinylRecord size={16} />, tool: { type: "albumArt" }, isActive: (tool) => tool?.type === "albumArt" },
  { key: "progress", label: TYPE_META.progress.label, icon: <WaveformLines size={16} />, tool: { type: "progress" }, isActive: (tool) => tool?.type === "progress" },
  { key: "image", label: TYPE_META.image.label, icon: <ImageSquare size={16} />, tool: { type: "image" }, isActive: (tool) => tool?.type === "image" },
  { key: "shader", label: TYPE_META.shader.label, icon: <Sparkles size={16} />, tool: { type: "shader" }, isActive: (tool) => tool?.type === "shader" },
];

// ── Font Picker trigger (panel is lifted to OverlayEditor level) ──────────────
function FontPicker({ t, value, onOpen }) {
  // Resolve a human-readable label even for locally-installed fonts not in FONT_LIST
  const knownFont = FONT_LIST.find((f) => f.value === value);
  const label = knownFont
    ? knownFont.label
    : value.replace(/'/g, "").split(",")[0].trim() || "System";
  return (
    <Field label={t("ovlFont")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("ovlFont")}
        className="w-full h-[30px] flex items-center justify-between gap-2 px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-transparent hover:border-[rgba(255,255,255,0.12)] focus:border-accent outline-none cursor-pointer transition-colors"
      >
        {/* The name is still set in its own face — that is the one place where previewing the
            choice inside the control genuinely helps. */}
        <span className="min-w-0 truncate text-left text-primary"
          style={{ fontFamily: value, fontSize: "var(--t13)" }}>{label}</span>
        <CaretDown size={11} className="shrink-0 text-secondary" />
      </button>
    </Field>
  );
}

// Per-type styling + data-binding controls (the engine already renders all of these).
function LayerStyleSections({ t, layer, setLayer, setStyle, onPickImage, onOpenFontPicker }) {
  const s = layer.style || {};
  const id = layer.id;
  const radius = s.corners?.TL ?? 0;
  const cornerType = s.corners?.typeTL || "r";
  const setRadius = (v) => setStyle(id, { corners: uniformCorners(v, cornerType) });
  const setCornerType = (v) => setStyle(id, { corners: uniformCorners(radius, v) });
  const setBorder = (patch) => setStyle(id, { border: { ...(s.border || {}), ...patch } });

  if (layer.type === "text") {
    const bind = layer.bind || "static";
    return (<>
      <Section title={t("ovlData")}>
        <SelectField label={t("ovlBind")} value={bind} options={BIND_OPTS(t)} onChange={(v) => setLayer(id, { bind: v })} />
        {bind === "static" && <OvlTextField label={t("ovlContent")} value={s.content} onChange={(v) => setStyle(id, { content: v })} />}
        {bind === "subtitle" && (<>
          <SwitchField label={t("ovlBind_artist")} checked={(s.parts || []).includes("artist")} onChange={(v) => setStyle(id, { parts: togglePart(s.parts, "artist", v) })} />
          <SwitchField label={t("ovlBind_album")} checked={(s.parts || []).includes("album")} onChange={(v) => setStyle(id, { parts: togglePart(s.parts, "album", v) })} />
        </>)}
      </Section>
      <Section title={t("ovlFont")}>
        <FontPicker t={t} value={s.fontFamily || "system-ui, sans-serif"} onOpen={onOpenFontPicker} />
        <NumField label={t("ovlFontSize")} value={s.fontSize} min={6} max={200} onChange={(v) => setStyle(id, { fontSize: v })} />
        <SelectField label={t("ovlWeight")} value={String(s.fontWeight || 400)} options={WEIGHT_OPTS(t)} onChange={(v) => setStyle(id, { fontWeight: Number(v) })} />
      </Section>
      <FillList t={t} fills={s.fills} onChange={(fills) => setStyle(id, { fills })} />
      {/* Outline: outside or centred; the browser cannot draw a stroke inside a glyph. */}
      <StrokeList t={t} title={t("ovlTextOutline")} gradients join={s.strokeJoin} onJoin={(v) => setStyle(id, { strokeJoin: v })} strokes={s.strokes} weight={s.strokeWeight ?? 2}
        position={s.strokePosition === "center" ? "center" : "outside"} positions={["outside", "center"]}
        onChange={(strokes) => setStyle(id, { strokes })}
        onWeight={(v) => setStyle(id, { strokeWeight: v })}
        onPosition={(v) => setStyle(id, { strokePosition: v })} />
      <Section title={t("ovlAlign")}>
        <div className="grid grid-cols-2 gap-1.5">
          <SelectField label={t("ovlAlign")} value={s.align || "left"} options={ALIGN_OPTS(t)} onChange={(v) => setStyle(id, { align: v })} />
          <SelectField label={t("ovlVAlign")} value={s.valign || "top"} options={VALIGN_OPTS(t)} onChange={(v) => setStyle(id, { valign: v })} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label={t("ovlLineHeight")} value={s.lineHeight ?? 1.3} min={0.5} max={3} step={0.1} onChange={(v) => setStyle(id, { lineHeight: v })} />
          <NumField label={t("ovlLetterSpacing")} value={s.letterSpacing ?? 0} min={-5} max={20} step={0.5} onChange={(v) => setStyle(id, { letterSpacing: v })} />
        </div>
        <NumField label={t("ovlMaxLines")} value={s.maxLines ?? 1} min={1} max={10} onChange={(v) => setStyle(id, { maxLines: v })} />
      </Section>
      <Section title={t("ovlMarquee")}>
        <SwitchField label={t("ovlMarquee")} checked={s.marquee} onChange={(v) => setStyle(id, { marquee: v })} />
        {s.marquee && <SelectField label={t("ovlMarqueeMode")} value={s.marqueeMode || "bounce"}
          options={[{ value: "bounce", label: t("ovlMarquee_bounce") }, { value: "loop", label: t("ovlMarquee_loop") }]}
          onChange={(v) => setStyle(id, { marqueeMode: v })} />}
        {s.marquee && <NumField label={t("ovlSpeed")} value={s.marqueeSpeed ?? 80} min={10} max={300} step={10} onChange={(v) => setStyle(id, { marqueeSpeed: v })} />}
      </Section>
    </>);
  }
  if (layer.type === "albumArt") {
    return (<Section title={t("ovlStyle")}>
      <SelectField label={t("ovlQuality")} value={s.quality || "low"} options={QUALITY_OPTS(t)} onChange={(v) => setStyle(id, { quality: v })} />
      <SelectField label={t("ovlFit")} value={s.fit || "cover"} options={FIT_OPTS()} onChange={(v) => setStyle(id, { fit: v })} />
      <ColorField label={t("ovlPlaceholder")} value={s.placeholderBg} onChange={(v) => setStyle(id, { placeholderBg: v })} />
    </Section>);
  }
  if (layer.type === "progress") {
    const ps = s.progressStyle || "bar";
    const anim = s.progressAnim || "none";
    // Which effects a look can carry: the line looks take all of them; segments and dots only
    // those that work on many small parts.
    const animOpts = ["none", "cane", "shimmer", "breathe", "rainbow", "comet", "pulse"]
      .filter((v) => ps === "wave" ? v === "none" : (ps === "segments" || ps === "dots") ? ["none", "cane", "breathe", "rainbow"].includes(v) : true)
      .map((v) => ({ value: v, label: t("ovlProgAnim_" + v) }));
    return (<>
      <Section title={t("ovlStyle")}>
        <SelectField label={t("ovlProgStyle")} value={ps} onChange={(v) => setStyle(id, { progressStyle: v })}
          options={["bar", "knob", "glow", "segments", "dots", "wave"].map((v) => ({ value: v, label: t("ovlProgStyle_" + v) }))} />
        {(() => {
          // The progress fill keeps its flat keys; mapped to a paint here and back.
          const paint = { type: s.fillType || "solid", color: s.fillColor, stops: s.fillStops, angle: s.fillAngle };
          const toStyle = (patch) => {
            const out = {};
            if ("type" in patch) out.fillType = patch.type;
            if ("color" in patch) out.fillColor = patch.color;
            if ("stops" in patch) out.fillStops = patch.stops;
            if ("angle" in patch) out.fillAngle = patch.angle;
            setStyle(id, out);
          };
          return (<>
            <PaintField t={t} paint={paint} onChange={toStyle} opacity={s.fillOpacity ?? 100} onOpacity={(v) => setStyle(id, { fillOpacity: v })} />
            <GradientFields t={t} paint={paint} onChange={toStyle} />
          </>);
        })()}
        <ColorField label={t("ovlTrackColor")} value={s.trackColor} onChange={(v) => setStyle(id, { trackColor: v })} />
        {(ps === "knob" || ps === "glow" || ps === "wave") && (
          <NumField label={t("ovlProgLine")} value={s.lineWidth ?? (ps === "glow" ? 2 : 4)} min={1} max={40} onChange={(v) => setStyle(id, { lineWidth: v })} />
        )}
        {ps === "knob" && (<>
          <NumField label={t("ovlProgKnobSize")} value={s.knobSize ?? layer.h} min={2} max={80} onChange={(v) => setStyle(id, { knobSize: v })} />
          <ColorField label={t("ovlProgKnobColor")} value={s.knobColor || "#ffffff"} onChange={(v) => setStyle(id, { knobColor: v })} />
        </>)}
        {ps === "glow" && <NumField label={t("ovlProgGlow")} value={s.glow ?? 8} min={0} max={40} onChange={(v) => setStyle(id, { glow: v })} />}
        {(ps === "segments" || ps === "dots") && (
          <NumField label={ps === "dots" ? t("ovlProgDots") : t("ovlProgSegments")} value={s.segCount ?? (ps === "dots" ? 16 : 10)} min={2} max={60} onChange={(v) => setStyle(id, { segCount: v })} />
        )}
        {ps === "segments" && <NumField label={t("ovlProgGap")} value={s.segGap ?? 4} min={0} max={40} onChange={(v) => setStyle(id, { segGap: v })} />}
        {ps === "dots" && <NumField label={t("ovlProgDotSize")} value={s.dotSize ?? Math.round(layer.h * 0.5)} min={2} max={40} onChange={(v) => setStyle(id, { dotSize: v })} />}
        {ps === "wave" && (<>
          <NumField label={t("ovlProgWaveAmp")} value={s.waveAmp ?? Math.max(1, Math.round((layer.h - (s.lineWidth ?? 4)) / 2))} min={0} max={40} onChange={(v) => setStyle(id, { waveAmp: v })} />
          <NumField label={t("ovlProgWaveLength")} value={s.waveLength ?? 36} min={8} max={200} onChange={(v) => setStyle(id, { waveLength: v })} />
          <NumField label={t("ovlSpeed")} value={s.waveSpeed ?? 4} min={0} max={20} step={0.5} onChange={(v) => setStyle(id, { waveSpeed: v })} />
        </>)}
      </Section>
      {ps !== "wave" && (
        <Section title={t("ovlProgAnim")}>
          <SelectField value={animOpts.some((o) => o.value === anim) ? anim : "none"} options={animOpts} onChange={(v) => setStyle(id, { progressAnim: v })} />
          {anim !== "none" && anim !== "pulse" && (
            <NumField label={t("ovlProgAnimSpeed")} value={s.progressAnimSpeed ?? 1} min={0.2} max={5} step={0.1} onChange={(v) => setStyle(id, { progressAnimSpeed: v })} />
          )}
        </Section>
      )}
    </>);
  }
  if (layer.type === "shader") {
    const cols = Array.isArray(s.shaderColors) && s.shaderColors.length ? s.shaderColors : ["#7c4dff", "#e040fb", "#00e5ff"];
    const setCol = (i, c) => setStyle(id, { shaderColors: [0, 1, 2].map((j) => (j === i ? c : cols[j] || cols[cols.length - 1])) });
    return (<>
      <Section title={t("ovlShader")} right={
        <span className="px-2 h-[18px] inline-flex items-center rounded-[var(--r-full)] bg-[var(--surface-2)] text-muted" style={{ fontSize: "var(--t11)" }}>{t("ovlExperimental")}</span>}>
        <SelectField label={t("ovlShaderPreset")} value={SHADER_PRESETS.includes(s.preset) ? s.preset : "aurora"}
          options={SHADER_PRESETS.map((v) => ({ value: v, label: t("ovlShader_" + v) }))} onChange={(v) => setStyle(id, { preset: v })} />
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label={t("ovlSpeed")} value={s.speed ?? 1} min={0} max={5} step={0.1} onChange={(v) => setStyle(id, { speed: v })} />
          <NumField label={t("ovlShaderScale")} value={s.scale ?? 1} min={0.25} max={4} step={0.05} onChange={(v) => setStyle(id, { scale: v })} />
        </div>
        <SwitchField label={t("ovlShaderReactive")} checked={!!s.reactive} onChange={(v) => setStyle(id, { reactive: v })} />
        {s.reactive && <NumField label={t("ovlShaderReactAmount")} value={s.reactAmount ?? 100} min={0} max={300} step={10} onChange={(v) => setStyle(id, { reactAmount: v })} />}
        {(s.reactive || s.preset === "equalizer") && <p className="m-0 text-muted" style={{ fontSize: "var(--t11)" }}>{t("ovlShaderReactiveHint")}</p>}
      </Section>
      <Section title={t("ovlShaderColors")}>
        {[0, 1, 2].map((i) => (
          <ColorField key={i} value={cols[i] || cols[cols.length - 1]} onChange={(c) => setCol(i, c)} />
        ))}
      </Section>
    </>);
  }
  if (layer.type === "image") {
    return (<Section title={t("ovlStyle")}>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onPress={onPickImage}>{t("ovlChooseImage")}</Button>
        {s.src && <Button variant="ghost" size="sm" onPress={() => setStyle(id, { src: "" })}>{t("ovlClearImage")}</Button>}
      </div>
      <SelectField label={t("ovlFit")} value={s.fit || "contain"} options={FIT_OPTS()} onChange={(v) => setStyle(id, { fit: v })} />
    </Section>);
  }
  if (layer.type === "shape") {
    const shp = s.shape || "rect";
    const isLine = shp === "line";
    return (<>
      <Section title={t("ovlStyle")}>
        <SelectField label={t("ovlShape")} value={shp} options={SHAPE_OPTS(t)} onChange={(v) => {
          if (v === "circle") setLayer(id, { h: layer.w });
          const patch = { shape: v };
          if (v === "line" && s.strokeWidth == null) patch.strokeWidth = 4;
          setStyle(id, patch);
        }} />
        {shp === "polygon" && <NumField label={t("ovlSides")} value={s.sides ?? 6} min={3} max={12} onChange={(v) => setStyle(id, { sides: v })} />}
        {shp === "star" && (<>
          <div className="grid grid-cols-2 gap-1.5">
            <NumField label={t("ovlPoints")} value={s.points ?? 5} min={3} max={12} onChange={(v) => setStyle(id, { points: v })} />
            <NumField label={t("ovlInnerRatio")} value={Math.round((s.innerRatio ?? 0.5) * 100)} min={10} max={90} onChange={(v) => setStyle(id, { innerRatio: clamp(v / 100, 0.1, 0.9) })} />
          </div>
        </>)}
        {isLine && (<>
          <NumField label={t("ovlThickness")} value={s.strokeWidth ?? 4} min={1} max={200} onChange={(v) => setStyle(id, { strokeWidth: v })} />
          <SelectField label={t("ovlLineCap")} value={s.lineCap || "round"} options={CAP_OPTS(t)} onChange={(v) => setStyle(id, { lineCap: v })} />
        </>)}
      </Section>
      <FillList t={t} fills={s.fills} onChange={(fills) => setStyle(id, { fills })} />
      {!isLine && (
        <StrokeList t={t} strokes={s.strokes} weight={s.strokeWeight ?? 1.5} position={s.strokePosition || "inside"}
          onChange={(strokes) => setStyle(id, { strokes })}
          onWeight={(v) => setStyle(id, { strokeWeight: v })}
          onPosition={(v) => setStyle(id, { strokePosition: v })} />
      )}
    </>);
  }
  return null;
}

// Per-layer effects (Figma-style add/remove list) + entrance & loop animations.
// Entrance and loop for a group, the same choices a layer has, plus a stagger: the group's
// contents come in one after another instead of all at once. Stored on the group (`fx`), which
// the renderer reads to give an animated group an element of its own.
function GroupAnimationSection({ t, group, onChange, onReplay }) {
  const fx = group.fx || {};
  const setFx = (key, patch) => onChange({ fx: { ...fx, [key]: { ...(fx[key] || {}), ...patch } } });
  const entOn = fx.entrance?.type && fx.entrance.type !== "none";
  const loopOn = fx.loop?.type && fx.loop.type !== "none";
  return (
    <PropRow kind="animation">
    <Section title={t("ovlAnimation") || "Animation"} right={entOn ? <ReplayButton t={t} onReplay={onReplay} /> : null}>
      <Field label={t("ovlEntrance")}>
        <SelectField value={fx.entrance?.type || "none"} options={ENTRANCE_OPTS(t)} onChange={(v) => setFx("entrance", { type: v })} />
      </Field>
      {entOn && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ovlDuration")}>
            <PillNum ariaLabel={t("ovlDuration")} value={fx.entrance?.duration ?? 0.5} min={0.1} max={3} step={0.1} onChange={(v) => setFx("entrance", { duration: v })} />
          </Field>
          <Field label={t("ovlDelay")}>
            <PillNum ariaLabel={t("ovlDelay")} value={fx.entrance?.delay ?? 0} min={0} max={10} step={0.1} onChange={(v) => setFx("entrance", { delay: v })} />
          </Field>
          <Field label={t("ovlStagger")}>
            <PillNum ariaLabel={t("ovlStagger")} value={fx.entrance?.stagger ?? 0} min={0} max={2} step={0.05} onChange={(v) => setFx("entrance", { stagger: v })} />
          </Field>
        </div>
      )}
      <Field label={t("ovlLoop")}>
        <SelectField value={fx.loop?.type || "none"} options={LOOP_OPTS(t)} onChange={(v) => setFx("loop", { type: v })} />
      </Field>
      {loopOn && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ovlSpeed")}>
            <PillNum ariaLabel={t("ovlSpeed")} value={fx.loop?.speed ?? 2} min={0.3} max={10} step={0.1} onChange={(v) => setFx("loop", { speed: v })} />
          </Field>
          <Field label={t("ovlDelay")}>
            <PillNum ariaLabel={t("ovlDelay")} value={fx.loop?.delay ?? 0} min={0} max={10} step={0.1} onChange={(v) => setFx("loop", { delay: v })} />
          </Field>
        </div>
      )}
    </Section>
    </PropRow>
  );
}

// Entrances do not play in the editor, where every change rebuilds the preview; this plays them once.
function ReplayButton({ t, onReplay }) {
  return (
    <Tooltip text={t("ovlReplay")}>
      <Button variant="ghost" size="sm" isIconOnly onPress={onReplay} aria-label={t("ovlReplay")} className="h-7! w-7! min-w-0!">
        <Play size={12} weight="fill" />
      </Button>
    </Tooltip>
  );
}

function LayerEffectsSection({ t, layer, setStyle, onReplay }) {
  const s = layer.style || {};
  const id = layer.id;
  const fx = s.fx || {};
  const setFx = (key, patch) => setStyle(id, { fx: { ...fx, [key]: { ...(fx[key] || {}), ...patch } } });
  return (<>
    <EffectList t={t} effects={s.effects} onChange={(effects) => setStyle(id, { effects })} />
    <PropRow kind="animation">
    <Section title={t("ovlAnimation") || "Animation"}
      right={fx.entrance?.type && fx.entrance.type !== "none" ? <ReplayButton t={t} onReplay={onReplay} /> : null}>
      {/* Named blocks, like the rest of the panel. The duration and speed appear only once
          their animation is set to something, so an unused section stays two fields. */}
      <Field label={t("ovlEntrance")}>
        <SelectField value={fx.entrance?.type || "none"} options={ENTRANCE_OPTS(t)} onChange={(v) => setFx("entrance", { type: v })} />
      </Field>
      {fx.entrance?.type && fx.entrance.type !== "none" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ovlDuration")}>
            <PillNum ariaLabel={t("ovlDuration")} value={fx.entrance?.duration ?? 0.5} min={0.1} max={3} step={0.1} onChange={(v) => setFx("entrance", { duration: v })} />
          </Field>
          <Field label={t("ovlDelay")}>
            <PillNum ariaLabel={t("ovlDelay")} value={fx.entrance?.delay ?? 0} min={0} max={10} step={0.1} onChange={(v) => setFx("entrance", { delay: v })} />
          </Field>
        </div>
      )}
      <Field label={t("ovlLoop")}>
        <SelectField value={fx.loop?.type || "none"} options={LOOP_OPTS(t)} onChange={(v) => setFx("loop", { type: v })} />
      </Field>
      {fx.loop?.type && fx.loop.type !== "none" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("ovlSpeed")}>
            <PillNum ariaLabel={t("ovlSpeed")} value={fx.loop?.speed ?? 2} min={0.3} max={10} step={0.1} onChange={(v) => setFx("loop", { speed: v })} />
          </Field>
          <Field label={t("ovlDelay")}>
            <PillNum ariaLabel={t("ovlDelay")} value={fx.loop?.delay ?? 0} min={0} max={10} step={0.1} onChange={(v) => setFx("loop", { delay: v })} />
          </Field>
        </div>
      )}
    </Section>
    </PropRow>
  </>);
}

// A real thumbnail of a saved design: the same engine that drives OBS, loaded in still mode
// (no live stream, no active config) and fed the saved document by postMessage, then scaled to
// fit the card. Nothing here is a second implementation of the renderer, so what the card shows
// is exactly what the design produces.
function DesignPreview({ apiBase, doc: rawDoc, box, pad = 16, maxScale = 1 }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  // Same normalisation applyProfile does. Without it a design saved in the older format is
  // handed to the engine in a shape it does not understand and the card stays blank.
  const doc = useMemo(() => normalizeOverlayDoc(rawDoc), [rawDoc]);
  const cw = doc?.canvas?.width || 480;
  const ch = doc?.canvas?.height || 120;
  // 16px of breathing room inside the card, and never blown up past 1:1.
  const scale = Math.max(0.01, Math.min((box.w - 2 * pad) / cw, (box.h - 2 * pad) / ch, maxScale));

  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage({ __overlayDoc: doc }, "*");
  }, [ready, doc]);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div style={{ width: cw * scale, height: ch * scale }}>
        <iframe
          ref={ref}
          onLoad={() => setReady(true)}
          src={`${apiBase}/overlay?editor=1&still=1`}
          title=""
          tabIndex={-1}
          scrolling="no"
          style={{
            width: cw, height: ch, border: 0, display: "block",
            transform: `scale(${scale})`, transformOrigin: "top left",
            pointerEvents: "none",
            // The editor runs in a dark colour scheme, the engine page declares none. When the two
            // differ, Chromium paints the frame opaque white behind the page, which showed as white
            // corners and gaps in every preview. Matching the scheme keeps the frame see-through.
            colorScheme: "normal",
          }}
        />
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
export default function OverlayEditor({
  t, apiBase,
  standalone = false,
}) {
  const [doc, setDoc] = useState(loadInitialDoc);
  const [selectedIds, setSelectedIds] = useState([]);
  setCoverText(t);
  // The preview reports the cover's colours as it computes them; every colour field shows them.
  useEffect(() => {
    const onMsg = (e) => { if (e.data && e.data.__overlayCoverPal) setCoverPalette(e.data.__overlayCoverPal); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  // `selectedId` (compat) is the single selection — non-null only when exactly one layer is
  // selected, so the detailed inspector + resize/rotate handles show for single selection.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const setSelectedId = (id) => setSelectedIds(id == null ? [] : [id]);
  // Editor preferences. Every one of these switches behaviour that used to be wired shut:
  // snapping could not be turned off at all, which fights you when placing something by eye,
  // and the tool always fell back to select after one use. Persisted per key so the menu and
  // the behaviour cannot drift apart.
  const [prefs, setPrefs] = useState(() => {
    const read = (k, d) => { const v = localStorage.getItem("kiyoshi-ovl-" + k); return v == null ? d : v === "true"; };
    return {
      snap:       read("snap", true),
      snapRotate: read("snapRotate", true),
      keepTool:   read("keepTool", false),
      showDims:   read("showDims", true),
      invertZoom: read("invertZoom", false),
      showLeft:   read("showLeft", true),
      showRight:  read("showRight", true),
      showGrid:   read("showGrid", false),
      nudge:      parseInt(localStorage.getItem("kiyoshi-ovl-nudge") || "1", 10) || 1,
      nudgeBig:   parseInt(localStorage.getItem("kiyoshi-ovl-nudgeBig") || "10", 10) || 10,
    };
  });
  const setPref = useCallback((key, value) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    localStorage.setItem("kiyoshi-ovl-" + key, String(value));
  }, []);

  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [tool, setTool] = useState(null);     // null = select; { type, shape? } = draw mode
  const [drawRect, setDrawRect] = useState(null); // live preview while drawing
  const [marquee, setMarquee] = useState(null);   // left-drag selection box (canvas coords)
  const [hoveredId, setHoveredId] = useState(null); // canvas hover → show grey outline only then
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem("ovl-left-w")) || 184);   // layers panel width
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("ovl-right-w")) || 248); // inspector width
  useEffect(() => { localStorage.setItem("ovl-left-w", String(leftW)); }, [leftW]);
  useEffect(() => { localStorage.setItem("ovl-right-w", String(rightW)); }, [rightW]);
  // Drag a panel's inner edge to resize it (Figma-style). `side` is which panel.
  const startPanelResize = (side, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === "left" ? leftW : rightW;
    const move = (ev) => {
      const delta = side === "left" ? (ev.clientX - startX) : (startX - ev.clientX);
      const w = Math.max(160, Math.min(420, startW + delta));
      (side === "left" ? setLeftW : setRightW)(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const [aspectLock, setAspectLock] = useState(false);
  const aspectLockRef = useRef(false);
  const [canvasCornersInd, setCanvasCornersInd] = useState(false); // uniform ↔ per-corner radius (canvas)
  const [layerCornersInd, setLayerCornersInd] = useState(false); // uniform ↔ per-corner radius (layer)
  aspectLockRef.current = aspectLock;
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);   // gap the drop line sits in
  const suppressLayerClickRef = useRef(false);
  const dragIdRef = useRef(null);       // stable refs for pointer event closures
  const dropIndexRef = useRef(null);
  const [profiles, setProfiles] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kiyoshi-overlay-profiles") || "[]"); } catch { return []; }
  });
  const [browserOpen, setBrowserOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [snapLines, setSnapLines] = useState({ x: null, y: null });
  const [rotAngle, setRotAngle] = useState(null); // { deg, snapped } while rotating
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontPickerSearch, setFontPickerSearch] = useState("");
  const [fontPickerCategory, setFontPickerCategory] = useState("all");
  const [fontHover, setFontHover] = useState(null);   // the font under the pointer, previewed but not applied
  // The last fonts picked, newest first, across sessions.
  const [recentFonts, setRecentFonts] = useState(() => { try { const a = JSON.parse(localStorage.getItem("kodama-ovl-recent-fonts") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } });
  // The font panel floats and can be dragged, like the colour picker. Its position survives
  // closing and reopening, so once it is out of the way it stays out of the way.
  const fontPanelRef = useRef(null);
  const [fontPickerPos, setFontPickerPos] = useState({ top: 88, left: 0 });
  const startFontPanelDrag = useCallback((e) => {
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault();
    const rect = fontPanelRef.current.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    const move = (ev) => setFontPickerPos({
      left: Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - ox)),
      top: Math.max(8, Math.min(window.innerHeight - rect.height - 8, ev.clientY - oy)),
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
  }, []);
  const [localFonts, setLocalFonts] = useState(null); // null = not yet fetched

  const [viewportRef, viewportSize] = useElementSize();
  const iframeRef = useRef(null);
  const rafRef = useRef(0);
  const didFit = useRef(false);
  const nudgeTimer = useRef(0);
  const nudgeActive = useRef(false);
  const liveDocRef = useRef(null); // accumulates the doc across a keyboard-nudge burst

  const previewSrc = `${apiBase}/overlay?bg=checkered&editor=1`;

  const pushDoc = useCallback((next) => {
    localStorage.setItem("kiyoshi-overlay-doc", JSON.stringify(next));
    fetch(`${apiBase}/overlay/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
  }, [apiBase]);

  // Throttled live preview into the iframe (no backend hit) during drag.
  const liveToIframe = useCallback((d) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const w = iframeRef.current?.contentWindow;
      if (w) w.postMessage({ __overlayDoc: d }, "*");
    });
  }, []);

  // Flush any in-progress live-edit burst (persist its final doc, end the burst).
  const flushLive = useCallback(() => {
    if (nudgeActive.current && liveDocRef.current) pushDoc(liveDocRef.current);
    clearTimeout(nudgeTimer.current); nudgeActive.current = false; liveDocRef.current = null;
  }, [pushDoc]);

  // Live edit: continuous edits (typing, color drag, sliders, nudging) coalesce
  // into ONE undo step (history captured at burst start) + one debounced POST.
  const liveEditRef = useRef(null);
  liveEditRef.current = (producer) => {
    const base = liveDocRef.current || doc;
    const next = producer(base);
    if (!next) return;
    if (!nudgeActive.current) { nudgeActive.current = true; setPast((p) => [...p.slice(-60), base]); setFuture([]); }
    liveDocRef.current = next;
    setDoc(next); liveToIframe(next);
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => { nudgeActive.current = false; liveDocRef.current = null; pushDoc(next); }, 350);
  };
  const liveEdit = (producer) => liveEditRef.current(producer);

  // Commit: history + persist + push (used by add/delete, switches, undo).
  const commit = useCallback((next, prev) => {
    // Every structural change goes through here, so this is the one place that keeps a group's
    // members together and drops a group whose last member was deleted.
    next = tidyGroups(next);
    flushLive();
    setPast((p) => [...p.slice(-60), prev ?? doc]);
    setFuture([]);
    setDoc(next);
    pushDoc(next);
  }, [doc, pushDoc, flushLive]);

  // Sync to backend on mount so the preview matches immediately.
  useEffect(() => { pushDoc(doc); /* eslint-disable-next-line */ }, []);

  // Fit once the viewport is measured.
  const fit = useCallback((d = doc, vp = viewportSize) => {
    if (!vp.w || !vp.h) return;
    const W = d.canvas.width || 1, H = d.canvas.height || 1, padPx = 96;
    const z = clamp(Math.min((vp.w - padPx) / W, (vp.h - padPx) / H), ZOOM_MIN, 3);
    setZoom(z); setPan({ x: (vp.w - W * z) / 2, y: (vp.h - H * z) / 2 });
  }, [doc, viewportSize]);
  useEffect(() => {
    if (!didFit.current && viewportSize.w > 0) { didFit.current = true; fit(); }
  }, [viewportSize, fit]);

  const selected = doc.layers.find((l) => l.id === selectedId) || null;
  const orderedAsc = [...doc.layers].sort((a, b) => (a.z || 0) - (b.z || 0)); // paint order (hit-test top = last)

  // The layers panel: group headers with their members under them (see groups.js).
  const panelRows = useMemo(() => buildRows(doc), [doc]);
  const layerById = useMemo(() => new Map(doc.layers.map((l) => [l.id, l])), [doc.layers]);
  const selGroup = selectedGroup(doc, selectedIds);

  // Drag-and-drop reorder. Takes the position to insert AT, counted in gaps between rows
  // (0 = above the first row, length = below the last), rather than "the row I happen to be
  // over": dropping onto a row cannot say whether you meant above or below it. Between two
  // members of a group a layer joins it; anywhere else it stands on its own.
  const dropRowAt = useCallback((drag, gap) => {
    const next = dropRow(doc, buildRows(doc), drag, gap);
    if (next !== doc) commit(next);
  }, [doc, commit]);

  // Stable ref so pointer-event closures always call the latest dropRowAt.
  const dropRowRef = useRef(null);
  dropRowRef.current = dropRowAt;

  // Pointer-based drag sort (HTML5 drag-and-drop is unreliable in WebView2/WebKit).
  const onRowPointerDown = useCallback((e, drag) => {
    const id = drag.kind === "group" ? `g:${drag.gid}` : drag.id;
    if (e.button !== 0) return;
    const startY = e.clientY, startX = e.clientX;
    let dragging = false;
    dragIdRef.current = null;
    dropIndexRef.current = null;

    const onMove = (ev) => {
      // Only become a drag once the pointer has actually travelled: without this every click
      // that selects a layer would also start one.
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 4 && Math.abs(ev.clientX - startX) < 4) return;
        dragging = true;
        dragIdRef.current = id;
        setDragId(id);
      }
      // Which gap is the pointer nearest? Upper half of a row means above it, lower half below.
      const rows = Array.from(document.querySelectorAll("[data-layer-index]"));
      let idx = rows.length;
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { idx = Number(el.dataset.layerIndex); break; }
      }
      if (idx !== dropIndexRef.current) {
        dropIndexRef.current = idx;
        setDropIndex(idx);
      }
    };

    const onUp = () => {
      const fromId = dragIdRef.current;
      const at = dropIndexRef.current;
      if (fromId && at != null) {
        dropRowRef.current?.(drag, at);
        // The click event still follows a pointerup; swallow it so the drop does not also
        // count as a selection of whatever ended up under the cursor.
        suppressLayerClickRef.current = true;
      }
      dragIdRef.current = null;
      dropIndexRef.current = null;
      setDragId(null);
      setDropIndex(null);
      window.removeEventListener("pointermove", onMove);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────────
  // Continuous inspector edits → liveEdit (smooth, coalesced undo + debounced POST).
  const updateCanvas = (patch) => liveEdit((b) => ({ ...b, canvas: { ...b.canvas, ...patch } }));
  const updateCanvasBg = (patch) => liveEdit((b) => ({ ...b, canvas: { ...b.canvas, bg: { ...b.canvas.bg, ...patch } } }));
  const updateCanvasSub = (key, patch) => liveEdit((b) => ({ ...b, canvas: { ...b.canvas, [key]: { ...b.canvas[key], ...patch } } }));
  const setLayer = (id, patch) => liveEdit((b) => ({ ...b, layers: b.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const setStyle = (id, patch) => liveEdit((b) => ({ ...b, layers: b.layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...patch } } : l)) }));
  // Discrete toggles commit immediately.
  const toggleLayer = (id, patch) => commit({ ...doc, layers: doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }, doc);
  const addLayer = (type, stylePatch) => {
    const f = LAYER_FACTORIES[type]; if (!f) return;
    const base = f();
    const maxZ = doc.layers.reduce((m, l) => Math.max(m, l.z || 0), -1);
    const nl = { ...base, z: maxZ + 1, x: Math.round((doc.canvas.width - base.w) / 2), y: Math.round((doc.canvas.height - base.h) / 2) };
    if (type === "text") { nl.bind = "static"; nl.style = { ...nl.style, content: "Text" }; }
    if (stylePatch) {
      nl.style = { ...nl.style, ...stylePatch };
      if (stylePatch.shape === "circle") nl.h = nl.w;               // circle = square bounds
      if (stylePatch.shape === "line" && nl.style.strokeWidth == null) nl.style.strokeWidth = 4;
    }
    commit({ ...doc, layers: [...doc.layers, nl] }, doc);
    setSelectedId(nl.id); setAddOpen(false);
    return nl.id;
  };
  const deleteLayer = (id) => { commit({ ...doc, layers: doc.layers.filter((l) => l.id !== id) }, doc); setSelectedId(null); };
  const deleteSelected = () => {
    const del = new Set(doc.layers.filter((l) => selectedIds.includes(l.id) && !l.locked).map((l) => l.id));
    if (!del.size) return;
    commit({ ...doc, layers: doc.layers.filter((l) => !del.has(l.id)) }, doc);
    setSelectedIds([]);
  };
  // Works on the whole selection, so a selected group duplicates as a new group. One element of
  // a group duplicates into that same group.
  const duplicateSelected = useCallback(() => {
    const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
    if (!picked.length) return;
    const topZ = doc.layers.reduce((m, l) => Math.max(m, l.z || 0), 0);
    const { clones, newGroups } = cloneLayers(doc, picked, { offset: 20, topZ, makeLayerId: () => crypto.randomUUID() });
    const anchor = picked.reduce((a, l) => ((l.z || 0) > (a.z || 0) ? l : a), picked[0]);
    commit(placeAbove({ ...doc, layers: [...doc.layers, ...clones], groups: [...groupsOf(doc), ...newGroups] }, clones.map((c) => c.id), anchor.id), doc);
    setSelectedIds(clones.map((c) => c.id));
  }, [doc, selectedIds, commit]);

  // An editor-local clipboard rather than the system one: layers are a structure, not text,
  // and serialising them through the OS clipboard would only buy pasting into a foreign app
  // that could not read them anyway.
  const clipboardRef = useRef([]);
  const saveActionsRef = useRef({});        // Save / Save as, defined further down with the profiles
  const libActionsRef = useRef({});         // element library, defined further down
  const clipboardGroupsRef = useRef([]);   // names of the groups the copied layers were in
  // The entry selected in the inspector, the entry copied from it, and which of the two
  // clipboards Ctrl+V should use: whatever was copied last.
  const [selProp, setSelProp] = useState(null);
  const propItemRef = useRef(null);
  const lastCopyRef = useRef("layers");
  const selKey = selectedIds.join(",");
  useEffect(() => { setSelProp(null); }, [selKey]);
  const propSelValue = useMemo(() => ({ sel: selProp, select: setSelProp }), [selProp]);
  // "Copy properties": how one layer or group looks, kept apart from the layer clipboard so
  // copying a look does not throw away copied layers and the other way round.
  const [propsClip, setPropsClip] = useState(null);
  const pasteCountRef = useRef(0);

  const copySelected = useCallback(() => {
    const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
    if (!picked.length) return false;
    // Deep-cloned on copy, not on paste: otherwise editing the original before pasting would
    // quietly change what lands.
    clipboardRef.current = picked.map((l) => JSON.parse(JSON.stringify(l)));
    clipboardGroupsRef.current = groupsOf(doc);
    lastCopyRef.current = "layers";
    pasteCountRef.current = 0;
    return true;
  }, [doc, selectedIds]);

  const cutSelected = useCallback(() => {
    if (copySelected()) deleteSelected();
  }, [copySelected]); // eslint-disable-line react-hooks/exhaustive-deps

  const pasteClipboard = useCallback(() => {
    const items = clipboardRef.current;
    if (!items.length) return;
    // Each successive paste steps further, so repeated pastes fan out instead of stacking on
    // one another where only the top one can be grabbed.
    pasteCountRef.current += 1;
    const off = 20 * pasteCountRef.current;
    const topZ = doc.layers.reduce((m, l) => Math.max(m, l.z || 0), 0);
    const { clones, newGroups } = cloneLayers(doc, items, {
      offset: off, topZ, makeLayerId: () => crypto.randomUUID(), groups: clipboardGroupsRef.current,
    });
    commit({ ...doc, layers: [...doc.layers, ...clones], groups: [...groupsOf(doc), ...newGroups] }, doc);
    setSelectedIds(clones.map((c) => c.id));
  }, [doc, commit]);

  const copySelectedProps = () => { const c = copyProps(doc, selectedIds); if (c) setPropsClip(c); };
  const pasteSelectedProps = (what = "all") => {
    if (!propsClip || !selectedIds.length) return;
    const next = pasteProps(doc, selectedIds, propsClip, what);
    if (next !== doc) commit(next, doc);
  };
  const canCopyProps = !!copyProps(doc, selectedIds);

  const groupSelected = useCallback(() => {
    const ids = doc.layers.filter((l) => selectedIds.includes(l.id)).map((l) => l.id);
    if (!ids.length) return;
    const { doc: next } = groupLayers(doc, ids, nextGroupName(doc, t("ovlGroupName")));
    commit(next, doc);
    setSelectedIds(ids);
  }, [doc, selectedIds, commit, t]);
  const ungroupSelected = useCallback(() => {
    const gids = groupsToUngroup(doc, selectedIds);
    if (gids.length) commit(ungroupLayers(doc, gids), doc);
  }, [doc, selectedIds, commit]);
  const canUngroup = groupsToUngroup(doc, selectedIds).length > 0;

  // Shift adds to the selection or takes back out what is already in it, as in Figma.
  const toggleInSelection = (ids) => {
    const all = ids.every((id) => selectedIds.includes(id));
    setSelectedIds(all ? selectedIds.filter((id) => !ids.includes(id)) : [...selectedIds, ...ids.filter((id) => !selectedIds.includes(id))]);
  };

  // Change one colour everywhere in the selection, like Figma's "Selection colors". Keyed by the
  // colour the row showed when it was drawn: while a picker is being dragged faster than the panel
  // redraws, the row still names the old colour, so the latest one it was changed to is
  // remembered here and replaced instead. Half-typed hex values are left alone until complete.
  const recolorRef = useRef({});
  const recolorSelection = (shown, next) => {
    if (!/^#[0-9a-f]{6}$/i.test(next)) return;
    const from = recolorRef.current[shown] || shown;
    recolorRef.current[shown] = next;
    liveEdit((b) => { const d = replaceColor(b, selectedIds, from, next); return d === b ? null : d; });
  };
  // Once the panel has redrawn, every row names its colour again and the memory is stale.
  useEffect(() => { recolorRef.current = {}; }, [doc]);

  const replayEntrances = () => iframeRef.current?.contentWindow?.postMessage({ __overlayReplay: true }, "*");

  // Move every unlocked layer of the selection so its shared box lands where `fn` says.
  const moveSelection = (fn) => liveEdit((b) => {
    const bb = boundsOf(b.layers.filter((l) => selectedIds.includes(l.id)));
    if (!bb) return null;
    const { dx = 0, dy = 0 } = fn(bb);
    if (!dx && !dy) return null;
    return { ...b, layers: b.layers.map((l) => (selectedIds.includes(l.id) && !l.locked ? { ...l, x: l.x + dx, y: l.y + dy } : l)) };
  });

  // Zoom so the selection fills the viewport. Falls back to the whole canvas with nothing
  // selected, which is what someone pressing it with an empty selection means.
  const zoomToSelection = useCallback(() => {
    const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
    if (!picked.length || !viewportSize.w) { fit(); return; }
    const minX = Math.min(...picked.map((l) => l.x || 0));
    const minY = Math.min(...picked.map((l) => l.y || 0));
    const maxX = Math.max(...picked.map((l) => (l.x || 0) + (l.w || 0)));
    const maxY = Math.max(...picked.map((l) => (l.y || 0) + (l.h || 0)));
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const padPx = 120;
    const z = clamp(Math.min((viewportSize.w - padPx) / w, (viewportSize.h - padPx) / h), ZOOM_MIN, ZOOM_MAX);
    setZoom(z);
    setPan({
      x: (viewportSize.w - w * z) / 2 - minX * z,
      y: (viewportSize.h - h * z) / 2 - minY * z,
    });
  }, [doc.layers, selectedIds, viewportSize, fit]);

  // Align the selected layer to a canvas edge / center (editor-only, no engine change).
  const alignSelected = (axis, where) => {
    if (!selected) {
      // Several layers align as one block, the way a group is meant to behave.
      if (selectedIds.length < 2) return;
      const to = (size, len) => (where === "start" ? 0 : where === "end" ? size - len : Math.round((size - len) / 2));
      moveSelection((bb) => (axis === "x" ? { dx: to(doc.canvas.width, bb.w) - bb.x } : { dy: to(doc.canvas.height, bb.h) - bb.y }));
      return;
    }
    if (axis === "x") {
      const x = where === "start" ? 0 : where === "end" ? doc.canvas.width - selected.w : Math.round((doc.canvas.width - selected.w) / 2);
      setLayer(selected.id, { x });
    } else {
      const y = where === "start" ? 0 : where === "end" ? doc.canvas.height - selected.h : Math.round((doc.canvas.height - selected.h) / 2);
      setLayer(selected.id, { y });
    }
  };
  const rotate90 = () => { if (selected) setLayer(selected.id, { rotation: (((selected.rotation || 0) + 90) % 360 + 360) % 360 }); };

  // Pick a local image → embed as data URL on the layer (Tauri dialog).
  const pickImage = async (id) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({ multiple: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }] });
      if (!path) return;
      const data = await readFile(path);
      if (data.length > 4 * 1024 * 1024) return; // ~4 MB guard
      const ext = (String(path).split(".").pop() || "png").toLowerCase();
      const mime = ext === "svg" ? "image/svg+xml" : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
        : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
      // FileReader is more reliable than manual btoa loop for binary data
      const blob = new Blob([data], { type: mime });
      const reader = new FileReader();
      reader.onload = () => { if (reader.result) setStyle(id, { src: reader.result }); };
      reader.onerror = () => console.error("[pickImage] FileReader error");
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("[pickImage]", err);
    }
  };

  // Pixel-precise keyboard nudging (uses the shared live-edit burst infra).
  const nudge = (dx, dy) => {
    if (!selectedIds.length) return;
    const movable = new Set(
      (liveDocRef.current || doc).layers.filter((x) => selectedIds.includes(x.id) && !x.locked).map((x) => x.id)
    );
    if (!movable.size) return;
    liveEdit((b) => ({ ...b, layers: b.layers.map((x) => (movable.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x)) }));
  };

  const undo = useCallback(() => {
    flushLive();
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [doc, ...f]); setDoc(prev); pushDoc(prev);
      return p.slice(0, -1);
    });
  }, [doc, pushDoc, flushLive]);
  const redo = useCallback(() => {
    flushLive();
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, doc]); setDoc(next); pushDoc(next);
      return f.slice(1);
    });
  }, [doc, pushDoc, flushLive]);

  // Lazy-load local system fonts the first time the font picker opens.
  useEffect(() => {
    if (!fontPickerOpen) return;
    setFontPickerPos((pos) => (pos.left ? pos : { top: 88, left: Math.max(8, window.innerWidth - rightW - 484) }));
    // A backdrop would lock the canvas while the panel is open; the panel is meant to sit
    // beside the work, not in front of it.
    const onDown = (e) => { if (!fontPanelRef.current?.contains(e.target)) { setFontPickerOpen(false); setFontPickerSearch(""); } };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [fontPickerOpen, rightW]);

  useEffect(() => {
    if (!fontPickerOpen || localFonts !== null) return;
    let cancelled = false;
    fetch(`${apiBase}/api/local-fonts`)
      .then((r) => r.json())
      .then((names) => { if (!cancelled) setLocalFonts(Array.isArray(names) ? names : []); })
      .catch(() => { if (!cancelled) setLocalFonts([]); });
    return () => { cancelled = true; };
  }, [fontPickerOpen]); // apiBase + localFonts intentionally stable — null-guard prevents re-fetch

  // Keyboard: undo/redo + delete (ignore while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      const mod = e.ctrlKey || e.metaKey;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        // Clicking an entry usually lands in its hex field. Ctrl+C there copies the entry, unless
        // some text is actually selected: then it is the text someone wants.
        const el = e.target;
        const entryCopy = mod && !e.altKey && e.key.toLowerCase() === "c" && selProp
          && el.closest?.("[data-propsel]") && el.selectionStart === el.selectionEnd;
        if (!entryCopy) return;
      }
      if (e.key === "Escape" && selProp) { e.preventDefault(); setSelProp(null); return; }
      if (e.key === "Escape" && libActionsRef.current.isOpen) { e.preventDefault(); libActionsRef.current.close?.(); return; }
      if (e.key === "Enter" && libActionsRef.current.isOpen && libActionsRef.current.insertPicked?.()) { e.preventDefault(); return; }
      if (mod && e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); libActionsRef.current.startSave?.(); return; }
      if (e.key === "Escape" && tool) { e.preventDefault(); setTool(null); setDrawRect(null); return; }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      } else if (mod && e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault(); copySelectedProps();
      } else if (mod && e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault(); pasteSelectedProps("all");
      } else if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        const it = selProp ? copyItem(doc, selectedIds, selProp) : null;
        if (it) { propItemRef.current = it; lastCopyRef.current = "item"; } else copySelected();
      } else if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault(); cutSelected();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (lastCopyRef.current === "item" && propItemRef.current) {
          if (selectedIds.length) { const next = pasteItem(doc, selectedIds, propItemRef.current, selProp); if (next !== doc) commit(next, doc); }
        } else pasteClipboard();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault(); if (e.shiftKey) saveActionsRef.current.openSaveAs?.(); else saveActionsRef.current.saveCurrent?.();
      } else if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault(); if (e.shiftKey) ungroupSelected(); else groupSelected();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault(); duplicateSelected();
      } else if (mod && e.shiftKey && e.key === "2") {
        e.preventDefault(); zoomToSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault();
        if (selProp) { const next = removeItem(doc, selectedIds, selProp); if (next !== doc) commit(next, doc); setSelProp(null); }
        else deleteSelected();
      } else if (selectedIds.length && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const step = e.shiftKey ? prefs.nudgeBig : prefs.nudge;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        e.preventDefault(); nudge(dx, dy);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render to capture latest state — cheap

  // ── Pan / zoom ───────────────────────────────────────────────────────────────
  const onWheel = (e) => {
    if (e.target.closest?.("[data-ovl-panel]")) return; // let floating panels scroll normally
    e.preventDefault();
    // Ctrl/Cmd+scroll = zoom (cursor-anchored); Shift+scroll = horizontal pan; plain = pan.
    if (e.ctrlKey || e.metaKey) {
      const d = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      const rect = viewportRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = Math.exp((prefs.invertZoom ? d : -d) * 0.0015);
      const nz = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);
      const cx = (mx - pan.x) / zoom, cy = (my - pan.y) / zoom;
      setPan({ x: mx - cx * nz, y: my - cy * nz }); setZoom(nz);
    } else if (e.shiftKey) {
      // Windows already reports Shift+wheel as a horizontal delta; accept whichever axis fired.
      const d = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      setPan((p) => ({ x: p.x - d * PAN_SPEED, y: p.y }));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX * PAN_SPEED, y: p.y - e.deltaY * PAN_SPEED }));
    }
  };
  // Pan the canvas (middle-mouse drag, anywhere).
  const startPan = (e) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY }, p0 = { ...pan };
    const move = (ev) => setPan({ x: p0.x + (ev.clientX - start.x), y: p0.y + (ev.clientY - start.y) });
    const up = () => window.removeEventListener("pointermove", move);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  // Left-drag on empty canvas draws a selection box; on release, selects the topmost
  // visible layer it intersects (single-selection editor), or deselects on an empty click.
  const startMarquee = (e) => {
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const toCanvas = (cx, cy) => ({ x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom });
    const p0 = toCanvas(e.clientX, e.clientY);
    let moved = false;
    const onMove = (ev) => {
      const p = toCanvas(ev.clientX, ev.clientY);
      const w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
      if (w + h > 3) moved = true;
      setMarquee({ x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w, h });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      setMarquee(null);
      if (!moved) { if (!e.shiftKey) setSelectedId(null); return; }
      const p = toCanvas(ev.clientX, ev.clientY);
      const bx = Math.min(p0.x, p.x), by = Math.min(p0.y, p.y), bw = Math.abs(p.x - p0.x), bh = Math.abs(p.y - p0.y);
      const hits = doc.layers
        .filter((l) => l.visible !== false && !l.locked)
        .filter((l) => l.x < bx + bw && l.x + l.w > bx && l.y < by + bh && l.y + l.h > by)
        .map((l) => l.id);
      const got = expandToGroups(doc, hits);
      setSelectedIds(e.shiftKey ? [...selectedIds, ...got.filter((id) => !selectedIds.includes(id))] : got);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ── Draw tools (Figma-style: pick a tool, drag to draw, revert to select) ──────
  const addLayerAt = (type, shape, bounds, clickPoint) => {
    const f = LAYER_FACTORIES[type]; if (!f) return;
    const base = f();
    const maxZ = doc.layers.reduce((m, l) => Math.max(m, l.z || 0), -1);
    let x, y, w, h;
    if (bounds) { x = bounds.x; y = bounds.y; w = bounds.w; h = bounds.h; }
    else {
      w = base.w; h = base.h;
      x = Math.round((clickPoint ? clickPoint.x : doc.canvas.width / 2) - w / 2);
      y = Math.round((clickPoint ? clickPoint.y : doc.canvas.height / 2) - h / 2);
    }
    const nl = { ...base, z: maxZ + 1, x, y, w, h };
    if (type === "text") { nl.bind = "static"; nl.style = { ...nl.style, content: "Text" }; }
    if (shape) {
      nl.style = { ...nl.style, shape };
      if (shape === "line" && nl.style.strokeWidth == null) nl.style.strokeWidth = 4;
    }
    commit({ ...doc, layers: [...doc.layers, nl] }, doc);
    setSelectedId(nl.id);
  };

  const startDraw = (e) => {
    e.preventDefault();
    const tl = tool;
    const rect = viewportRef.current.getBoundingClientRect();
    const toCanvas = (cx, cy) => ({ x: (cx - rect.left - pan.x) / zoom, y: (cy - rect.top - pan.y) / zoom });
    const p0 = toCanvas(e.clientX, e.clientY);
    let moved = false;
    const onMove = (ev) => {
      const p = toCanvas(ev.clientX, ev.clientY);
      const w = Math.abs(p.x - p0.x), h = Math.abs(p.y - p0.y);
      if (w + h > 3) moved = true;
      setDrawRect({ x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w, h });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      const p = toCanvas(ev.clientX, ev.clientY);
      const bounds = moved ? {
        x: Math.round(Math.min(p0.x, p.x)), y: Math.round(Math.min(p0.y, p.y)),
        w: Math.max(4, Math.round(Math.abs(p.x - p0.x))), h: Math.max(4, Math.round(Math.abs(p.y - p0.y))),
      } : null;
      addLayerAt(tl.type, tl.shape, bounds, p0);
      setDrawRect(null);
      // Falling back to select after every shape is right for the occasional draw and
      // maddening when placing ten of them in a row.
      if (!prefs.keepTool) setTool(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ── Layer gestures (move / resize / rotate) ──────────────────────────────────
  const startGesture = (e, mode, dir, layer) => {
    e.stopPropagation(); e.preventDefault();
    if (layer.locked) return;
    flushLive();
    // What a press on this layer takes hold of, as in Figma. Dragging a member of a
    // multi-selection moves the whole selection. Otherwise a click lands at the depth the
    // selection is at (the outermost group, or the next level inside a group already entered);
    // Ctrl takes the layer itself whatever group it is in, Shift adds to the selection.
    const deep = e.ctrlKey || e.metaKey;
    let moveIds = [layer.id];
    if (mode === "move") {
      const picked = deep ? [layer.id] : pickOnClick(doc, layer.id, selectedIds);
      if (e.shiftKey) { toggleInSelection(picked); return; }
      moveIds = !deep && selectedIds.length > 1 && selectedIds.includes(layer.id) ? selectedIds : picked;
    }
    const multiMove = moveIds.length > 1;
    setSelectedIds(moveIds);
    const startPositions = multiMove
      ? doc.layers.filter((l) => moveIds.includes(l.id) && !l.locked).map((l) => ({ id: l.id, x: l.x, y: l.y, w: l.w, h: l.h }))
      : null;
    const startBox = startPositions ? boundsOf(startPositions) : null;
    const rect = viewportRef.current.getBoundingClientRect();
    const z = zoom, p = { ...pan }, L0 = { ...layer };
    const center0 = { x: L0.x + L0.w / 2, y: L0.y + L0.h / 2 };
    const startClient = { x: e.clientX, y: e.clientY };

    // Snap targets: canvas edges + center, and every other visible layer's
    // edges + centers. Threshold is ~6 screen px (converted to canvas px).
    const SNAP = prefs.snap ? 6 / z : 0;
    const gxs = [0, doc.canvas.width / 2, doc.canvas.width];
    const gys = [0, doc.canvas.height / 2, doc.canvas.height];
    const movingIds = new Set(startPositions ? startPositions.map((s) => s.id) : [L0.id]);
    for (const l of doc.layers) {
      if (movingIds.has(l.id) || l.visible === false) continue;
      gxs.push(l.x, l.x + l.w / 2, l.x + l.w);
      gys.push(l.y, l.y + l.h / 2, l.y + l.h);
    }
    const snapMove = (x, y, w, h) => {
      let gx = null, gy = null, bx = SNAP, by = SNAP, sx = x, sy = y;
      const pxs = [x, x + w / 2, x + w], pys = [y, y + h / 2, y + h];
      for (const g of gxs) for (let i = 0; i < 3; i++) { const dd = Math.abs(pxs[i] - g); if (dd < bx) { bx = dd; sx = x + (g - pxs[i]); gx = g; } }
      for (const g of gys) for (let i = 0; i < 3; i++) { const dd = Math.abs(pys[i] - g); if (dd < by) { by = dd; sy = y + (g - pys[i]); gy = g; } }
      return { x: Math.round(sx), y: Math.round(sy), gx, gy };
    };
    const snapResize = (nl, d) => {
      let gx = null, gy = null, { x, y, w, h } = nl;
      if (d.x === 1) { let b = SNAP; for (const g of gxs) { const dd = Math.abs((x + w) - g); if (dd < b) { b = dd; w = g - x; gx = g; } } }
      else if (d.x === -1) { let b = SNAP; for (const g of gxs) { const dd = Math.abs(x - g); if (dd < b) { b = dd; w = (x + w) - g; x = g; gx = g; } } }
      if (d.y === 1) { let b = SNAP; for (const g of gys) { const dd = Math.abs((y + h) - g); if (dd < b) { b = dd; h = g - y; gy = g; } } }
      else if (d.y === -1) { let b = SNAP; for (const g of gys) { const dd = Math.abs(y - g); if (dd < b) { b = dd; h = (y + h) - g; y = g; gy = g; } } }
      return { nl: { ...nl, x: Math.round(x), y: Math.round(y), w: Math.max(4, Math.round(w)), h: Math.max(4, Math.round(h)) }, gx, gy };
    };

    let lastDoc = doc, changed = false;
    const apply = (nl) => {
      changed = true;
      lastDoc = { ...doc, layers: doc.layers.map((l) => (l.id === L0.id ? nl : l)) };
      setDoc(lastDoc); liveToIframe(lastDoc);
    };
    const move = (ev) => {
      if (mode === "move") {
        const dx = (ev.clientX - startClient.x) / z, dy = (ev.clientY - startClient.y) / z;
        if (startPositions) {
          // Multi-selection: shift every selected layer by the same delta. The box around them
          // snaps like a single layer would, which is what makes a group placeable by eye.
          let rdx = Math.round(dx), rdy = Math.round(dy), gx = null, gy = null;
          if (startBox && !ev.altKey) {
            const s = snapMove(startBox.x + rdx, startBox.y + rdy, startBox.w, startBox.h);
            rdx = s.x - startBox.x; rdy = s.y - startBox.y; gx = s.gx; gy = s.gy;
          }
          changed = true;
          lastDoc = { ...doc, layers: doc.layers.map((l) => {
            const sp = startPositions.find((s) => s.id === l.id);
            return sp ? { ...l, x: sp.x + rdx, y: sp.y + rdy } : l;
          }) };
          setDoc(lastDoc); liveToIframe(lastDoc); setSnapLines({ x: gx, y: gy });
          return;
        }
        let nx = Math.round(L0.x + dx), ny = Math.round(L0.y + dy), gx = null, gy = null;
        if (!L0.rotation && !ev.altKey) { const s = snapMove(nx, ny, L0.w, L0.h); nx = s.x; ny = s.y; gx = s.gx; gy = s.gy; }
        setSnapLines({ x: gx, y: gy });
        apply({ ...L0, x: nx, y: ny });
      } else if (mode === "rotate") {
        const cx = (ev.clientX - rect.left - p.x) / z, cy = (ev.clientY - rect.top - p.y) / z;
        let ang = Math.atan2(cy - center0.y, cx - center0.x) * 180 / Math.PI + 90;
        // Normalize to 0–360
        ang = ((ang % 360) + 360) % 360;
        let snapped = false;
        if (!prefs.snapRotate) {
          // Preference off: free rotation, not even the Shift grid.
        } else if (ev.shiftKey) {
          // Shift → 15° grid
          ang = Math.round(ang / 15) * 15 % 360;
          snapped = true;
        } else {
          // Magnetic snap to multiples of 45° within 8°
          const nearest = Math.round(ang / 45) * 45 % 360;
          if (Math.abs(ang - nearest) < 8 || Math.abs(ang - nearest + 360) < 8 || Math.abs(ang - nearest - 360) < 8) {
            ang = nearest;
            snapped = true;
          }
        }
        setSnapLines({ x: null, y: null });
        setRotAngle({ deg: Math.round(ang), snapped });
        apply({ ...L0, rotation: Math.round(ang) });
      } else if (mode === "resize") {
        const th = L0.rotation || 0, d = DIRV[dir];
        const cx = (ev.clientX - rect.left - p.x) / z, cy = (ev.clientY - rect.top - p.y) / z;
        const aL = { x: -d.x * L0.w / 2, y: -d.y * L0.h / 2 };
        const aR = rot(aL.x, aL.y, th);
        const A = { x: center0.x + aR.x, y: center0.y + aR.y };
        const lv = rot(cx - A.x, cy - A.y, -th);
        let nw = L0.w, nh = L0.h;
        if (d.x !== 0) nw = Math.max(4, d.x * lv.x);
        if (d.y !== 0) nh = Math.max(4, d.y * lv.y);
        // Lock aspect ratio on corner handles → height follows width.
        if (aspectLockRef.current && d.x !== 0 && d.y !== 0 && L0.h) { nh = Math.max(4, nw * (L0.h / L0.w)); }
        const cc = rot(d.x * nw / 2, d.y * nh / 2, th);
        const ncx = A.x + cc.x, ncy = A.y + cc.y;
        let nl = { ...L0, w: Math.round(nw), h: Math.round(nh), x: Math.round(ncx - nw / 2), y: Math.round(ncy - nh / 2) };
        if (!th && !ev.altKey) { const s = snapResize(nl, d); nl = s.nl; setSnapLines({ x: s.gx, y: s.gy }); }
        else setSnapLines({ x: null, y: null });
        apply(nl);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      setSnapLines({ x: null, y: null });
      setRotAngle(null);
      if (!changed) return; // plain click = select only, no history/POST
      setPast((pp) => [...pp.slice(-60), doc]); setFuture([]);
      pushDoc(lastDoc);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };


  // ── Right-click menus ────────────────────────────────────────────────────────
  // The menu remembers where it was opened and for what; its items are built while drawing, so
  // every action sees the selection the right-click has just made, not the one before it.
  const [ctxMenu, setCtxMenu] = useState(null);   // { kind, x, y, data }
  const openMenu = (e, kind, data) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ kind, x: e.clientX, y: e.clientY, data }); };
  // Right-clicking something outside the selection selects it first, as everywhere else.
  const menuOnLayers = (e, ids) => { if (!ids.every((id) => selectedIds.includes(id))) setSelectedIds(ids); openMenu(e, "layer"); };
  const arrange = (where) => { const next = reorderNodes(doc, selectedIds, where); if (next !== doc) commit(next, doc); };
  const setOnSelection = (patch) => commit({ ...doc, layers: doc.layers.map((l) => (selectedIds.includes(l.id) ? { ...l, ...patch } : l)) }, doc);
  // ── Group rows in the layers panel ───────────────────────────────────────────
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [groupDraft, setGroupDraft] = useState("");
  // Opening or closing a group is how the panel looks, not a change to the design: it is kept
  // in the document so it survives a reload, but it is not an undo step.
  const setGroupUi = (gid, patch) => { const next = setGroup(doc, gid, patch); setDoc(next); pushDoc(next); };
  // Selecting something on the canvas brings its row into view in the layers panel, opening any
  // closed group it is in on the way, as in Figma. Once per selection: editing the selection
  // afterwards must not keep pulling the list back while someone scrolls it.
  const revealedRef = useRef("");
  useEffect(() => {
    const key = selectedIds.join(",");
    if (!key || revealedRef.current === key) return;
    const firstRow = selGroup ? null : panelRows.find((r) => r.kind === "layer" && selectedIds.includes(r.id));
    const first = doc.layers.find((l) => l.id === (firstRow?.id || selectedIds[0]));
    const chain = selGroup ? chainOf(doc, { group: selGroup.parent }) : chainOf(doc, first);
    const closed = chain.filter((gid) => findGroup(doc, gid)?.collapsed);
    if (closed.length) {
      // Opened first; this runs again once the rows are there.
      let next = doc;
      for (const gid of closed) next = setGroup(next, gid, { collapsed: false });
      setDoc(next); pushDoc(next);
      return;
    }
    revealedRef.current = key;
    const el = selGroup
      ? document.querySelector(`[data-group-id="${selGroup.id}"]`)
      : document.querySelector(`[data-layer-id="${first?.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIds, doc, selGroup, panelRows, pushDoc]);

  const setMembers = (gid, patch) => {
    const ids = new Set(membersOf(doc, gid).map((l) => l.id));
    commit({ ...doc, layers: doc.layers.map((l) => (ids.has(l.id) ? { ...l, ...patch } : l)) }, doc);
  };

  const renderGroupRow = (row, rowIdx) => {
    const g = groupsOf(doc).find((x) => x.id === row.gid);
    if (!g) return null;
    const members = membersOf(doc, g.id);
    const active = selGroup?.id === g.id;
    const allLocked = members.length > 0 && members.every((m) => m.locked);
    const allHidden = members.length > 0 && members.every((m) => m.visible === false);
    const chipsShown = allLocked || allHidden;
    const isDragging = dragId === `g:${g.id}`;
    return (
      <div key={`g:${g.id}`} data-layer-index={rowIdx} className={`group flex items-center relative ${isDragging ? "opacity-40" : ""}`}
        style={row.depth ? { paddingLeft: GROUP_INDENT * row.depth } : undefined}>
        {dropIndex === rowIdx && (
          <div className="absolute -top-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
        )}
        {dropIndex === rowIdx + 1 && rowIdx === panelRows.length - 1 && (
          <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
        )}
        <div data-group-id={g.id}
          onPointerDown={(e) => { if (renamingGroup !== g.id) onRowPointerDown(e, { kind: "group", gid: g.id }); }}
          onClick={(e) => {
            if (suppressLayerClickRef.current) { suppressLayerClickRef.current = false; return; }
            if (e.shiftKey) toggleInSelection(members.map((m) => m.id)); else setSelectedIds(members.map((m) => m.id));
          }}
          onDoubleClick={() => { setRenamingGroup(g.id); setGroupDraft(g.name || ""); }}
          onContextMenu={(e) => menuOnLayers(e, members.map((m) => m.id))}
          className={[
            "flex-1 min-w-0 flex items-center gap-1.5 pl-1.5 pr-4 cursor-default select-none",
            "transition-[background-color,border-radius] duration-150 rounded-s-[15px]",
            chipsShown ? "rounded-e-[var(--r-md)]" : "rounded-e-[15px] group-hover:rounded-e-[var(--r-md)]",
            active ? "bg-accent text-white" : "text-primary hover:bg-[var(--bg-hover)]",
          ].join(" ")}
          style={{ height: LAYER_ROW_H }}>
          <button type="button" aria-label={t("ovlGroupToggle")} aria-expanded={!g.collapsed}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setGroupUi(g.id, { collapsed: !g.collapsed }); }}
            className="w-5 h-5 shrink-0 flex items-center justify-center border-0 bg-transparent text-inherit opacity-70 hover:opacity-100">
            {g.collapsed ? <CaretRight size={11} /> : <CaretDown size={11} />}
          </button>
          <ObjectGroup size={14} className="shrink-0" />
          {renamingGroup === g.id ? (
            <input autoFocus value={groupDraft}
              onChange={(e) => setGroupDraft(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { const n = groupDraft.trim(); if (n && n !== g.name) commit(setGroup(doc, g.id, { name: n }), doc); setRenamingGroup(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { setGroupDraft(g.name || ""); setRenamingGroup(null); } }}
              style={{ fontSize: "var(--t13)" }}
              className="flex-1 min-w-0 h-6 px-1.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] text-primary border border-border outline-none" />
          ) : (
            <span style={{ fontSize: "var(--t13)" }} className="flex-1 truncate font-semibold">{g.name || t("ovlGroupName")}</span>
          )}
        </div>
        <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${allLocked ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
          <button type="button"
            onClick={(e) => { e.stopPropagation(); setMembers(g.id, { locked: !allLocked }); }}
            aria-label={t("ovlLocked")} aria-pressed={allLocked}
            className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-[background-color,border-radius] duration-150 rounded-s-[var(--r-md)] ${allLocked ? "text-primary" : "text-secondary"} ${allHidden ? "rounded-e-[var(--r-md)]" : "rounded-e-[15px] group-hover:rounded-e-[var(--r-md)]"}`}
            style={{ width: LAYER_ROW_H, height: LAYER_ROW_H }}>
            {allLocked ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
        </span>
        <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${allHidden ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
          <button type="button"
            onClick={(e) => { e.stopPropagation(); setMembers(g.id, { visible: allHidden }); }}
            aria-label={t("ovlVisible")} aria-pressed={!allHidden}
            className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors duration-150 rounded-s-[var(--r-md)] rounded-e-[15px] ${allHidden ? "text-primary" : "text-secondary"}`}
            style={{ width: LAYER_ROW_H, height: LAYER_ROW_H }}>
            {allHidden ? <EyeSlash size={13} /> : <Eye size={13} />}
          </button>
        </span>
      </div>
    );
  };

  // ── Element library ──────────────────────────────────────────────────────────
  // Pieces of a design kept for reuse (see elements.js). Opened from the tool row, it floats
  // above it; an element is dragged onto the canvas, or clicked to land in the middle.
  const [elements, setElements] = useState(readElements);
  const persistElements = (next) => { setElements(next); writeElements(next); };
  const [libOpen, setLibOpen] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [elementName, setElementName] = useState(null);   // a string while a new element is being named
  const [renamingEl, setRenamingEl] = useState(null);
  const [elDraft, setElDraft] = useState("");
  const [confirmDelEl, setConfirmDelEl] = useState(null);
  const [elDrag, setElDrag] = useState(null);             // { el, x, y, over } while dragging one
  const [pickedEl, setPickedEl] = useState(null);         // the card selected in the library
  // Folders: flat, a name on each element. "__all__" shows every folder as its own section,
  // "__none__" the elements without one.
  const [libFolder, setLibFolder] = useState("__all__");
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [elementFolder, setElementFolder] = useState("");      // folder field while saving
  const [newFolderFor, setNewFolderFor] = useState(null);      // element id waiting for a new folder name
  const [folderDraft, setFolderDraft] = useState("");
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [folderList, setFolderList] = useState(readFolderList);  // folders made empty with "New folder"
  const persistFolderList = (next) => { setFolderList(next); writeFolderList(next); };
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderDraft, setNewFolderDraft] = useState("");
  const startSaveElement = () => {
    if (!selectedIds.length) return;
    setLibOpen(true);
    setElementName(selGroup?.name || selected?.name || t("ovlElementDefault"));
    // Saving while a folder is open puts the new element into it.
    setElementFolder(libFolder.startsWith("__") ? "" : libFolder);
    setNewFolderFor(null);
  };
  const saveElement = () => {
    const el = makeElement(doc, selectedIds, (elementName || "").trim() || t("ovlElementDefault"), elementFolder);
    if (el) persistElements([el, ...elements]);
    setElementName(null);
  };
  const insertElement = (el, at) => {
    const { doc: next, ids } = placeElement(doc, el, at, () => crypto.randomUUID());
    commit(next, doc);
    setSelectedIds(ids);
  };
  // Pointer-based like the layer list: HTML5 drag-and-drop is unreliable in WebView2.
  const startElementDrag = (e, el) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const inViewport = (ev) => {
      const r = viewportRef.current?.getBoundingClientRect();
      return !!r && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
        && !ev.target?.closest?.("[data-ovl-library]");
    };
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      setElDrag({ el, x: ev.clientX, y: ev.clientY, over: inViewport(ev), chip: ev.target?.closest?.("[data-folder-chip]")?.dataset.folderChip || null });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      setElDrag(null);
      // A click picks the card, as in Figma; Enter, the Insert button or a double-click place it.
      if (!moved) { setPickedEl(el.id); return; }
      // Dropped on a folder chip: file it there instead of placing it.
      const chip = ev.target?.closest?.("[data-folder-chip]")?.dataset.folderChip;
      if (chip && chip !== "__all__") { persistElements(moveToFolder(readElements(), el.id, chip === "__none__" ? "" : chip)); return; }
      if (!inViewport(ev)) return;
      const r = viewportRef.current.getBoundingClientRect();
      insertElement(el, { x: (ev.clientX - r.left - pan.x) / zoom, y: (ev.clientY - r.top - pan.y) / zoom });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };
  // What a card shows: the element alone on a transparent canvas of its own size, drawn by the
  // same engine as everything else. Built once per list so the previews are not reloaded on
  // every redraw of the editor.
  const elementDocs = useMemo(() => Object.fromEntries(elements.map((el) => [el.id, {
    version: 2,
    canvas: { ...defaultCanvas(), width: Math.max(1, el.w), height: Math.max(1, el.h), bg: { color: "#000000", opacity: 0 },
      corners: uniformCorners(0, "r"), border: { on: false }, shadow: { on: false } },
    layers: el.layers, groups: el.groups || [],
  }])), [elements]);
  const shownElements = elements.filter((el) => !libQuery.trim() || (el.name || "").toLowerCase().includes(libQuery.trim().toLowerCase()));
  const libFolders = foldersOf(elements, folderList);
  const inFolder = shownElements.filter((el) => libFolder === "__all__" ? true
    : libFolder === "__none__" ? !cleanFolder(el.folder) : cleanFolder(el.folder) === libFolder);
  // "All" with folders in use: one section per folder, the loose ones last. Otherwise one flat grid.
  const libSections = libFolder === "__all__" && libFolders.length
    ? [...libFolders.map((f) => ({ key: f, label: f, items: inFolder.filter((el) => cleanFolder(el.folder) === f) })),
       { key: "__none__", label: t("ovlElementsNoFolder"), items: inFolder.filter((el) => !cleanFolder(el.folder)) }].filter((sec) => sec.items.length)
    : [{ key: "__flat__", label: libFolder === "__all__" ? t("ovlElementsMine") : libFolder === "__none__" ? t("ovlElementsNoFolder") : libFolder, items: inFolder }];
  const createFolder = () => {
    const f = cleanFolder(newFolderDraft);
    if (f) { persistFolderList([...folderList, f]); setLibFolder(f); }
    setCreatingFolder(false); setNewFolderDraft("");
  };
  const dissolveLibFolder = (f) => {
    persistElements(dissolveFolder(elements, f));
    persistFolderList(folderList.filter((x) => x !== f));
    if (libFolder === f) setLibFolder("__all__");
  };
  const toggleFolderOpen = (key) => setCollapsedFolders((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const finishFolderRename = () => {
    const to = cleanFolder(folderDraft);
    if (renamingFolder && to && to !== renamingFolder) {
      persistElements(renameFolder(elements, renamingFolder, to));
      persistFolderList(folderList.map((f) => (f === renamingFolder ? to : f)));
      if (libFolder === renamingFolder) setLibFolder(to);
    }
    setRenamingFolder(null);
  };
  const renderElementCard = (el) => {
                const picked = pickedEl === el.id;
                const n = el.layers?.length || 0;
                return (
                  <div key={el.id} title={t("ovlElementHint")}
                    onPointerDown={(e) => { if (!e.target.closest("button,input")) startElementDrag(e, el); }}
                    onDoubleClick={(e) => { if (!e.target.closest("button,input")) insertElement(el, null); }}
                    onContextMenu={(e) => { setPickedEl(el.id); openMenu(e, "element", el.id); }}
                    className="group/el relative flex flex-col min-w-0 cursor-grab select-none">
                    <div className="relative aspect-square overflow-hidden transition-shadow"
                      style={{ background: CHECKER, backgroundColor: "#262626", borderRadius: "var(--r-xl)",
                        boxShadow: picked ? "0 0 0 2px var(--accent)" : "none" }}>
                      <DesignPreview apiBase={apiBase} doc={elementDocs[el.id]} box={{ w: 104, h: 104 }} pad={10} />
                    </div>
                    {renamingEl === el.id ? (
                      <input autoFocus value={elDraft} onChange={(e) => setElDraft(e.target.value)}
                        onBlur={() => { const nn = elDraft.trim(); if (nn) persistElements(elements.map((x) => (x.id === el.id ? { ...x, name: nn } : x))); setRenamingEl(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setRenamingEl(null); } }}
                        style={{ fontSize: "var(--t12)" }}
                        className="mt-1.5 h-6 px-2 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary border border-accent outline-none" />
                    ) : (
                      <div style={{ fontSize: "var(--t12)" }} className="mt-1.5 px-0.5 truncate font-medium text-primary">{el.name}</div>
                    )}
                    <div style={{ fontSize: "var(--t11)" }} className="px-0.5 truncate text-muted tabular-nums">
                      {el.w} × {el.h} · {n} {n === 1 ? t("ovlElementLayer") : t("ovlElementLayers")}
                    </div>
                  </div>
                );
  };
  const pickedElement = elements.find((x) => x.id === pickedEl) || null;
  const moveElementTo = (id, key) => {
    if (key === "__new__") { setNewFolderFor(id); setFolderDraft(""); setElementName(null); return; }
    persistElements(moveToFolder(elements, id, key === "__none__" ? "" : key));
  };
  const insertPicked = () => {
    const el = elements.find((x) => x.id === pickedEl);
    if (!el) return false;
    insertElement(el, null);
    return true;
  };
  libActionsRef.current = { isOpen: libOpen, close: () => { setLibOpen(false); setElementName(null); }, startSave: startSaveElement, insertPicked };

  // ── Profile management ───────────────────────────────────────────────────────
  const importFileRef = useRef(null);
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserSort, setBrowserSort] = useState("recent"); // recent | name | size
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pickedProfileId, setPickedProfileId] = useState(null);   // shown large in My Designs

  const persistProfiles = useCallback((next) => {
    setProfiles(next);
    localStorage.setItem("kiyoshi-overlay-profiles", JSON.stringify(next));
  }, []);

  // The saved design the canvas came from, so "Save" can write back into it instead of asking
  // for a name every time. Cleared by "New"; set by opening a design and by "Save as".
  const [currentProfileId, setCurrentProfileIdState] = useState(() => localStorage.getItem("kiyoshi-overlay-current-profile") || null);
  const setCurrentProfileId = useCallback((id) => {
    setCurrentProfileIdState(id);
    if (id) localStorage.setItem("kiyoshi-overlay-current-profile", id); else localStorage.removeItem("kiyoshi-overlay-current-profile");
  }, []);
  const [justSaved, setJustSaved] = useState(false);
  const flashSaved = useCallback(() => { setJustSaved(true); setTimeout(() => setJustSaved(false), 1400); }, []);

  // "Save as": always a new entry, named in the popover (prefilled with the document's name).
  const saveProfile = useCallback(() => {
    const name = saveName.trim() || doc.canvas.name || t("ovlProfileDefaultName");
    const id = crypto.randomUUID();
    persistProfiles([{ id, name, savedAt: new Date().toISOString(), doc }, ...profiles]);
    setCurrentProfileId(id);
    setSaveName("");
    setSaveOpen(false);
    flashSaved();
  }, [saveName, doc, profiles, persistProfiles, t, setCurrentProfileId, flashSaved]);

  const openSaveAs = useCallback(() => {
    setSaveName(doc.canvas.name || "");
    setSaveOpen(true); setBrowserOpen(false);
  }, [doc.canvas.name]);

  // "Save": into the design it came from, without a question. Only a design that was never
  // saved (or whose entry was deleted since) still asks for a name.
  const saveCurrent = useCallback(() => {
    const prof = currentProfileId && profiles.find((p) => p.id === currentProfileId);
    if (!prof) { openSaveAs(); return; }
    persistProfiles(profiles.map((p) => (p.id === prof.id ? { ...p, doc, savedAt: new Date().toISOString() } : p)));
    flashSaved();
  }, [currentProfileId, profiles, doc, persistProfiles, openSaveAs, flashSaved]);

  saveActionsRef.current = { saveCurrent, openSaveAs };

  const applyProfile = useCallback((prof) => {
    commit(normalizeOverlayDoc(prof.doc));
    setCurrentProfileId(prof.id);
    setBrowserOpen(false);
  }, [commit, setCurrentProfileId]);

  const deleteProfile = useCallback((id) => {
    persistProfiles(profiles.filter((p) => p.id !== id));
  }, [profiles, persistProfiles]);

  // Tags: free words on a design, for finding it again. Stored on the profile, compared without
  // case, so "Tetris" and "tetris" are one tag.
  const [tagFilter, setTagFilter] = useState(null);
  const [tagDraft, setTagDraft] = useState("");
  const addTag = (id, raw) => {
    const tag = String(raw || "").trim().replace(/^#/, "").slice(0, 24);
    if (!tag) return;
    persistProfiles(profiles.map((p) => {
      if (p.id !== id) return p;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      return tags.some((x) => x.toLowerCase() === tag.toLowerCase()) ? p : { ...p, tags: [...tags, tag] };
    }));
  };
  const removeTag = (id, tag) => persistProfiles(profiles.map((p) => (p.id === id ? { ...p, tags: (p.tags || []).filter((x) => x !== tag) } : p)));
  const allTags = [...new Map(profiles.flatMap((p) => p.tags || []).map((x) => [x.toLowerCase(), x])).values()].sort((a, b) => a.localeCompare(b));

  const renameProfile = useCallback((id, name) => {
    const clean = name.trim();
    if (!clean) return;
    persistProfiles(profiles.map((p) => (p.id === id ? { ...p, name: clean } : p)));
  }, [profiles, persistProfiles]);

  // The copy lands directly after its original rather than at the top: it is a variant of that
  // design, and dropping it into the newest slot would separate the two.
  const duplicateProfile = useCallback((prof) => {
    const copy = { ...prof, id: crypto.randomUUID(), name: `${prof.name} (${t("ovlProfileCopySuffix")})`, savedAt: new Date().toISOString() };
    const at = profiles.findIndex((p) => p.id === prof.id);
    const next = [...profiles];
    next.splice(at < 0 ? 0 : at + 1, 0, copy);
    persistProfiles(next);
  }, [profiles, persistProfiles, t]);

  // Asks where to put it. The <a download> this used to do hands the file to the browser
  // engine, which drops it in Downloads silently - no dialog, no hint it worked.
  const exportProfile = useCallback(async (prof) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const base = prof.name.replace(/[^\w\s-]/g, "").trim() || "design";
      const path = await save({
        defaultPath: `${base}.kiyoshi-overlay.json`,
        filters: [{ name: "Overlay design", extensions: ["json"] }],
      });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(prof, null, 2));
    } catch {}
  }, []);

  const handleImportFiles = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    Promise.all(files.map((f) => f.text())).then((texts) => {
      const imported = [];
      for (const text of texts) {
        try {
          const parsed = JSON.parse(text);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (item.doc) {
              imported.push({ id: crypto.randomUUID(), name: item.name || t("ovlProfileDefaultName"), savedAt: new Date().toISOString(), doc: normalizeOverlayDoc(item.doc) });
            } else if (item.layers || item.canvas) {
              imported.push({ id: crypto.randomUUID(), name: t("ovlProfileDefaultName"), savedAt: new Date().toISOString(), doc: normalizeOverlayDoc(item) });
            }
          }
        } catch { /* skip malformed files */ }
      }
      if (imported.length > 0) persistProfiles([...imported, ...profiles]);
    });
  }, [profiles, persistProfiles, t]);

  // The right-click menus' items (see ContextMenu), by where the menu was opened.
  const menuItems = (m) => {
    if (m.kind === "layer") {
      const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
      const allLocked = picked.length > 0 && picked.every((l) => l.locked);
      const allHidden = picked.length > 0 && picked.every((l) => l.visible === false);
      return [
        { key: "cut", label: t("ovlMenuCut"), icon: <Scissors size={12} />, kbd: "Ctrl+X", onSelect: cutSelected },
        { key: "copy", label: t("ovlMenuCopy"), icon: <Copy size={12} />, kbd: "Ctrl+C", onSelect: copySelected },
        { key: "paste", label: t("ovlMenuPaste"), icon: <Clipboard size={12} />, kbd: "Ctrl+V", disabled: !clipboardRef.current.length, onSelect: pasteClipboard },
        { key: "dup", label: t("ovlMenuDuplicate"), icon: <Copy size={12} />, kbd: "Ctrl+D", onSelect: duplicateSelected },
        { key: "del", label: t("ovlMenuDelete"), icon: <Trash size={12} />, kbd: "Entf", danger: true, onSelect: deleteSelected },
        "-",
        { key: "group", label: t("ovlGroup"), icon: <ObjectGroup size={12} />, kbd: "Ctrl+G", onSelect: groupSelected },
        { key: "ungroup", label: t("ovlUngroup"), icon: <ObjectUngroup size={12} />, kbd: "Ctrl+Shift+G", disabled: !canUngroup, onSelect: ungroupSelected },
        { key: "arrange", label: t("ovlArrange"), icon: <span className="w-3" />, children: [
          { key: "front", label: t("ovlArrangeFront"), onSelect: () => arrange("front") },
          { key: "forward", label: t("ovlArrangeForward"), onSelect: () => arrange("forward") },
          { key: "backward", label: t("ovlArrangeBackward"), onSelect: () => arrange("backward") },
          { key: "back", label: t("ovlArrangeBack"), onSelect: () => arrange("back") },
        ] },
        "-",
        { key: "cprops", label: t("ovlCopyProps"), icon: <PaintRoller size={12} />, kbd: "Ctrl+Alt+C", disabled: !canCopyProps, onSelect: copySelectedProps },
        { key: "pprops", label: t("ovlPasteProps"), icon: <Clipboard size={12} />, kbd: "Ctrl+Alt+V", disabled: !propsClip, onSelect: () => pasteSelectedProps("all") },
        "-",
        { key: "lock", label: allLocked ? t("ovlUnlock") : t("ovlLock"), icon: allLocked ? <LockOpen size={12} /> : <Lock size={12} />, onSelect: () => setOnSelection({ locked: !allLocked }) },
        { key: "hide", label: allHidden ? t("ovlShow") : t("ovlHide"), icon: allHidden ? <Eye size={12} /> : <EyeSlash size={12} />, onSelect: () => setOnSelection({ visible: allHidden }) },
        "-",
        { key: "element", label: t("ovlElementSaveAs"), icon: <Shapes size={12} />, kbd: "Ctrl+Alt+K", onSelect: startSaveElement },
      ];
    }
    if (m.kind === "canvas") {
      return [
        { key: "paste", label: t("ovlMenuPaste"), icon: <Clipboard size={12} />, kbd: "Ctrl+V", disabled: !clipboardRef.current.length, onSelect: pasteClipboard },
        { key: "all", label: t("ovlSelectAll"), icon: <CursorArrow size={12} />, onSelect: () => setSelectedIds(doc.layers.filter((l) => l.visible !== false && !l.locked).map((l) => l.id)) },
        { key: "fit", label: t("ovlZoomFit"), icon: <ArrowsOut size={12} />, onSelect: () => fit() },
      ];
    }
    if (m.kind === "element") {
      const el = elements.find((x) => x.id === m.data);
      if (!el) return null;
      return [
        { key: "insert", label: t("ovlElementInsert"), icon: <Plus size={12} />, kbd: "↵", onSelect: () => insertElement(el, null) },
        { key: "rename", label: t("ovlElementRename"), icon: <PencilSimple size={12} />, onSelect: () => { setRenamingEl(el.id); setElDraft(el.name || ""); } },
        { key: "move", label: t("ovlElementMoveTo"), icon: <Folder size={12} />, children: [
          ...libFolders.map((f) => ({ key: f, label: f, icon: cleanFolder(el.folder) === f ? <Check size={11} /> : <Folder size={11} />, onSelect: () => moveElementTo(el.id, f) })),
          { key: "__none__", label: t("ovlElementsNoFolder"), icon: !cleanFolder(el.folder) ? <Check size={11} /> : null, onSelect: () => moveElementTo(el.id, "__none__") },
          "-",
          { key: "__new__", label: t("ovlElementNewFolder"), icon: <Plus size={11} />, onSelect: () => moveElementTo(el.id, "__new__") },
        ] },
        "-",
        { key: "del", label: t("ovlMenuDelete"), icon: <Trash size={12} />, danger: true, onSelect: () => { persistElements(elements.filter((x) => x.id !== el.id)); setPickedEl(null); } },
      ];
    }
    if (m.kind === "design") {
      const p = profiles.find((x) => x.id === m.data);
      if (!p) return null;
      return [
        { key: "apply", label: t("ovlProfileApply"), icon: <Check size={12} />, kbd: "↵", onSelect: () => applyProfile(p) },
        { key: "rename", label: t("ovlProfileRename"), icon: <PencilSimple size={12} />, onSelect: () => { setRenamingId(p.id); setRenameDraft(p.name); } },
        { key: "dup", label: t("ovlProfileDuplicate"), icon: <Copy size={12} />, onSelect: () => duplicateProfile(p) },
        { key: "export", label: t("ovlProfileExport"), icon: <DownloadSimple size={12} />, onSelect: () => exportProfile(p) },
        "-",
        { key: "del", label: t("ovlProfileDelete"), icon: <Trash size={12} />, danger: true, onSelect: () => setConfirmDeleteId(p.id) },
      ];
    }
    if (m.kind === "folder") {
      return [
        { key: "rename", label: t("ovlFolderRename"), icon: <PencilSimple size={12} />, onSelect: () => { setRenamingFolder(m.data); setFolderDraft(m.data); } },
        { key: "dissolve", label: t("ovlFolderDissolve"), icon: <X size={12} />, onSelect: () => dissolveLibFolder(m.data) },
      ];
    }
    return null;
  };

  // Selection chrome lives inside the stage, which is scaled by `zoom`. Dividing its sizes by
  // the zoom keeps it visually constant — until the numbers go below a pixel: at 3200% a handle
  // is 0.28px across with a 0.047px border, and a border narrower than 1px is treated as a
  // hairline and drawn a whole CSS pixel wide. Multiplied back up by 32 that is a 32px slab.
  //
  // So nothing here is sized in fractions any more. The chrome is written at its natural pixel
  // size and scaled back down as a whole with a transform, which is composited rather than laid
  // out and therefore has no minimum. `unscale` does that; sizes it counters must NOT be
  // divided by the zoom themselves. Positions still are — those are canvas coordinates.
  const HANDLE_PX = 9;
  const unscale = (extra = "") => ({
    // Origin at the top-left corner so the translate below moves by half the *visual* size:
    // with the default centre origin the offset would be computed before the scale.
    transformOrigin: "0 0",
    transform: `scale(${1 / zoom})${extra}`,
  });
  // The outline traces the layer box, so it cannot be counter-scaled. An inset box-shadow takes
  // the place of the border: spread is a plain length with no hairline minimum, and unlike a
  // border it never affects the box's own size.
  const BW = 1.5 / zoom;

  return (
    <div
      data-overlay-editor
      // overflow: clip, not hidden. A hidden overflow still scrolls when the browser brings a
      // focused element into view (a switch's hidden input, a new field), and then the whole
      // editor slid up by hundreds of pixels; clip cannot be scrolled at all.
      className={`flex flex-col w-full overflow-clip select-none${standalone ? "" : " rounded-xl"}`}
      style={{ height: standalone ? "100vh" : "78vh", minHeight: standalone ? undefined : 480 }}
    >
      {/* ── Top bar (doubles as the custom title bar in standalone) ────────────────
          52px tall with 30px controls, per the design. The document name moved out of here
          and sits above the layer list now: it belongs to the document, not to the toolbar. */}
      <div className="shrink-0 flex items-center gap-1 h-[52px] pl-[22px] pr-3" {...(standalone ? { "data-tauri-drag-region": true } : {})}>
        <div className="flex items-center gap-2 pr-2 shrink-0">
          <img src="/Kodama%20Logo.png" alt="" width="18" height="18" />
          <span className="text-[length:var(--t13)] font-semibold text-primary">{t("ovlEditorTitle")}</span>
          {/* Set like a superscript beside the wordmark: raised against the cap height rather
              than centred on it, so it reads as a qualifier on the name instead of a second
              word in the row. */}
          <span className="text-[9px] font-bold tracking-wider text-white leading-none relative -top-[5px] -ml-1">BETA</span>
        </div>

        {/* The four menus read as one segmented control, like the icon groups opposite. */}
        <MenuBar className="flex items-center gap-[6px]">
        <MenuBtn label={t("ovlMenuFile")} corners={hdrCorners(false, true)}>
          <DropdownMenu aria-label={t("ovlMenuFile")} onAction={(key) => {
            if (key === "new") { commit(defaultOverlayDoc()); setSelectedId(null); setCurrentProfileId(null); }
            else if (key === "place") { const id = addLayer("image"); if (id) pickImage(id); }
            else if (key === "save") saveCurrent();
            else if (key === "saveAs") openSaveAs();
            else if (key === "browse") { setBrowserOpen(true); setSaveOpen(false); }
            else if (key === "import") { importFileRef.current?.click(); }
            else if (key === "export") { exportProfile({ id: "current", name: t("ovlMenuExportCurrent"), doc, savedAt: new Date().toISOString() }); }
          }}>
            <DropdownSection>
              <DropdownItem id="new" textValue={t("ovlMenuNew")}><Plus size={13} />{t("ovlMenuNew")}</DropdownItem>
              <DropdownItem id="place" textValue={t("ovlPlaceImage")}><ImageSquare size={13} />{t("ovlPlaceImage")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="save" textValue={t("ovlSave")}><FloppyDisk size={13} />{t("ovlSave")}<span className="ml-auto pl-4 text-muted text-[length:var(--t11)]">Ctrl+S</span></DropdownItem>
              <DropdownItem id="saveAs" textValue={t("ovlSaveAs")}><FloppyDisk size={13} />{t("ovlSaveAs")}<span className="ml-auto pl-4 text-muted text-[length:var(--t11)]">Ctrl+Shift+S</span></DropdownItem>
              <DropdownItem id="browse" textValue={t("ovlProfileBrowse")}><Swatches size={13} />{t("ovlProfileBrowse")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="import" textValue={t("ovlProfileImport")}><UploadSimple size={13} />{t("ovlProfileImport")}</DropdownItem>
              <DropdownItem id="export" textValue={t("ovlMenuExportCurrent")}><DownloadSimple size={13} />{t("ovlMenuExportCurrent")}</DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        </MenuBtn>

        <MenuBtn label={t("ovlMenuEdit")} corners={hdrCorners(true, true)}>
          <DropdownMenu aria-label={t("ovlMenuEdit")} disabledKeys={[
            ...(past.length ? [] : ["undo"]),
            ...(future.length ? [] : ["redo"]),
            ...(selectedIds.length ? [] : ["duplicate", "delete", "selectNone", "copy", "cut", "group"]),
            ...(canUngroup ? [] : ["ungroup"]),
            ...(canCopyProps ? [] : ["copyProps"]),
            ...(selectedIds.length ? [] : ["saveElement"]),
            ...(propsClip && selectedIds.length ? [] : ["pasteProps", "pasteColors", "pasteEffects", "pasteAnims"]),
            ...(propsClip?.from === "group" ? ["pasteColors", "pasteEffects"] : []),
            ...(clipboardRef.current.length ? [] : ["paste"]),
          ]} onAction={(key) => {
            if (key === "undo") undo();
            else if (key === "redo") redo();
            else if (key === "copy") copySelected();
            else if (key === "cut") cutSelected();
            else if (key === "paste") pasteClipboard();
            else if (key === "duplicate") duplicateSelected();
            else if (key === "delete") deleteSelected();
            else if (key === "group") groupSelected();
            else if (key === "copyProps") copySelectedProps();
            else if (key === "saveElement") libActionsRef.current.startSave?.();
            else if (key === "pasteProps") pasteSelectedProps("all");
            else if (key === "pasteColors") pasteSelectedProps("colors");
            else if (key === "pasteEffects") pasteSelectedProps("effects");
            else if (key === "pasteAnims") pasteSelectedProps("animations");
            else if (key === "ungroup") ungroupSelected();
            else if (key === "selectAll") setSelectedIds(doc.layers.filter((l) => l.visible !== false && !l.locked).map((l) => l.id));
            else if (key === "selectNone") setSelectedIds([]);
          }}>
            <DropdownSection>
              <DropdownItem id="undo" textValue={t("ovlMenuUndo")}><span style={{ transform: "scaleX(-1)", display: "inline-flex" }}><ArrowClockwise size={13} /></span>{t("ovlMenuUndo")}</DropdownItem>
              <DropdownItem id="redo" textValue={t("ovlMenuRedo")}><ArrowClockwise size={13} />{t("ovlMenuRedo")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="copy" textValue={t("ovlMenuCopy")}><Copy size={13} />{t("ovlMenuCopy")}</DropdownItem>
              <DropdownItem id="cut" textValue={t("ovlMenuCut")}><Scissors size={13} />{t("ovlMenuCut")}</DropdownItem>
              <DropdownItem id="paste" textValue={t("ovlMenuPaste")}><Clipboard size={13} />{t("ovlMenuPaste")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="duplicate" textValue={t("ovlMenuDuplicate")}><Copy size={13} />{t("ovlMenuDuplicate")}</DropdownItem>
              <DropdownItem id="delete" textValue={t("ovlMenuDelete")}><Trash size={13} />{t("ovlMenuDelete")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="group" textValue={t("ovlGroup")}><ObjectGroup size={13} />{t("ovlGroup")}</DropdownItem>
              <DropdownItem id="ungroup" textValue={t("ovlUngroup")}><ObjectUngroup size={13} />{t("ovlUngroup")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="copyProps" textValue={t("ovlCopyProps")}><PaintRoller size={13} />{t("ovlCopyProps")}<span className="ml-auto pl-4 text-muted text-[length:var(--t11)]">Ctrl+Alt+C</span></DropdownItem>
              <DropdownItem id="pasteProps" textValue={t("ovlPasteProps")}><Clipboard size={13} />{t("ovlPasteProps")}<span className="ml-auto pl-4 text-muted text-[length:var(--t11)]">Ctrl+Alt+V</span></DropdownItem>
              <DropdownItem id="pasteColors" textValue={t("ovlPasteColors")}><span className="w-[13px]" />{t("ovlPasteColors")}</DropdownItem>
              <DropdownItem id="pasteEffects" textValue={t("ovlPasteEffects")}><span className="w-[13px]" />{t("ovlPasteEffects")}</DropdownItem>
              <DropdownItem id="pasteAnims" textValue={t("ovlPasteAnims")}><span className="w-[13px]" />{t("ovlPasteAnims")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="saveElement" textValue={t("ovlElementSaveAs")}><Shapes size={13} />{t("ovlElementSaveAs")}<span className="ml-auto pl-4 text-muted text-[length:var(--t11)]">Ctrl+Alt+K</span></DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="selectAll" textValue={t("ovlSelectAll")}><CursorArrow size={13} />{t("ovlSelectAll")}</DropdownItem>
              <DropdownItem id="selectNone" textValue={t("ovlSelectNone")}><X size={13} />{t("ovlSelectNone")}</DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        </MenuBtn>

        <MenuBtn label={t("ovlMenuView")} corners={hdrCorners(true, true)}>
          <DropdownMenu aria-label={t("ovlMenuView")} disabledKeys={selectedIds.length ? [] : ["zoomSel"]} onAction={(key) => {
            if (key === "zoomIn") setZoom((z) => clamp(z * 1.25, ZOOM_MIN, ZOOM_MAX));
            else if (key === "zoomOut") setZoom((z) => clamp(z * 0.8, ZOOM_MIN, ZOOM_MAX));
            else if (key === "zoom100") setZoom(1);
            else if (key === "fit") fit();
            else if (key === "zoomSel") zoomToSelection();
            else if (key === "grid") setPref("showGrid", !prefs.showGrid);
            else if (key === "reload") setIframeKey((k) => k + 1);
            else if (key === "left") setPref("showLeft", !prefs.showLeft);
            else if (key === "right") setPref("showRight", !prefs.showRight);
          }}>
            <DropdownSection>
              <DropdownItem id="zoomIn" textValue={t("ovlZoomIn")}><Plus size={13} />{t("ovlZoomIn")}</DropdownItem>
              <DropdownItem id="zoomOut" textValue={t("ovlZoomOut")}><Minus size={13} />{t("ovlZoomOut")}</DropdownItem>
              <DropdownItem id="zoom100" textValue={t("ovlZoom100")}><MagnifyingGlass size={13} />{t("ovlZoom100")}</DropdownItem>
              <DropdownItem id="fit" textValue={t("ovlZoomFit")}><ArrowsOut size={13} />{t("ovlZoomFit")}</DropdownItem>
              <DropdownItem id="zoomSel" textValue={t("ovlZoomSelection")}><ArrowsOut size={13} />{t("ovlZoomSelection")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="grid" textValue={t("ovlShowGrid")}><PrefTick on={prefs.showGrid} />{t("ovlShowGrid")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="left" textValue={t("ovlPanelLeft")}><PrefTick on={prefs.showLeft} />{t("ovlPanelLeft")}</DropdownItem>
              <DropdownItem id="right" textValue={t("ovlPanelRight")}><PrefTick on={prefs.showRight} />{t("ovlPanelRight")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="reload" textValue={t("ovlReloadPreview")}><ArrowsClockwise size={13} />{t("ovlReloadPreview")}</DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        </MenuBtn>

        <MenuBtn label={t("ovlMenuPrefs")} width={270} corners={hdrCorners(true, false)}>
          <DropdownMenu aria-label={t("ovlMenuPrefs")} onAction={(key) => {
            if (key === "nudge") setNudgeOpen(true);
            else setPref(key, !prefs[key]);
          }}>
            <DropdownSection>
              <DropdownItem id="snap" textValue={t("ovlPrefSnap")}><PrefTick on={prefs.snap} />{t("ovlPrefSnap")}</DropdownItem>
              <DropdownItem id="snapRotate" textValue={t("ovlPrefSnapRotate")}><PrefTick on={prefs.snapRotate} />{t("ovlPrefSnapRotate")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="nudge" textValue={t("ovlPrefNudge")}><span className="inline-flex w-[13px] justify-center shrink-0"><ArrowsOut size={11} /></span>{t("ovlPrefNudge")}</DropdownItem>
              <DropdownItem id="keepTool" textValue={t("ovlPrefKeepTool")}><PrefTick on={prefs.keepTool} />{t("ovlPrefKeepTool")}</DropdownItem>
              <DropdownItem id="showDims" textValue={t("ovlPrefShowDims")}><PrefTick on={prefs.showDims} />{t("ovlPrefShowDims")}</DropdownItem>
              <DropdownItem id="invertZoom" textValue={t("ovlPrefInvertZoom")}><PrefTick on={prefs.invertZoom} />{t("ovlPrefInvertZoom")}</DropdownItem>
            </DropdownSection>
          </DropdownMenu>
        </MenuBtn>
        </MenuBar>

        <div className="flex-1" {...(standalone ? { "data-tauri-drag-region": true } : {})} />

        {/* Grouped like the design: a lone reload, then the file actions, then history.
            Members of a group sit 2px apart so they read as one control. */}
        <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(false, false) }}
          onPress={() => setIframeKey((k) => k + 1)} aria-label={t("ovlReloadPreview")}><ArrowsClockwise size={15} weight="fill" /></Button>

        <div className="w-px h-[18px] bg-border mx-1.5 shrink-0" />

        <div className="flex items-center gap-[6px]">
          <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(false, true) }}
            onPress={() => importFileRef.current?.click()} aria-label={t("ovlProfileImport")}><FileImport size={15} weight="fill" /></Button>
          <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(true, true) }}
            onPress={() => exportProfile({ id: "current", name: t("ovlMenuExportCurrent"), doc, savedAt: new Date().toISOString() })} aria-label={t("ovlMenuExportCurrent")}><FileExport size={15} weight="fill" /></Button>
          <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(true, false) }}
            onPress={saveCurrent} aria-label={t("ovlSave")}>{justSaved ? <Check size={15} weight="bold" /> : <FloppyDisk size={15} weight="fill" />}</Button>
        </div>

        <div className="w-px h-[18px] bg-border mx-1.5 shrink-0" />

        <div className="flex items-center gap-[6px]">
          <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(false, true) }}
            onPress={undo} isDisabled={!past.length} aria-label={t("ovlMenuUndo")}><span style={{ transform: "scaleX(-1)", display: "inline-flex" }}><ArrowClockwise size={15} /></span></Button>
          <Button variant="ghost" size="sm" isIconOnly className={HDR_ICON_BTN} style={{ borderRadius: hdrCorners(true, false) }}
            onPress={redo} isDisabled={!future.length} aria-label={t("ovlMenuRedo")}><ArrowClockwise size={15} /></Button>
        </div>

        {/* bg-accent! rather than color="accent": the solid variant does not paint the fill in
            this HeroUI version, which left the primary action looking like every other chip.
            The rest of the editor already reaches for the utility class for the same reason. */}
        <Button variant="ghost" size="sm" className="gap-1.5 h-[30px]! px-4! ml-1.5 bg-accent! hover:bg-accent! text-white! text-[length:var(--t14)]! font-medium" style={{ borderRadius: hdrCorners(false, false) }}
          onPress={() => { setBrowserOpen(true); setSaveOpen(false); }}><Swatches size={15} weight="fill" />{t("ovlProfileBrowse")}</Button>
        {standalone && <div className="w-px h-5 bg-border mx-1" />}
        {standalone && <WindowControls />}
      </div>

      {/* ── Body (docked panels + canvas) ───────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative">

        {/* ── Left: layers ──────────────────────────────────────────────────────── */}
        {prefs.showLeft && <div className="shrink-0 flex flex-col relative" style={{ width: leftW }}>
          <div onPointerDown={(e) => startPanelResize("left", e)}
            className="absolute top-0 right-0 h-full w-1.5 translate-x-1/2 z-20 cursor-col-resize hover:bg-[var(--accent)]/40" />
          {/* The document name lives with the document, not in the toolbar. */}
          <div className="flex items-center px-[10px] h-[52px] shrink-0">
            <TextFieldRoot value={doc.canvas.name ?? ""} onChange={(v) => updateCanvas({ name: v })} aria-label={t("ovlProfileName")} className="w-full">
              <InputRoot style={{ fontSize: "var(--t18)" }}
                className="font-semibold h-[36px]! px-4! bg-transparent! border-transparent! hover:bg-[var(--surface-2)]! focus:bg-[var(--surface-2)]! focus:border-border!"
                placeholder={t("ovlProfileDefaultName")} />
            </TextFieldRoot>
          </div>
          {/* Inset rather than edge to edge: it separates the two headings, and running it into
              the panel borders made it read as a structural divider of the whole column. */}
          <div className="mx-[26px] h-px bg-border shrink-0" />
          <div className="flex items-center justify-between pl-[26px] pr-1.5 pt-3 pb-1 shrink-0 relative">
            <span style={{ fontSize: "var(--t15)" }} className="font-semibold text-primary">{t("ovlLayers")}</span>
          </div>
          <div className="flex flex-col gap-0.5 px-[10px] py-1.5 overflow-y-auto min-h-0">
            {panelRows.length === 0 && <div className="text-[length:var(--t11)] text-muted px-1.5 py-2">{t("ovlEmptyLayers")}</div>}
            {panelRows.map((row, rowIdx) => {
              if (row.kind === "group") return renderGroupRow(row, rowIdx);
              const l = layerById.get(row.id);
              if (!l) return null;
              const M = TYPE_META[l.type] || TYPE_META.shape; const Icon = M.icon; const active = selectedIds.includes(l.id);
              const isDragging = dragId === l.id;
              // A chip stays out on its own account: locked shows the lock, hidden shows the
              // eye. The pill needs its notch as soon as either of them is beside it.
              const lockShown = !!l.locked;
              const eyeShown = l.visible === false;
              const chipsShown = lockShown || eyeShown;
              return (
                <div key={l.id} data-layer-index={rowIdx} className={`group flex items-center relative ${isDragging ? "opacity-40" : ""}`}
                  style={row.depth ? { paddingLeft: GROUP_INDENT * row.depth } : undefined}>
                  {/* The drop line sits IN the gap, so it says where the row lands instead of
                      which row you are over -- an outline leaves you guessing above or below.
                      Zero height and absolutely placed, so showing it never nudges the list. */}
                  {dropIndex === rowIdx && (
                    <div className="absolute -top-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
                  )}
                  {dropIndex === rowIdx + 1 && rowIdx === panelRows.length - 1 && (
                    <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
                  )}
                  <div
                    data-layer-id={l.id}
                    onPointerDown={(e) => onRowPointerDown(e, { kind: "layer", id: l.id })}
                    onContextMenu={(e) => menuOnLayers(e, selectedIds.includes(l.id) ? selectedIds : [l.id])}
                    onClick={(e) => {
                      if (suppressLayerClickRef.current) { suppressLayerClickRef.current = false; return; }
                      if (e.shiftKey) toggleInSelection([l.id]); else setSelectedId(l.id);
                    }}
                    className={[
                      "flex-1 min-w-0 flex items-center gap-2 px-4 cursor-default select-none",
                      "transition-[background-color,border-radius] duration-150",
                      // --r-full clamps to half of LAYER_ROW_H, which is the 15 this used to spell
                      // out, so the row looks the same and follows a theme that flattens corners.
                      // Still written out in full: Tailwind only sees class names it can read in
                      // the source, so the name may not be built at runtime - but an arbitrary
                      // value holding a variable reads fine.
                      "rounded-s-[15px]",
                      // The notch appears exactly when a neighbour does, so the pill is whole
                      // whenever it stands alone -- including on the selected row.
                      chipsShown ? "rounded-e-[var(--r-md)]" : "rounded-e-[15px] group-hover:rounded-e-[var(--r-md)]",
                      active ? "bg-accent text-white" : "text-primary hover:bg-[var(--bg-hover)]",
                    ].filter(Boolean).join(" ")}
                    style={{ height: LAYER_ROW_H }}>
                    <Icon size={15} className="shrink-0" />
                    <span style={{ fontSize: "var(--t13)" }} className="flex-1 truncate">{l.name || M.label}</span>
                  </div>
                  {/* One group of three: name, lock, eye. That only works because each part
                      takes its notch when a neighbour is actually there -- as a fixed choice it
                      looked wrong in whichever state it was not made for.

                      Each chip collapses on its own, leading gap included, so a locked layer
                      shows the lock alone rather than dragging the eye out with it. Reserving
                      the space instead left a gap beside the selected row, and resizing the
                      name pill on hover made the list twitch. A chip stays out permanently when
                      it has something to report: a row must be able to say it is locked or
                      hidden without being hovered. 15px is half the row height, as a literal
                      because Tailwind only sees class names it can read. Never --r-full here: a
                      browser scales all of a box's radii down once two on one side exceed it, and
                      9999px next to a 6px notch flattened the notch to nothing. */}
                  <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${lockShown ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayer(l.id, { locked: !l.locked }); }}
                      aria-label={t("ovlLocked")} aria-pressed={!!l.locked}
                      className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-[background-color,border-radius] duration-150 rounded-s-[var(--r-md)] ${l.locked ? "text-primary" : "text-secondary"} ${eyeShown ? "rounded-e-[var(--r-md)]" : "rounded-e-[15px] group-hover:rounded-e-[var(--r-md)]"}`}
                      style={{ width: LAYER_ROW_H, height: LAYER_ROW_H }}>
                      {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                  </span>
                  <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${eyeShown ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayer(l.id, { visible: l.visible === false }); }}
                      aria-label={t("ovlVisible")} aria-pressed={l.visible !== false}
                      className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors duration-150 rounded-s-[var(--r-md)] rounded-e-[15px] ${l.visible === false ? "text-primary" : "text-secondary"}`}
                      style={{ width: LAYER_ROW_H, height: LAYER_ROW_H }}>
                      {l.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>}

      {/* ── Canvas viewport ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 mx-2.5 mb-2.5">
      <div
        ref={viewportRef}
        className="relative flex-1 min-h-0 overflow-hidden rounded-[var(--r-2xl)]"
        style={{ background: CANVAS_BG }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          // Handles the whole viewport (canvas + surrounding free space). Clicks on a layer
          // box / handle stopPropagation, so they never reach here.
          if (e.button === 1) { startPan(e); return; }   // middle mouse → pan anywhere
          if (e.button !== 0) return;                     // ignore right-click
          tool ? startDraw(e) : startMarquee(e);          // tool → draw; else selection box
        }}
        onContextMenu={(e) => openMenu(e, "canvas")}
      >
      {/* ── Stage (pan + zoom) ───────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: doc.canvas.width, height: doc.canvas.height }}
      >
        <div className="absolute inset-0" style={{ boxShadow: "0 0 0 1px var(--stroke)" }}>
          <iframe ref={iframeRef} key={iframeKey} src={previewSrc} title={t("ovlPreview")}
            width={doc.canvas.width} height={doc.canvas.height}
            style={{ border: "none", display: "block", background: "transparent", pointerEvents: "none" }} />
        </div>
        {prefs.showGrid && (() => {
          const step = 1;                     // one line per document pixel
          const px = step * zoom;             // ... on screen
          if (px < 5) return null;            // below this it is a grey wash, not a grid
          const strength = clamp((px - 5) / 10, 0, 1) * 0.14;
          return (
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage:
                `linear-gradient(to right, rgba(255,255,255,${strength}) ${1 / zoom}px, transparent ${1 / zoom}px),` +
                `linear-gradient(to bottom, rgba(255,255,255,${strength}) ${1 / zoom}px, transparent ${1 / zoom}px)`,
              backgroundSize: `${step}px ${step}px`,
            }} />
          );
        })()}

        {/* Interaction layer (over the iframe). Empty-area pointerdowns bubble up to the
            viewport handler, which covers both the canvas and the free space around it. */}
        <div className="absolute inset-0" style={{ pointerEvents: "auto", cursor: tool ? "crosshair" : "default" }}>
          {orderedAsc.map((l) => {
            const isSel = selectedIds.includes(l.id);       // accent outline for every selected layer
            const isPrimary = l.id === selectedId;          // handles/badge only for a single selection
            const interactive = !l.locked && l.visible !== false && !tool;
            return (
              <div key={l.id}
                onPointerDown={interactive ? (e) => {
                  if (e.button === 1) { startPan(e); return; }  // middle mouse pans even over a layer
                  if (e.button !== 0) return;
                  startGesture(e, "move", null, l);
                } : undefined}
                onDoubleClick={interactive ? (e) => { e.stopPropagation(); setSelectedIds(pickOnDoubleClick(doc, l.id, selectedIds)); } : undefined}
                onContextMenu={interactive ? (e) => menuOnLayers(e, selectedIds.includes(l.id) ? selectedIds : pickOnClick(doc, l.id, selectedIds)) : undefined}
                onPointerEnter={interactive ? () => setHoveredId(l.id) : undefined}
                onPointerLeave={interactive ? () => setHoveredId((h) => (h === l.id ? null : h)) : undefined}
                style={{
                  position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h,
                  transform: `rotate(${l.rotation || 0}deg)`, transformOrigin: "center center",
                  cursor: "default",
                  pointerEvents: interactive ? "auto" : "none",
                  boxShadow: isSel
                    ? `0 0 0 ${BW}px ${selGroup ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "var(--accent)"}`
                    : (hoveredId === l.id ? `0 0 0 ${BW}px rgba(255,255,255,0.4)` : "none"),
                }}
              >
                {isPrimary && interactive && (
                  <>
                    {/* rotate knob */}
                    <div
                      onPointerDown={(e) => startGesture(e, "rotate", null, l)}
                      style={{
                        position: "absolute", left: "50%", top: -22 / zoom,
                        width: HANDLE_PX, height: HANDLE_PX, borderRadius: "var(--r-full)",
                        background: "var(--accent)", border: "1.5px solid #fff", cursor: "grab",
                        ...unscale(" translate(-50%, -50%)"),
                      }}
                    />
                    {/* angle badge — visible while rotating */}
                    {rotAngle && (
                      <div style={{
                        position: "absolute", left: "50%", top: -44 / zoom,
                        background: rotAngle.snapped ? "var(--accent)" : "rgba(0,0,0,0.72)",
                        color: "#fff",
                        padding: "2px 5px",
                        borderRadius: "var(--r-sm)",
                        fontSize: 11,
                        ...unscale(" translate(-50%, 0)"),
                        lineHeight: 1.4,
                        fontFamily: "monospace",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        userSelect: "none",
                        boxShadow: rotAngle.snapped ? `0 0 0 ${1 / zoom}px rgba(255,255,255,0.3)` : "none",
                      }}>
                        {rotAngle.deg}°
                      </div>
                    )}
                    {/* resize handles */}
                    {HANDLES.map((h) => (
                      <div key={h.dir}
                        onPointerDown={(e) => startGesture(e, "resize", h.dir, l)}
                        style={{
                          position: "absolute", left: `${h.x * 100}%`, top: `${h.y * 100}%`,
                          width: HANDLE_PX, height: HANDLE_PX,
                          background: "#fff", border: "1.5px solid var(--accent)", borderRadius: "var(--r-xs)",
                          cursor: `${h.cur}-resize`,
                          ...unscale(" translate(-50%, -50%)"),
                        }}
                      />
                    ))}
                    {/* size badge (W × H) below the element, Figma-style */}
                    {prefs.showDims && <div style={{
                      position: "absolute", left: "50%", top: "100%",
                      ...unscale(" translate(-50%, 8px)"),
                      background: "var(--accent)", color: "#fff",
                      padding: "2px 7px",
                      borderRadius: "var(--r-sm)", fontSize: 11, lineHeight: 1.4, fontWeight: 600,
                      fontFamily: "var(--font)", whiteSpace: "nowrap",
                      pointerEvents: "none", userSelect: "none", fontVariantNumeric: "tabular-nums",
                    }}>
                      {Math.round(l.w)} × {Math.round(l.h)}
                    </div>}
                  </>
                )}
              </div>
            );
          })}
          {/* A selected group reads as one object: one box around all of it. */}
          {selGroup && (() => {
            const bb = boundsOf(membersOf(doc, selGroup.id));
            return bb && (
              <div style={{ position: "absolute", left: bb.x, top: bb.y, width: bb.w, height: bb.h,
                boxShadow: `0 0 0 ${BW}px var(--accent)`, pointerEvents: "none" }} />
            );
          })()}
          {/* Live draw preview */}
          {drawRect && (
            <div style={{
              position: "absolute", left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h,
              border: `${1 / zoom}px dashed var(--accent)`, background: "color-mix(in srgb, var(--accent) 10%, transparent)", pointerEvents: "none",
            }} />
          )}
          {/* Selection marquee (left-drag on empty canvas) */}
          {marquee && (
            <div style={{
              position: "absolute", left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h,
              boxShadow: `inset 0 0 0 ${1 / zoom}px var(--accent)`, background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              pointerEvents: "none",
            }} />
          )}
        </div>

        {/* Snap guide lines (span the canvas; counter-scaled to ~1px) */}
        {(snapLines.x != null || snapLines.y != null) && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
            {snapLines.x != null && (
              <div style={{ position: "absolute", left: snapLines.x, top: 0, width: 1 / zoom, height: doc.canvas.height, background: "var(--accent)" }} />
            )}
            {snapLines.y != null && (
              <div style={{ position: "absolute", top: snapLines.y, left: 0, height: 1 / zoom, width: doc.canvas.width, background: "var(--accent)" }} />
            )}
          </div>
        )}
      </div>

      {/* ── Zoom / fit control (bottom-left) ─────────────────────────────── */}
      {/* A button group like the toolbar and the header: 30px chips, pill on the free ends and
          a notch where they touch. It used to be a bordered tray with buttons loose inside,
          which was the last control in the editor still speaking the old dialect. */}
      <div className="absolute bottom-3 left-3 flex items-center" style={{ gap: HDR_NOTCH }}>
        {[
          { key: "out", label: t("ovlZoomOut"), onPress: () => setZoom((z) => clamp(z * 0.8, ZOOM_MIN, ZOOM_MAX)), content: <Minus size={12} /> },
          { key: "level", label: t("ovlZoomReset"), onPress: () => setZoom(1), wide: true, content: `${Math.round(zoom * 100)}%` },
          { key: "in", label: t("ovlZoomIn"), onPress: () => setZoom((z) => clamp(z * 1.25, ZOOM_MIN, ZOOM_MAX)), content: <Plus size={12} /> },
          { key: "fit", label: t("ovlZoomFit"), onPress: () => fit(), content: <ArrowsOut size={13} /> },
        ].map((b, i, all) => (
          <Tooltip key={b.key} text={b.label}>
            <button type="button" onClick={b.onPress} aria-label={b.label}
              style={{ height: 30, borderRadius: hdrCorners(i > 0, i < all.length - 1, 30), fontSize: "var(--t12)" }}
              className={`${b.wide ? "px-2 min-w-[58px] tabular-nums font-medium" : "w-[30px]"} flex items-center justify-center border-0 bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)] transition-colors cursor-pointer`}>
              {b.content}
            </button>
          </Tooltip>
        ))}
      </div>

      </div>{/* end canvas viewport */}

      {/* ── Element toolbar, in its own band under the canvas ─────────────────────────
             Separate chips rather than one enclosing pill: the concept gives each tool its own
             surface, so the row reads as six controls instead of one segmented widget. ────── */}
      <div className="shrink-0 flex items-center justify-center pt-2.5 relative" style={{ gap: HDR_NOTCH }}>
        {libOpen && (
          <div data-ovl-library data-ovl-panel
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-40 w-[480px] max-w-[calc(100%-24px)] flex flex-col overflow-hidden"
            style={{ ...PANEL_SHELL, maxHeight: 440 }}>
            {/* Search across the top, as in Figma's resource browser */}
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
              <SearchPill value={libQuery} onChange={setLibQuery} placeholder={t("ovlElementsSearch")} className="flex-1" />
              <ChipGroup items={[{ key: "x", icon: <X size={12} />, aria: t("close"), onPress: () => { setLibOpen(false); setElementName(null); } }]} />
            </div>
            {/* Folder chips, in the place Figma gives its tabs. Right-click renames or dissolves a
                folder; a card dropped on a chip is filed there. */}
            {(elements.length > 0 || libFolders.length > 0) && (
              <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto shrink-0">
                {[["__all__", t("ovlElementsAll")], ...libFolders.map((f) => [f, f]), ...(libFolders.length ? [["__none__", t("ovlElementsNoFolder")]] : [])].map(([k, label]) => {
                  const on = libFolder === k;
                  const drop = !!elDrag && elDrag.chip === k && k !== "__all__";
                  return renamingFolder === k ? (
                    <input key={k} autoFocus value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)}
                      onBlur={finishFolderRename}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setRenamingFolder(null); } }}
                      style={{ fontSize: "var(--t12)", width: Math.max(80, folderDraft.length * 8 + 28) }}
                      className="h-[26px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary border border-accent outline-none shrink-0" />
                  ) : (
                    <button key={k} type="button" data-folder-chip={k} onClick={() => setLibFolder(k)}
                      onContextMenu={(e) => { if (k.startsWith("__")) { e.preventDefault(); return; } openMenu(e, "folder", k); }}
                      className={`h-[26px] px-3 shrink-0 flex items-center gap-1.5 rounded-[var(--r-full)] border-0 whitespace-nowrap cursor-pointer transition-colors ${on ? "bg-[var(--surface-3)] text-primary" : "bg-transparent text-secondary hover:text-primary hover:bg-[var(--surface-2)]"}`}
                      style={{ fontSize: "var(--t12)", boxShadow: drop ? "0 0 0 2px var(--accent)" : "none" }}>
                      {!k.startsWith("__") && <Folder size={11} />}{label}
                    </button>
                  );
                })}
                {creatingFolder ? (
                  <input autoFocus value={newFolderDraft} onChange={(e) => setNewFolderDraft(e.target.value)} placeholder={t("ovlFolderName")}
                    onBlur={createFolder}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setCreatingFolder(false); setNewFolderDraft(""); } }}
                    style={{ fontSize: "var(--t12)", width: Math.max(110, newFolderDraft.length * 8 + 28) }}
                    className="h-[26px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary border border-accent outline-none shrink-0" />
                ) : (
                  <button type="button" onClick={() => { setCreatingFolder(true); setNewFolderDraft(""); }}
                    title={t("ovlElementNewFolder")} aria-label={t("ovlElementNewFolder")}
                    className="h-[26px] px-2.5 shrink-0 flex items-center gap-1.5 rounded-[var(--r-full)] border-0 bg-transparent text-muted hover:text-primary hover:bg-[var(--surface-2)] cursor-pointer whitespace-nowrap"
                    style={{ fontSize: "var(--t12)" }}><Plus size={11} />{t("ovlFolderNew")}</button>
                )}
              </div>
            )}
            {/* pt: the picked card's ring sits outside the card, and the scroll box clipped it at the top. */}
            <ScrollShadowRoot size={24} className="overflow-y-auto min-h-0 px-3 pt-1 pb-3 flex flex-col gap-3">
              {inFolder.length === 0 && (
                <div className="py-8 text-center text-muted leading-snug" style={{ fontSize: "var(--t12)" }}>
                  {elements.length ? t("ovlElementsNoMatch") : t("ovlElementsEmpty")}
                </div>
              )}
              {libSections.map((sec) => {
                const folded = sec.key !== "__flat__" && collapsedFolders.has(sec.key);
                return (
                  <div key={sec.key} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1 px-1">
                      {sec.key !== "__flat__" && (
                        <button type="button" onClick={() => toggleFolderOpen(sec.key)} aria-expanded={!folded} aria-label={sec.label}
                          className="w-5 h-5 flex items-center justify-center border-0 bg-transparent text-secondary hover:text-primary cursor-pointer">
                          {folded ? <CaretRight size={10} /> : <CaretDown size={10} />}
                        </button>
                      )}
                      <span style={{ fontSize: "var(--t12)" }} className="font-semibold text-secondary truncate">{sec.label}</span>
                      <span style={{ fontSize: "var(--t12)" }} className="ml-1 text-muted tabular-nums">{sec.items.length}</span>
                    </div>
                    {!folded && (
                      <div className="grid grid-cols-4 gap-x-2 gap-y-3">{sec.items.map(renderElementCard)}</div>
                    )}
                  </div>
                );
              })}
            </ScrollShadowRoot>
            {/* Footer: save on the left, insert on the right. While naming, the name takes its place. */}
            <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ background: PANEL_FOOT }}
              onKeyDown={(e) => {
                if (newFolderFor !== null) {
                  if (e.key === "Enter") { persistElements(moveToFolder(elements, newFolderFor, folderDraft)); setNewFolderFor(null); }
                  if (e.key === "Escape") { e.stopPropagation(); setNewFolderFor(null); }
                  return;
                }
                if (elementName === null) return;
                if (e.key === "Enter") saveElement();
                if (e.key === "Escape") { e.stopPropagation(); setElementName(null); }
              }}>
              {newFolderFor !== null ? (
                <>
                  <div className="flex-1 flex items-center gap-2 h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-accent">
                    <Folder size={12} className="text-muted shrink-0" />
                    <input autoFocus value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} placeholder={t("ovlFolderName")}
                      className="flex-1 min-w-0 bg-transparent outline-none text-primary" style={{ fontSize: "var(--t12)" }} />
                  </div>
                  <ChipGroup items={[
                    { key: "move", label: t("ovlElementMove"), icon: <Check size={12} />, active: true, disabled: !cleanFolder(folderDraft),
                      onPress: () => { persistElements(moveToFolder(elements, newFolderFor, folderDraft)); setNewFolderFor(null); } },
                    { key: "cancel", icon: <X size={12} />, aria: t("close"), onPress: () => setNewFolderFor(null) },
                  ]} />
                </>
              ) : elementName !== null ? (
                <>
                  <div className="flex-1 flex items-center h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-accent">
                    <input autoFocus value={elementName} onChange={(e) => setElementName(e.target.value)} placeholder={t("ovlElementName")}
                      className="flex-1 min-w-0 bg-transparent outline-none text-primary" style={{ fontSize: "var(--t12)" }} />
                  </div>
                  {/* The folder: an existing one from the suggestions, or a new name. */}
                  <div className="w-[130px] flex items-center gap-2 h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-transparent focus-within:border-accent">
                    <Folder size={12} className="text-muted shrink-0" />
                    <input list="ovl-element-folders" value={elementFolder} onChange={(e) => setElementFolder(e.target.value)} placeholder={t("ovlElementFolder")}
                      className="flex-1 min-w-0 bg-transparent outline-none text-primary" style={{ fontSize: "var(--t12)" }} />
                    <datalist id="ovl-element-folders">{libFolders.map((f) => <option key={f} value={f} />)}</datalist>
                  </div>
                  <ChipGroup items={[
                    { key: "save", label: t("ovlSave"), icon: <Check size={12} />, active: true, onPress: saveElement },
                    { key: "cancel", icon: <X size={12} />, aria: t("close"), onPress: () => setElementName(null) },
                  ]} />
                </>
              ) : (
                <>
                  <ChipGroup items={[{ key: "save", label: t("ovlElementSave"), icon: <Plus size={12} />, kbd: pickedEl ? undefined : "Ctrl+Alt+K",
                    disabled: !selectedIds.length, onPress: startSaveElement }]} />
                  <div className="ml-auto flex items-center gap-2">
                    {pickedElement && (
                      /* The picked card's actions, at the size of every other control. */
                      <div className="flex items-center" style={{ gap: HDR_NOTCH }}>
                        <button type="button" title={t("ovlElementRename")} aria-label={t("ovlElementRename")}
                          onClick={() => { setRenamingEl(pickedElement.id); setElDraft(pickedElement.name || ""); }}
                          className="w-[30px] h-[30px] flex items-center justify-center border-0 bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)] cursor-pointer"
                          style={{ borderRadius: hdrCorners(false, true, 30) }}><PencilSimple size={13} /></button>
                        <Dropdown>
                          <DropdownTrigger aria-label={t("ovlElementMoveTo")}
                            className="h-[30px] px-3 flex items-center gap-1.5 border-0 bg-[var(--surface-2)] text-secondary hover:text-primary hover:bg-[var(--surface-3)] cursor-pointer"
                            style={{ borderRadius: hdrCorners(true, true, 30), fontSize: "var(--t12)" }}>
                            <Folder size={12} /><span className="max-w-[90px] truncate">{cleanFolder(pickedElement.folder) || t("ovlElementFolder")}</span><CaretDown size={9} />
                          </DropdownTrigger>
                          <DropdownPopover placement="top end" className="[--dd-min-w:11rem]">
                            <DropdownMenu aria-label={t("ovlElementMoveTo")} onAction={(k) => moveElementTo(pickedElement.id, String(k))}>
                              <DropdownSection>
                                {libFolders.map((f) => (
                                  <DropdownItem key={f} id={f} textValue={f}>
                                    <Folder size={12} />{f}{cleanFolder(pickedElement.folder) === f && <Check size={11} className="ml-auto" />}
                                  </DropdownItem>
                                ))}
                                <DropdownItem key="__none__" id="__none__" textValue={t("ovlElementsNoFolder")}>
                                  <span className="w-3" />{t("ovlElementsNoFolder")}{!cleanFolder(pickedElement.folder) && <Check size={11} className="ml-auto" />}
                                </DropdownItem>
                              </DropdownSection>
                              <DropdownSection className="border-t border-border mt-1 pt-1">
                                <DropdownItem key="__new__" id="__new__" textValue={t("ovlElementNewFolder")}><Plus size={12} />{t("ovlElementNewFolder")}</DropdownItem>
                              </DropdownSection>
                            </DropdownMenu>
                          </DropdownPopover>
                        </Dropdown>
                        <button type="button" title={confirmDelEl === pickedElement.id ? t("ovlElementDeleteConfirm") : t("ovlMenuDelete")} aria-label={t("ovlMenuDelete")}
                          onClick={() => {
                            const id = pickedElement.id;
                            if (confirmDelEl === id) { persistElements(elements.filter((x) => x.id !== id)); setConfirmDelEl(null); setPickedEl(null); }
                            else { setConfirmDelEl(id); setTimeout(() => setConfirmDelEl((c) => (c === id ? null : c)), 2500); }
                          }}
                          className={`h-[30px] flex items-center justify-center gap-1.5 border-0 cursor-pointer ${confirmDelEl === pickedElement.id ? "px-3 bg-[var(--status-danger)] text-white" : "w-[30px] bg-[var(--surface-2)] text-secondary hover:text-[var(--status-danger)] hover:bg-[var(--surface-3)]"}`}
                          style={{ borderRadius: hdrCorners(true, false, 30), fontSize: "var(--t12)" }}>
                          <Trash size={13} />{confirmDelEl === pickedElement.id && t("ovlElementDeleteConfirm")}
                        </button>
                      </div>
                    )}
                    <ChipGroup items={[{ key: "insert", label: t("ovlElementInsert"), kbd: "↵", active: !!pickedEl,
                      disabled: !pickedEl, onPress: insertPicked }]} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {TOOLBAR_ITEMS(t).map((it, i, all) => {
          // The group rule the whole editor follows: the free ends of the row keep the pill
          // radius, the touching ends get the notch. At 44px tall the pill value is 22, and
          // hdrCorners derives it from the height so the two can never drift apart.
          const corners = hdrCorners(i > 0, i < all.length - 1, TOOL_H);
          return it.variants ? (
            /* Shapes carry their variant menu inside the same chip: the caret belongs to the
               tool, so the pair reads as one control with a divider, not two chips. */
            <div key={it.key}
              style={{ height: TOOL_H, borderRadius: corners }}
              className={`flex items-center overflow-hidden transition-colors ${
                tool?.type === "shape" ? "bg-accent text-white" : "bg-[var(--surface-2)] text-secondary"
              }`}>
              <ToolBtn active={tool?.type === "shape"} label={it.label} bare
                onPress={() => setTool({ type: "shape", shape: "rect" })}>{it.icon}</ToolBtn>
              <div className={`w-px h-4 ${tool?.type === "shape" ? "bg-white/30" : "bg-[var(--stroke)]"}`} />
              <Dropdown>
                <DropdownTrigger aria-label={t("ovlShape")} style={{ height: TOOL_H }}
                  className="w-7 pr-1 flex items-center justify-center border-0 bg-transparent cursor-pointer text-current hover:brightness-125 transition-[filter]">
                  <CaretDown size={11} />
                </DropdownTrigger>
                <DropdownPopover placement="top start" className="[--dd-min-w:11rem]">
                  <DropdownMenu aria-label={t("ovlShape")} onAction={(key) => setTool({ type: "shape", shape: String(key) })}>
                    {it.variants.map((v) => (
                      <DropdownItem key={v} id={v} textValue={t("ovlShape_" + v)}>{t("ovlShape_" + v)}</DropdownItem>
                    ))}
                  </DropdownMenu>
                </DropdownPopover>
              </Dropdown>
            </div>
          ) : (
            <ToolBtn key={it.key} active={it.isActive(tool)} label={it.label} corners={corners}
              onPress={() => setTool(it.tool)}>{it.icon}</ToolBtn>
          );
        })}
        <div className="w-2" />
        <ToolBtn active={libOpen} label={t("ovlElements")} corners={hdrCorners(false, false, TOOL_H)}
          onPress={() => { setLibOpen((o) => !o); setElementName(null); }}><Shapes size={16} /></ToolBtn>
      </div>
      <ContextMenu menu={ctxMenu} items={ctxMenu ? menuItems(ctxMenu) : null} onClose={() => setCtxMenu(null)} />
      {/* While an element is dragged: where it lands on the canvas, at its real size, or a name
          chip while the pointer is still elsewhere. */}
      {elDrag && (elDrag.over ? (
        <div className="fixed pointer-events-none z-[9999] rounded-[var(--r-sm)]"
          style={{ left: elDrag.x, top: elDrag.y, width: elDrag.el.w * zoom, height: elDrag.el.h * zoom, transform: "translate(-50%, -50%)",
            border: "1.5px dashed var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }} />
      ) : (
        <div className="fixed pointer-events-none z-[9999] px-3 py-1.5 rounded-[var(--r-full)] bg-accent text-white shadow-lg"
          style={{ left: elDrag.x + 12, top: elDrag.y + 12, fontSize: "var(--t12)" }}>{elDrag.el.name}</div>
      ))}
      </div>{/* end canvas + toolbar column */}

      {/* ── Right: inspector (docked) ──────────────────────────────────────────── */}
      {prefs.showRight && <div className="shrink-0 flex flex-col relative" style={{ width: rightW }}>
        <div onPointerDown={(e) => startPanelResize("right", e)}
          className="absolute top-0 left-0 h-full w-1.5 -translate-x-1/2 z-20 cursor-col-resize hover:bg-[var(--accent)]/40" />
        <div className="overflow-y-auto flex-1 min-h-0 px-[26px] py-3"
          onPointerDown={(e) => { if (selProp && !e.target.closest("[data-propsel]")) setSelProp(null); }}>
        <PropSelCtx.Provider value={propSelValue}>
          {selectedIds.length > 1 ? (() => {
            const bb = boundsOf(doc.layers.filter((l) => selectedIds.includes(l.id))) || { x: 0, y: 0, w: 0, h: 0 };
            return (
            <>
              {selGroup ? (
                <div className="mb-3 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <ObjectGroup size={16} className="text-accent shrink-0" />
                    <TextFieldRoot value={selGroup.name ?? ""} onChange={(v) => liveEdit((b) => setGroup(b, selGroup.id, { name: v }))} aria-label={t("ovlName")} className="flex-1 min-w-0">
                      <InputRoot className="text-[length:var(--t12)]! h-8! bg-[var(--surface-2)]! border-border!" placeholder={t("ovlGroupName")} />
                    </TextFieldRoot>
                    <Button variant="ghost" size="sm" isIconOnly onPress={duplicateSelected} aria-label={t("ovlMenuDuplicate")} className="shrink-0"><Copy size={14} /></Button>
                    <Button variant="ghost" size="sm" isIconOnly onPress={deleteSelected} aria-label={t("ovlMenuDelete")} className="shrink-0 text-[var(--status-danger)]!"><Trash size={14} /></Button>
                  </div>
                  <div className="text-[length:var(--t11)] text-muted leading-snug">{t("ovlGroupHint")}</div>
                </div>
              ) : (
                <>
                  <div className="text-[length:var(--t12)] font-semibold text-primary mb-1">{selectedIds.length} {t("ovlSelectedCount") || "selected"}</div>
                  <div className="text-[length:var(--t11)] text-muted mb-3 leading-snug">{t("ovlMultiHint") || "Drag any of them to move the group. Delete removes all."}</div>
                </>
              )}
              <Section title={t("ovlPosition")}>
                <SubLabel>{t("ovlAlignment") || "Alignment"}</SubLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Segmented value={null} onChange={(w) => alignSelected("x", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.hL, aria: t("ovlLeft") }, { value: "center", icon: ALIGN_GLYPH.hC, aria: t("ovlCenter") }, { value: "end", icon: ALIGN_GLYPH.hR, aria: t("ovlRight") },
                  ]} />
                  <Segmented value={null} onChange={(w) => alignSelected("y", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.vT, aria: t("ovlTop") }, { value: "center", icon: ALIGN_GLYPH.vM, aria: t("ovlMiddle") }, { value: "end", icon: ALIGN_GLYPH.vB, aria: t("ovlBottom") },
                  ]} />
                </div>
                <Field label={t("ovlPosition")}>
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix="X" value={bb.x} onChange={(v) => moveSelection((b) => ({ dx: v - b.x }))} />
                    <PillNum prefix="Y" value={bb.y} onChange={(v) => moveSelection((b) => ({ dy: v - b.y }))} />
                  </div>
                </Field>
                <div className="text-[length:var(--t11)] text-muted tabular-nums">{Math.round(bb.w)} × {Math.round(bb.h)}</div>
              </Section>
              {(() => {
                const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
                const ops = [...new Set(picked.map((l) => l.opacity ?? 100))];
                const colors = selectionColors(picked);
                return (
                  <>
                    <Section title={t("ovlLayerSection") || "Layer"}>
                      <Field label={t("ovlOpacity")}>
                        <PercentField label={t("ovlOpacity")} value={ops.length === 1 ? ops[0] : "–"}
                          onChange={(o) => liveEdit((b) => ({ ...b, layers: b.layers.map((l) => (selectedIds.includes(l.id) ? { ...l, opacity: o } : l)) }))} />
                      </Field>
                    </Section>
                    {colors.length > 0 && (
                      <Section title={t("ovlSelectionColors")}>
                        <div className="flex flex-col gap-1.5">
                          {colors.map((c, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <div className="flex-1 min-w-0">
                                <ColorField label={t("ovlSelectionColors")} value={c.color} onChange={(v) => recolorSelection(c.color, v)} />
                              </div>
                              {c.count > 1 && <span className="shrink-0 w-6 text-right text-[length:var(--t11)] text-muted tabular-nums">×{c.count}</span>}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </>
                );
              })()}
              {selGroup && (
                <GroupAnimationSection t={t} group={selGroup} onReplay={replayEntrances}
                  onChange={(patch) => liveEdit((b) => setGroup(b, selGroup.id, patch))} />
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                {selGroup ? (
                  <Button variant="secondary" size="sm" className="gap-1.5" onPress={ungroupSelected}><ObjectUngroup size={13} /> {t("ovlUngroup")}</Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" className="gap-1.5" onPress={groupSelected}><ObjectGroup size={13} /> {t("ovlGroup")}</Button>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-[var(--status-danger)]!" onPress={deleteSelected}>
                      <Trash size={13} /> {t("ovlMenuDelete")}
                    </Button>
                  </>
                )}
              </div>
            </>
            );
          })() : !selected ? (
            <>
              <div className="text-[length:var(--t12)] font-semibold text-primary mb-1">{t("ovlCanvas")}</div>
              <div className="text-[length:var(--t11)] text-muted mb-3 leading-snug">{t("ovlNoSelection")}</div>
              <Section title={t("ovlSize")}>
                <div className="grid grid-cols-2 gap-2">
                  <PillNum prefix="W" value={doc.canvas.width} min={40} max={3840} onChange={(v) => updateCanvas({ width: v })} />
                  <PillNum prefix="H" value={doc.canvas.height} min={20} max={2160} onChange={(v) => updateCanvas({ height: v })} />
                </div>
                <SwitchField label={t("overlayAutoHide")} checked={doc.canvas.autoHide} onChange={(v) => updateCanvas({ autoHide: v })} />
                <Field label={t("ovlEntranceOn")}>
                  <SelectField value={doc.canvas.entranceOn || "track"} onChange={(v) => updateCanvas({ entranceOn: v })}
                    options={[{ value: "track", label: t("ovlEntranceOnTrack") }, { value: "appear", label: t("ovlEntranceOnAppear") }]} />
                </Field>
              </Section>
              <Section title={t("ovlBackground")}>
                <PaintField t={t} paint={doc.canvas.bg} onChange={(patch) => updateCanvasBg(patch)}
                  opacity={doc.canvas.bg?.opacity} onOpacity={(v) => updateCanvasBg({ opacity: v })} />
                <GradientFields t={t} paint={doc.canvas.bg} onChange={(patch) => updateCanvasBg(patch)} />
                <SwitchField label={t("ovlBlurFromCover")} checked={doc.canvas.bg?.blurFromCover} onChange={(v) => updateCanvasBg({ blurFromCover: v })} />
                {doc.canvas.bg?.blurFromCover && (
                  <PillNum prefix={t("ovlBlur")} value={doc.canvas.bg?.blur} min={0} max={60} onChange={(v) => updateCanvasBg({ blur: v })} />
                )}
              </Section>
              <Section title={t("ovlCorners")} right={
                <Button variant="ghost" size="sm" isIconOnly
                  aria-label={t("ovlCornersIndividual") || "Individual corners"}
                  onPress={() => setCanvasCornersInd((v) => !v)}
                  className={canvasCornersInd ? "text-accent!" : ""}>
                  <OvlCornerRadius size={13} />
                </Button>}>
                {!canvasCornersInd ? (
                  <PillNum prefix={t("ovlRadius")} value={doc.canvas.corners?.TL} min={0} max={400}
                    onChange={(v) => updateCanvas({ corners: uniformCorners(v, doc.canvas.corners?.typeTL || "r") })} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix={CORNER_GLYPH.TL} ariaLabel="Top left" value={doc.canvas.corners?.TL ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), TL: v } })} />
                    <PillNum prefix={CORNER_GLYPH.TR} ariaLabel="Top right" value={doc.canvas.corners?.TR ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), TR: v } })} />
                    <PillNum prefix={CORNER_GLYPH.BL} ariaLabel="Bottom left" value={doc.canvas.corners?.BL ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), BL: v } })} />
                    <PillNum prefix={CORNER_GLYPH.BR} ariaLabel="Bottom right" value={doc.canvas.corners?.BR ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), BR: v } })} />
                  </div>
                )}
                {SHOW_CORNER_TYPE && (
                  <SelectField value={doc.canvas.corners?.typeTL || "r"} options={CORNER_OPTS(t)}
                    onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), typeTL: v, typeTR: v, typeBR: v, typeBL: v } })} />
                )}
              </Section>
              <Section title={t("ovlBorder")} right={
                <Switch isSelected={!!doc.canvas.border?.on} onChange={(v) => updateCanvasSub("border", { on: v })} aria-label={t("ovlBorder")}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                </Switch>}>
                {doc.canvas.border?.on && (<>
                  <ColorField label={t("ovlColor")} value={doc.canvas.border?.color} onChange={(v) => updateCanvasSub("border", { color: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix={t("ovlBorderWidth")} value={doc.canvas.border?.width} min={0} max={40} step={0.5} onChange={(v) => updateCanvasSub("border", { width: v })} />
                    <PillNum prefix={t("ovlGlow")} value={doc.canvas.border?.glow} min={0} max={40} onChange={(v) => updateCanvasSub("border", { glow: v })} />
                  </div>
                </>)}
              </Section>
              <Section title={t("ovlShadow")} right={
                <Switch isSelected={!!doc.canvas.shadow?.on} onChange={(v) => updateCanvasSub("shadow", { on: v })} aria-label={t("ovlShadow")}>
                  <Switch.Control><Switch.Thumb /></Switch.Control>
                </Switch>}>
                {doc.canvas.shadow?.on && (
                  <PillNum prefix={t("ovlStrength")} value={Math.round((doc.canvas.shadow?.strength ?? 0.35) * 100)} min={0} max={100}
                    onChange={(v) => updateCanvasSub("shadow", { strength: clamp(v / 100, 0, 1) })} />
                )}
              </Section>
            </>
          ) : (() => {
            const sc = selected.style?.corners;
            const hasCorners = !!sc && !(selected.type === "shape" && selected.style?.shape && selected.style.shape !== "rect");
            const cornerType = sc?.typeTL || "r";
            const baseC = sc || uniformCorners(0, "r");
            const setCorner = (key, v) => setStyle(selected.id, { corners: { ...baseC, [key]: v } });
            const setCornersType = (v) => setStyle(selected.id, { corners: { ...baseC, typeTL: v, typeTR: v, typeBR: v, typeBL: v } });
            const ratio = selected.h && selected.w ? selected.w / selected.h : 1;
            const TypeIcon = (TYPE_META[selected.type] || TYPE_META.shape).icon;
            return (
            <>
              {/* Header: type + name + duplicate + delete, then an align-to-canvas row */}
              <div className="mb-3 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <TypeIcon size={16} className="text-accent shrink-0" />
                  <TextFieldRoot value={selected.name ?? ""} onChange={(v) => setLayer(selected.id, { name: v })} aria-label={t("ovlName")} className="flex-1 min-w-0">
                    <InputRoot className="text-[length:var(--t12)]! h-8! bg-[var(--surface-2)]! border-border!" placeholder={(TYPE_META[selected.type] || {}).label} />
                  </TextFieldRoot>
                  <Button variant="ghost" size="sm" isIconOnly onPress={duplicateSelected} aria-label={t("ovlMenuDuplicate")} className="shrink-0"><Copy size={14} /></Button>
                  <Button variant="ghost" size="sm" isIconOnly onPress={() => deleteLayer(selected.id)} aria-label={t("ovlMenuDelete")} className="shrink-0 text-[var(--status-danger)]!"><Trash size={14} /></Button>
                </div>
              </div>

              <Section title={t("ovlPosition")}>
                {/* Aligning to the canvas is positioning, so it lives in this section rather
                    than floating above it as its own unlabelled row. */}
                <SubLabel>{t("ovlAlignment") || "Alignment"}</SubLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Segmented value={null} onChange={(w) => alignSelected("x", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.hL, aria: t("ovlLeft") }, { value: "center", icon: ALIGN_GLYPH.hC, aria: t("ovlCenter") }, { value: "end", icon: ALIGN_GLYPH.hR, aria: t("ovlRight") },
                  ]} />
                  <Segmented value={null} onChange={(w) => alignSelected("y", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.vT, aria: t("ovlTop") }, { value: "center", icon: ALIGN_GLYPH.vM, aria: t("ovlMiddle") }, { value: "end", icon: ALIGN_GLYPH.vB, aria: t("ovlBottom") },
                  ]} />
                </div>
                <Field label={t("ovlPosition")}>
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix="X" value={selected.x} onChange={(v) => setLayer(selected.id, { x: v })} />
                    <PillNum prefix="Y" value={selected.y} onChange={(v) => setLayer(selected.id, { y: v })} />
                  </div>
                </Field>
                <Field label={t("ovlRotation")}>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <PillNum prefix="∠" value={selected.rotation} min={-360} max={360} onChange={(v) => setLayer(selected.id, { rotation: v })} />
                  <IconBtnRow actions={[
                    { icon: <ArrowClockwise size={13} />, onAction: rotate90, aria: t("ovlRotation") + " 90°" },
                    { icon: FLIP_H, onAction: () => setLayer(selected.id, { flipH: !selected.flipH }), aria: t("ovlFlipH") || "Flip horizontal", active: !!selected.flipH },
                    { icon: FLIP_V, onAction: () => setLayer(selected.id, { flipV: !selected.flipV }), aria: t("ovlFlipV") || "Flip vertical", active: !!selected.flipV },
                  ]} />
                </div>
                </Field>
              </Section>

              <Section title={t("ovlLayout")}>
                {/* The lock sits beside the two fields it ties together, rather than as a
                    full-width button underneath them: it belongs to W and H, and a row of its
                    own read like a third property. Its label moves to the tooltip. */}
                <SubLabel>{t("ovlDimensions") || "Dimensions"}</SubLabel>
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <PillNum prefix="W" value={selected.w} min={1} onChange={(v) => setLayer(selected.id, aspectLock ? { w: v, h: Math.max(1, Math.round(v / ratio)) } : { w: v })} />
                  <PillNum prefix="H" value={selected.h} min={1} onChange={(v) => setLayer(selected.id, aspectLock ? { h: v, w: Math.max(1, Math.round(v * ratio)) } : { h: v })} />
                  <BareIconBtn onPress={() => setAspectLock((a) => !a)} active={aspectLock}
                    label={t("ovlLockAspect") || "Lock aspect ratio"}>
                    {aspectLock ? <Lock size={13} /> : <LockOpen size={13} />}
                  </BareIconBtn>
                </div>
              </Section>

              <Section title={t("ovlAppearance") || "Appearance"} right={
                <Dropdown>
                  <DropdownTrigger
                    aria-label={t("ovlBlend") || "Blend"}
                    title={`${t("ovlBlend") || "Blend"}: ${(BLEND_OPTS().find((o) => o.value === (selected.blend || "normal")) || {}).label}`}
                    className={`w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer transition-colors ${(selected.blend && selected.blend !== "normal") ? "text-accent" : "text-muted hover:text-primary"}`}>
                    <Droplet size={14} />
                  </DropdownTrigger>
                  <DropdownPopover placement="bottom end" className="[--dd-min-w:180px] max-h-[320px] overflow-y-auto">
                    <DropdownMenu aria-label={t("ovlBlend") || "Blend"}
                      onAction={(key) => setLayer(selected.id, { blend: String(key) })}>
                      {BLEND_OPTS().map((o) => (
                        <DropdownItem key={o.value} id={o.value} textValue={o.label}>
                          <span className="inline-flex w-[13px] justify-center shrink-0">
                            {(selected.blend || "normal") === o.value ? <Check size={12} weight="bold" /> : null}
                          </span>
                          {o.label}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </DropdownPopover>
                </Dropdown>}>
                {/* Opacity and radius share a row, as two named blocks side by side. The radius
                    used to be a section of its own, which gave a single number the same weight
                    as Position or Layout. */}
                <div className="grid grid-cols-2 gap-2 items-end">
                  <Field label={t("ovlOpacity")}>
                    <PillNum prefix={<OvlOpacity size={12} />} ariaLabel={t("ovlOpacity")} value={selected.opacity} min={0} max={100} onChange={(v) => setLayer(selected.id, { opacity: v })} />
                  </Field>
                  {hasCorners && (
                    <Field label={t("ovlRadius")}>
                      <div className="grid grid-cols-[1fr_auto] gap-1 items-center">
                        <PillNum prefix={<OvlCornerRadius size={12} />} ariaLabel={t("ovlRadius")} value={sc?.TL ?? 0} min={0} max={400}
                          onChange={(v) => setStyle(selected.id, { corners: uniformCorners(v, cornerType) })} />
                        <BareIconBtn onPress={() => setLayerCornersInd((v) => !v)} active={layerCornersInd}
                          label={t("ovlCornersIndividual") || "Individual corners"}>
                          <OvlCornerRadius size={13} />
                        </BareIconBtn>
                      </div>
                    </Field>
                  )}
                </div>
                {hasCorners && layerCornersInd && (
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix={CORNER_GLYPH.TL} ariaLabel="Top left" value={sc?.TL ?? 0} min={0} max={400} onChange={(v) => setCorner("TL", v)} />
                    <PillNum prefix={CORNER_GLYPH.TR} ariaLabel="Top right" value={sc?.TR ?? 0} min={0} max={400} onChange={(v) => setCorner("TR", v)} />
                    <PillNum prefix={CORNER_GLYPH.BL} ariaLabel="Bottom left" value={sc?.BL ?? 0} min={0} max={400} onChange={(v) => setCorner("BL", v)} />
                    <PillNum prefix={CORNER_GLYPH.BR} ariaLabel="Bottom right" value={sc?.BR ?? 0} min={0} max={400} onChange={(v) => setCorner("BR", v)} />
                  </div>
                )}
                {hasCorners && SHOW_CORNER_TYPE && (
                  <Segmented value={cornerType} onChange={setCornersType} options={[{ value: "r", label: t("ovlRound") }, { value: "b", label: t("ovlBevel") }]} />
                )}
              </Section>

              <Section>
                <SwitchField label={t("ovlVisible")} checked={selected.visible !== false} onChange={(v) => toggleLayer(selected.id, { visible: v })} />
                <SwitchField label={t("ovlLocked")} checked={!!selected.locked} onChange={(v) => toggleLayer(selected.id, { locked: v })} />
                <SwitchField label={t("ovlClip")} checked={selected.clip !== false} onChange={(v) => toggleLayer(selected.id, { clip: v })} />
              </Section>

              <LayerStyleSections t={t} layer={selected} setLayer={setLayer} setStyle={setStyle} onPickImage={() => pickImage(selected.id)} onOpenFontPicker={() => setFontPickerOpen(true)} />
              <LayerEffectsSection t={t} layer={selected} setStyle={setStyle} onReplay={replayEntrances} />
            </>
            );
          })()}
        </PropSelCtx.Provider>
        </div>
      </div>}

      <input ref={importFileRef} type="file" accept=".json" multiple className="hidden" onChange={handleImportFiles} />

      {/* ── Save-as popover ──────────────────────────────────────────────────── */}
      {saveOpen && (
        <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl shadow-xl border border-border p-3 flex flex-col gap-2"
          style={{ background: "var(--bg-elevated)" }}
          onKeyDown={(e) => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setSaveOpen(false); }}>
          <span className="text-[length:var(--t12)] font-semibold text-primary">{t("ovlSaveAs")}</span>
          <TextFieldRoot value={saveName} onChange={setSaveName} aria-label={t("ovlProfileName")}>
            <InputRoot autoFocus className="text-[length:var(--t12)]! bg-[var(--surface-2)]! border-border!" placeholder={t("ovlProfileName")} />
          </TextFieldRoot>
          <div className="flex gap-1.5">
            <Button variant="flat" color="primary" size="sm" className="flex-1 text-[length:var(--t12)]!" onPress={saveProfile}>
              <Check size={13} /> {t("ovlProfileSave")}
            </Button>
            <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0!" onPress={() => { setSaveOpen(false); setSaveName(""); }}>
              <X size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Nudge amount ─────────────────────────────────────────────────────────
          Two numbers rather than one: the arrow keys move by the first, Shift by the second.
          Both were hardcoded at 1 and 10, which is fine until a design works on a grid that
          is not a multiple of either. */}
      {nudgeOpen && (
        <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-72 rounded-xl shadow-xl border border-border p-3 flex flex-col gap-2.5"
          style={{ background: "var(--bg-elevated)" }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setNudgeOpen(false); }}>
          <span className="text-[length:var(--t12)] font-semibold text-primary">{t("ovlPrefNudge")}</span>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--t12)] text-muted">{t("ovlPrefNudgeStep")}</span>
            <input type="text" inputMode="numeric" autoFocus value={prefs.nudge}
              onChange={(e) => setPref("nudge", Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 1))}
              className="w-[70px] rounded-md px-2 py-1 text-[length:var(--t12)] text-primary text-right outline-none border border-border focus:border-accent"
              style={{ background: "var(--surface-2)" }} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--t12)] text-muted">{t("ovlPrefNudgeBig")}</span>
            <input type="text" inputMode="numeric" value={prefs.nudgeBig}
              onChange={(e) => setPref("nudgeBig", Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 1))}
              className="w-[70px] rounded-md px-2 py-1 text-[length:var(--t12)] text-primary text-right outline-none border border-border focus:border-accent"
              style={{ background: "var(--surface-2)" }} />
          </label>
          <div className="flex gap-1.5 mt-0.5">
            <Button variant="flat" color="primary" size="sm" className="flex-1 text-[length:var(--t12)]!" onPress={() => setNudgeOpen(false)}>
              <Check size={13} /> {t("ovlDone")}
            </Button>
            <Button variant="ghost" size="sm" className="text-[length:var(--t12)]!" onPress={() => { setPref("nudge", 1); setPref("nudgeBig", 10); }}>
              {t("ovlReset")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Font Picker panel ────────────────────────────────────────────────── */}
      {fontPickerOpen && selected && (() => {
        const currentValue = selected.style?.fontFamily || "system-ui, sans-serif";
        const currentWeight = Number(selected.style?.fontWeight || 400);
        // Local fonts: deduplicate against FONT_LIST labels
        const localFontItems = (localFonts || [])
          .filter((name) => !FONT_LIST.some((f) => f.label.toLowerCase() === name.toLowerCase()))
          .map((name) => ({ value: `'${name}'`, label: name, category: "local" }));
        const allFonts = [...FONT_LIST, ...localFontItems];
        const q = fontPickerSearch.toLowerCase();
        const match = (f) => f.label.toLowerCase().includes(q);
        const inFile = new Set(doc.layers.filter((l) => l.type === "text").map((l) => l.style?.fontFamily || "system-ui, sans-serif"));
        const inCat = (f) => fontPickerCategory === "all" || (fontPickerCategory === "file" ? inFile.has(f.value) : f.category === fontPickerCategory);
        const recent = fontPickerCategory !== "all" ? [] : recentFonts.map((v) => allFonts.find((f) => f.value === v)).filter(Boolean).filter(match);
        const sections = fontPickerCategory === "file" ? [
          { key: "file", label: t("ovlFontInFile"), items: allFonts.filter((f) => inFile.has(f.value)).filter(match) },
        ].filter((sec) => sec.items.length) : [
          { key: "google", label: t("ovlFontGoogle"), items: allFonts.filter((f) => f.category === "google") },
          { key: "system", label: t("ovlFontSystem"), items: allFonts.filter((f) => f.category === "system") },
          { key: "local", label: t("ovlFontLocal"), items: localFontItems },
        ].filter((sec) => fontPickerCategory === "all" || sec.key === fontPickerCategory)
          .map((sec) => ({ ...sec, items: sec.items.filter(match) }))
          .filter((sec) => sec.items.length || (sec.key === "local" && localFonts === null));
        const shownFont = allFonts.find((f) => f.value === (fontHover || currentValue)) || { value: fontHover || currentValue, label: (fontHover || currentValue).replace(/'/g, "").split(",")[0] };
        // Hovering shows the font on the layer in the canvas without touching the document: only
        // the preview gets a copy. Leaving the list puts the real one back.
        const previewFont = (value) => {
          setFontHover(value);
          liveToIframe(value ? { ...doc, layers: doc.layers.map((l) => (l.id === selected.id ? { ...l, style: { ...l.style, fontFamily: value } } : l)) } : doc);
        };
        const closePicker = () => { previewFont(null); setFontPickerOpen(false); setFontPickerSearch(""); };
        const pick = (value) => {
          setFontHover(null);
          setStyle(selected.id, { fontFamily: value });
          const next = [value, ...recentFonts.filter((v) => v !== value)].slice(0, 5);
          setRecentFonts(next);
          try { localStorage.setItem("kodama-ovl-recent-fonts", JSON.stringify(next)); } catch { /* storage full: the list is a convenience */ }
          setFontPickerOpen(false); setFontPickerSearch("");
        };
        const sample = selected.bind === "static" && selected.style?.content ? selected.style.content : t("ovlFontSample");
        const Row = ({ f }) => (
          <div onClick={() => pick(f.value)} onMouseEnter={() => previewFont(f.value)}
            className={[
              "flex items-center gap-2 h-8 px-3 rounded-[var(--r-full)] cursor-pointer leading-none transition-colors",
              f.value === currentValue ? "text-accent bg-accent-dim" : fontHover === f.value ? "text-primary bg-[var(--surface-2)]" : "text-primary hover:bg-[var(--surface-2)]",
            ].join(" ")}
            style={{ fontFamily: f.value, fontSize: "var(--t14)" }}>
            <span className="truncate">{f.label}</span>
            {f.value === currentValue && <Check size={12} className="ml-auto shrink-0" />}
          </div>
        );
        const SecHead = ({ label, count }) => (
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1 text-muted uppercase tracking-[0.06em]" style={{ fontSize: "var(--t10)", fontFamily: "var(--font)" }}>
            <span>{label}</span>{count != null && <span>{count}</span>}
          </div>
        );
        return (
          <div
            ref={fontPanelRef}
            className="fixed z-50 flex overflow-hidden select-none"
            style={{
              top: fontPickerPos.top, left: fontPickerPos.left, width: 470, height: "min(560px, 72vh)",
              // The same shell the colour picker uses, so the two floating panels of the editor
              // are recognisably the same kind of thing.
              ...PANEL_SHELL,
            }}
            onKeyDown={(e) => { if (e.key === "Escape") closePicker(); }}
          >
            {/* ── List: search, kind, sections ── */}
            <div className="flex flex-col min-w-0" style={{ width: 240 }}>
              {/* Drag header. The panel used to be pinned under the toolbar, which put it on top
                  of the inspector it belongs to and nowhere near the text being styled. */}
              <div onPointerDown={startFontPanelDrag}
                className="flex items-center gap-2 px-3 h-9 shrink-0 text-muted" style={{ cursor: "move" }}>
                <DotsSixVertical size={13} />
                <span className="flex-1 font-semibold text-primary" style={{ fontSize: "var(--t13)" }}>{t("ovlFont")}</span>
              </div>
              <div className="px-2.5 pb-2 flex flex-col gap-1.5 shrink-0">
                <div className="flex items-center gap-2 h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-transparent focus-within:border-accent transition-colors">
                  <MagnifyingGlass size={12} className="text-muted shrink-0" />
                  <input autoFocus value={fontPickerSearch} onChange={(e) => setFontPickerSearch(e.target.value)}
                    placeholder={t("ovlFontSearch")} style={{ fontSize: "var(--t13)" }}
                    className="flex-1 min-w-0 bg-transparent text-primary outline-none placeholder:text-muted" />
                  {fontPickerSearch && (
                    <button type="button" onClick={() => setFontPickerSearch("")} aria-label={t("close")}
                      className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-primary transition-colors cursor-pointer">
                      <X size={10} />
                    </button>
                  )}
                </div>
                {/* Which fonts: a menu in groups, as in Figma. Four chips in a column this narrow
                    were squeezed. */}
                {(() => {
                  const KINDS = [
                    [{ key: "all", label: t("ovlFontAll") }],
                    [{ key: "file", label: t("ovlFontInFile") }],
                    [{ key: "google", label: t("ovlFontGoogle") }, { key: "system", label: t("ovlFontSystem") }],
                    [{ key: "local", label: t("ovlFontLocal") }],
                  ];
                  const cur = KINDS.flat().find((k) => k.key === fontPickerCategory) || KINDS[0][0];
                  return (
                    <Dropdown>
                      <DropdownTrigger aria-label={t("ovlFontKind")}
                        className="w-full h-[30px] flex items-center justify-between gap-2 px-3 rounded-[var(--r-full)] border-0 bg-[var(--surface-2)] text-primary hover:bg-[var(--surface-3)] cursor-pointer"
                        style={{ fontSize: "var(--t13)" }}>
                        <span className="truncate">{cur.label}</span>
                        <CaretDown size={11} className="shrink-0 text-secondary" />
                      </DropdownTrigger>
                      <DropdownPopover placement="bottom start" className="[--dd-min-w:13rem]">
                        <DropdownMenu aria-label={t("ovlFontKind")} onAction={(k) => setFontPickerCategory(String(k))}>
                          {KINDS.map((group, gi) => (
                            <DropdownSection key={gi} className={gi > 0 ? "border-t border-[var(--surface-3)] mt-1 pt-1" : ""}>
                              {group.map((k) => (
                                <DropdownItem key={k.key} id={k.key} textValue={k.label}>
                                  <span className="w-3.5 shrink-0 flex justify-center">{k.key === fontPickerCategory && <Check size={12} />}</span>
                                  {k.label}
                                </DropdownItem>
                              ))}
                            </DropdownSection>
                          ))}
                        </DropdownMenu>
                      </DropdownPopover>
                    </Dropdown>
                  );
                })()}
              </div>
              <div className="overflow-y-auto flex-1 min-h-0 px-1.5 pb-2" onMouseLeave={() => previewFont(null)}>
                {recent.length > 0 && (<>
                  <SecHead label={t("ovlFontRecent")} />
                  {recent.map((f) => <Row key={"r" + f.value} f={f} />)}
                </>)}
                {sections.map((sec) => (
                  <div key={sec.key}>
                    <SecHead label={sec.label} count={sec.key === "local" && localFonts === null ? "…" : sec.items.length} />
                    {sec.key === "local" && localFonts === null
                      ? <div className="text-muted px-3 py-2" style={{ fontSize: "var(--t12)" }}>{t("ovlFontLocalLoading")}</div>
                      : sec.items.map((f) => <Row key={f.value} f={f} />)}
                  </div>
                ))}
                {!recent.length && !sections.length && (
                  <div className="text-muted text-center py-4" style={{ fontSize: "var(--t12)" }}>{t("ovlFontNoResults")}</div>
                )}
              </div>
            </div>

            {/* ── Preview: the font under the pointer, or the current one ── */}
            <div className="flex flex-col gap-3 min-w-0 flex-1 px-4 py-3" style={{ borderLeft: "1px solid var(--surface-2)" }}>
              <div className="flex justify-end">
                <button type="button" onClick={closePicker} aria-label={t("close")}
                  className="w-6 h-6 flex items-center justify-center rounded-[var(--r-md)] border-0 bg-transparent text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer">
                  <X size={13} />
                </button>
              </div>
              <div className="text-primary leading-none" style={{ fontFamily: shownFont.value, fontSize: 64, fontWeight: currentWeight }}>Aa</div>
              <div className="font-semibold text-primary truncate" style={{ fontSize: "var(--t13)" }}>{shownFont.label}</div>
              {/* The two weights every listed font is loaded in; set straight on the layer. */}
              <ChipGroup items={[
                { key: "400", label: t("ovlRegular"), active: currentWeight < 600, onPress: () => setStyle(selected.id, { fontWeight: 400 }) },
                { key: "700", label: t("ovlBold"), active: currentWeight >= 600, onPress: () => setStyle(selected.id, { fontWeight: 700 }) },
              ]} />
              <div className="text-primary break-words" style={{ fontFamily: shownFont.value, fontWeight: currentWeight, fontSize: "var(--t16)", lineHeight: 1.3 }}>{sample}</div>
              <div className="text-muted break-all" style={{ fontFamily: shownFont.value, fontSize: "var(--t12)", lineHeight: 1.5 }}>
                ABCDEFGHIJKLM abcdefghijklm 0123456789 ?!&amp;@
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Widget Browser modal ─────────────────────── */}
      {browserOpen && (() => {
        // Search matches the name or a tag; "#word" looks at tags only.
        const raw = browserQuery.trim().toLowerCase();
        const tagOnly = raw.startsWith("#");
        const q = tagOnly ? raw.slice(1) : raw;
        const hasTag = (p, x) => (p.tags || []).some((tg) => tg.toLowerCase() === x.toLowerCase());
        const shown = profiles
          .filter((p) => !tagFilter || hasTag(p, tagFilter))
          .filter((p) => !q || (!tagOnly && p.name.toLowerCase().includes(q)) || (p.tags || []).some((tg) => tg.toLowerCase().includes(q)))
          .sort((x, y) => {
            if (browserSort === "name") return x.name.localeCompare(y.name);
            if (browserSort === "size") return ((y.doc?.canvas?.width || 0) * (y.doc?.canvas?.height || 0)) - ((x.doc?.canvas?.width || 0) * (x.doc?.canvas?.height || 0));
            return String(y.savedAt || "").localeCompare(String(x.savedAt || ""));
          });
        const closeBrowser = () => { setBrowserOpen(false); setRenamingId(null); setConfirmDeleteId(null); };
        const cur = shown.find((p) => p.id === pickedProfileId) || shown[0] || null;
        const layersOf = (p) => { const n = p.doc?.layers?.length ?? 0; return `${n} ${n === 1 ? t("ovlElementLayer") : t("ovlElementLayers")}`; };
        const sizeOf = (p) => `${p.doc?.canvas?.width ?? "?"} × ${p.doc?.canvas?.height ?? "?"}`;
        const date = (p) => (p.savedAt ? new Date(p.savedAt).toLocaleDateString() : "");
        // Sorted by recency, the list falls into time sections, as in the library's folders.
        const sections = (() => {
          if (browserSort !== "recent") return [{ key: "all", label: t("ovlDesignsAll"), items: shown }];
          const now = Date.now(), day = 86400000;
          const age = (p) => now - (Date.parse(p.savedAt || "") || 0);
          return [
            { key: "week", label: t("ovlDesignsThisWeek"), items: shown.filter((p) => age(p) < 7 * day) },
            { key: "month", label: t("ovlDesignsThisMonth"), items: shown.filter((p) => age(p) >= 7 * day && age(p) < 31 * day) },
            { key: "older", label: t("ovlDesignsOlder"), items: shown.filter((p) => age(p) >= 31 * day) },
          ].filter((sec) => sec.items.length);
        })();
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeBrowser();
            if (e.key === "Enter" && cur && !renamingId && e.target.tagName !== "INPUT") applyProfile(cur);
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBrowser(); }}>
          <div className="w-[960px] max-w-[94vw] h-[620px] max-h-[88vh] flex flex-col overflow-hidden" style={PANEL_SHELL} tabIndex={-1}>

            {/* ── Head: search across the top, sorting and tags under it, as in the library ── */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
              <span style={{ fontSize: "var(--t15)" }} className="font-semibold text-primary mr-1">{t("ovlProfileBrowse")}</span>
              <span style={{ fontSize: "var(--t12)" }} className="text-muted tabular-nums mr-2">{profiles.length}</span>
              <SearchPill value={browserQuery} onChange={setBrowserQuery} placeholder={t("ovlProfileSearchTags")} className="flex-1" />
              <ChipGroup items={[{ key: "x", icon: <X size={12} />, aria: t("close"), onPress: closeBrowser }]} />
            </div>
            <div className="flex items-center gap-1.5 px-4 pb-3 overflow-x-auto shrink-0">
              {[["recent", t("ovlProfileSortRecent")], ["name", t("ovlProfileSortName")], ["size", t("ovlProfileSortSize")]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setBrowserSort(k)}
                  className={`h-[26px] px-3 shrink-0 rounded-[var(--r-full)] border-0 cursor-pointer transition-colors ${browserSort === k ? "bg-[var(--surface-3)] text-primary" : "bg-transparent text-secondary hover:text-primary hover:bg-[var(--surface-2)]"}`}
                  style={{ fontSize: "var(--t12)" }}>{label}</button>
              ))}
              {allTags.length > 0 && <div className="w-px h-4 bg-border mx-1.5 shrink-0" />}
              {allTags.map((tg) => (
                <button key={tg} type="button" onClick={() => setTagFilter(tagFilter === tg ? null : tg)}
                  className={`h-[26px] px-3 shrink-0 rounded-[var(--r-full)] border-0 cursor-pointer transition-colors ${tagFilter === tg ? "bg-accent text-white" : "bg-transparent text-secondary hover:text-primary hover:bg-[var(--surface-2)]"}`}
                  style={{ fontSize: "var(--t12)" }}>#{tg}</button>
              ))}
            </div>

            <div className="flex-1 min-h-0 flex gap-4 px-4 pb-4">
              {/* ── Left: the designs as cards, in sections ── */}
              <ScrollShadowRoot size={28} className="w-[338px] shrink-0 overflow-y-auto min-h-0 -m-1 p-1 pr-2 flex flex-col gap-4">
                {profiles.length === 0 ? (
                  <div className="px-1 py-6 text-muted leading-snug" style={{ fontSize: "var(--t12)" }}>{t("ovlProfileEmpty")}<br /><span className="opacity-70">{t("ovlProfileEmptyHint")}</span></div>
                ) : shown.length === 0 ? (
                  <div className="px-1 py-6 text-muted" style={{ fontSize: "var(--t12)" }}>{t("ovlProfileNoResults")}</div>
                ) : sections.map((sec) => (
                  <div key={sec.key} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 px-1">
                      <span style={{ fontSize: "var(--t12)" }} className="font-semibold text-secondary">{sec.label}</span>
                      <span style={{ fontSize: "var(--t12)" }} className="text-muted tabular-nums">{sec.items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                      {sec.items.map((p) => {
                        const on = cur?.id === p.id;
                        return (
                          <div key={p.id} className="min-w-0 cursor-default select-none"
                            onClick={() => { setPickedProfileId(p.id); setConfirmDeleteId(null); }}
                            onDoubleClick={() => applyProfile(p)}
                            onContextMenu={(e) => { setPickedProfileId(p.id); openMenu(e, "design", p.id); }}>
                            <div className="relative h-[72px] overflow-hidden transition-shadow"
                              style={{ background: CHECKER, backgroundColor: "#262626", borderRadius: "var(--r-xl)", boxShadow: on ? "0 0 0 2px var(--accent)" : "none" }}>
                              <DesignPreview apiBase={apiBase} doc={p.doc} box={{ w: 154, h: 72 }} pad={8} />
                            </div>
                            <div style={{ fontSize: "var(--t12)" }} className="mt-1.5 px-0.5 truncate font-medium text-primary" title={p.name}>{p.name}</div>
                            <div style={{ fontSize: "var(--t11)" }} className="px-0.5 truncate text-muted tabular-nums">{sizeOf(p)} · {date(p)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </ScrollShadowRoot>

              {/* ── Right: the picked design, large, with its name, details and tags ── */}
              <div className="flex-1 min-w-0 flex flex-col gap-3 pt-1">
                <div className="relative flex-1 min-h-0 overflow-hidden" style={{ background: CHECKER, backgroundColor: "#262626", borderRadius: "var(--r-xl)" }}>
                  {cur && <DesignPreview key={cur.id} apiBase={apiBase} doc={cur.doc} box={{ w: 560, h: 380 }} pad={28} maxScale={2.5} />}
                </div>
                {cur && (
                  <div className="shrink-0 flex flex-col gap-2">
                    {renamingId === cur.id ? (
                      <input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => { renameProfile(cur.id, renameDraft); setRenamingId(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { renameProfile(cur.id, renameDraft); setRenamingId(null); } if (e.key === "Escape") { e.stopPropagation(); setRenamingId(null); } }}
                        style={{ fontSize: "var(--t14)" }}
                        className="w-full h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] text-primary font-semibold border border-accent outline-none" />
                    ) : (
                      <div style={{ fontSize: "var(--t15)" }} className="truncate font-semibold text-primary" title={cur.name}
                        onDoubleClick={() => { setRenamingId(cur.id); setRenameDraft(cur.name); }}>{cur.name}</div>
                    )}
                    <div style={{ fontSize: "var(--t12)" }} className="-mt-1 text-muted tabular-nums">{sizeOf(cur)} · {layersOf(cur)} · {date(cur)}</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(cur.tags || []).map((tg) => (
                        <span key={tg} className="h-[24px] pl-2.5 pr-1 flex items-center gap-1 rounded-[var(--r-full)] bg-[var(--surface-2)] text-secondary" style={{ fontSize: "var(--t11)" }}>
                          #{tg}
                          <button type="button" aria-label={t("ovlTagRemove")} onClick={() => removeTag(cur.id, tg)}
                            className="w-4 h-4 flex items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-primary hover:bg-[var(--surface-3)] cursor-pointer"><X size={8} /></button>
                        </span>
                      ))}
                      <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder={t("ovlTagAdd")}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); e.stopPropagation(); addTag(cur.id, tagDraft); setTagDraft(""); } if (e.key === "Escape") { e.stopPropagation(); setTagDraft(""); e.currentTarget.blur(); } }}
                        onBlur={() => { if (tagDraft.trim()) { addTag(cur.id, tagDraft); setTagDraft(""); } }}
                        style={{ fontSize: "var(--t11)" }}
                        className="h-[24px] w-[96px] px-2.5 rounded-[var(--r-full)] bg-transparent text-primary border border-dashed border-border focus:border-accent focus:border-solid outline-none placeholder:text-muted" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer, as in the library: file actions left, the picked design's actions and Apply right ── */}
            <div className="flex items-center gap-2 px-4 py-3 shrink-0" style={{ background: PANEL_FOOT }}>
              <ChipGroup items={[
                { key: "import", label: t("ovlProfileImport"), icon: <UploadSimple size={12} />, onPress: () => importFileRef.current?.click() },
                { key: "export", label: t("ovlProfileExport"), icon: <DownloadSimple size={12} />, disabled: !cur, onPress: () => cur && exportProfile(cur) },
              ]} />
              <ChipGroup items={[
                { key: "more", label: t("ovlMoreDesigns"), icon: <Storefront size={12} />, onPress: () => openStoreWeb("widgets") },
              ]} />
              <div className="ml-auto flex items-center gap-2">
                {cur && (confirmDeleteId === cur.id ? (
                  <>
                    <span style={{ fontSize: "var(--t12)" }} className="text-secondary">{t("ovlProfileDeleteConfirm")}</span>
                    <ChipGroup items={[
                      { key: "no", label: t("cancel"), onPress: () => setConfirmDeleteId(null) },
                      { key: "yes", label: t("ovlProfileDelete"), danger: true, onPress: () => { deleteProfile(cur.id); setConfirmDeleteId(null); setPickedProfileId(null); } },
                    ]} />
                  </>
                ) : (
                  <ChipGroup items={[
                    { key: "rename", icon: <PencilSimple size={13} />, aria: t("ovlProfileRename"), title: t("ovlProfileRename"), onPress: () => { setRenamingId(cur.id); setRenameDraft(cur.name); } },
                    { key: "dup", icon: <Copy size={13} />, aria: t("ovlProfileDuplicate"), title: t("ovlProfileDuplicate"), onPress: () => duplicateProfile(cur) },
                    { key: "del", icon: <Trash size={13} />, aria: t("ovlProfileDelete"), title: t("ovlProfileDelete"), danger: true, onPress: () => setConfirmDeleteId(cur.id) },
                  ]} />
                ))}
                <ChipGroup items={[{ key: "open", label: t("ovlProfileApply"), kbd: "↵", active: !!cur, disabled: !cur, onPress: () => cur && applyProfile(cur) }]} />
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      </div>{/* end canvas viewport */}
    </div>
  );
}
