// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — Figma-style direct-manipulation editor
//
//  Full-bleed canvas (pan + zoom) with the real engine in an <iframe> (zero
//  render drift, pointer-events:none) and a transparent React interaction layer
//  on top: click to select, drag to move, 8 handles to resize, knob to rotate.
//  Floating panels: left = layers, right = inspector. Live drag preview goes to
//  the iframe via postMessage; commits persist (localStorage + POST v2 → SSE/OBS).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from "react";
// createPortal removed — font picker is now lifted to OverlayEditor level
import {
  Button, Switch,
  TextFieldRoot, InputRoot,
  SelectRoot, SelectTrigger, SelectValue, SelectIndicator, SelectPopover,
  ListBox, ListBoxItem,
  SeparatorRoot,
  Dropdown, DropdownTrigger, DropdownPopover, DropdownItem, DropdownSection,
} from "@heroui/react";
import { DropdownMenu } from "../ui/zoomed-heroui.jsx";
import { Tooltip } from "../ui/tooltip.jsx";
import { HDR_ICON_BTN, HDR_H, HDR_NOTCH, hdrCorners, WindowControls } from "../ui/window-chrome.jsx";
import {
  ImageSquare, VinylRecord, TextSize, WaveformLines, PaintBrushBroad,
  Eye, EyeSlash, Lock, LockOpen, Plus, Trash, Copy, Scissors, Clipboard, Check, ArrowsClockwise, Droplet, PencilSimple,
  ArrowsOut, ArrowClockwise, CaretDown, CursorArrow,
  X, Minus, UploadSimple, DownloadSimple, FileImport, FileExport, FloppyDisk, Swatches, MagnifyingGlass, DotsSixVertical,
  OvlOpacity, OvlCornerRadius, OvlCornerSingle, OvlStrokeWeight, OvlDropShadow, OvlGlow, OvlLayerBlur, OvlInnerShadow,
} from "../icons.jsx";
import {
  isV2Doc, normalizeOverlayDoc, defaultOverlayDoc, LAYER_FACTORIES, uniformCorners,
} from "./schema.js";
import { ColorPicker } from "../ui/color-picker.jsx";

const TYPE_META = {
  albumArt: { icon: VinylRecord, label: "Album Art" },
  text:     { icon: TextSize, label: "Text" },
  progress: { icon: WaveformLines, label: "Progress" },
  image:    { icon: ImageSquare, label: "Image" },
  shape:    { icon: PaintBrushBroad, label: "Shape" },
};
const ADD_TYPES = ["text", "albumArt", "progress", "image", "shape"];
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
const ENTRANCE_OPTS = (t) => ["none", "fade", "slideUp", "slideDown", "slideLeft", "slideRight", "zoom"].map((v) => ({ value: v, label: t("ovlEntr_" + v) }));
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

// Menu bar entry. The design puts the bar at 52px with 30px controls, so the trigger height
// lives here rather than being repeated at each of the four menus.
function MenuBtn({ label, children, width = 230, corners }) {
  return (
    <Dropdown>
      <DropdownTrigger
        style={{ borderRadius: corners }}
        className="h-[30px] px-4 border-0 bg-[var(--surface-2)] text-t14 text-primary hover:bg-[var(--surface-3)] transition-colors cursor-pointer">
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
    const startX = e.clientX;
    const startVal = (value == null || Number.isNaN(value)) ? 0 : value;
    const move = (ev) => {
      const n = Math.round((startVal + (ev.clientX - startX) * step) / step) * step;
      onChange(clampN(Math.round(n * 100) / 100));
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
        <InputRoot className="text-t12! h-8! bg-[var(--surface-2)]! border-border!" placeholder={placeholder} />
      </TextFieldRoot>
    </div>
  );
}
function ColorField({ label, value, onChange, opacity, onOpacity, corners }) {
  const hex = typeof value === "string" && value[0] === "#" ? value.slice(0, 7) : "#000000";
  return (
    <div style={{ borderRadius: corners || "var(--r-full)" }}
      className="flex items-center gap-2 h-[30px] pl-2 pr-3 bg-[var(--surface-2)] border border-transparent transition-colors focus-within:border-accent">
      <ColorPicker value={hex} onChange={onChange} swatch={{ width: 18, height: 18, borderRadius: "var(--r-full)", border: "1px solid var(--border)" }} />
      <input value={(value ?? "").replace(/^#/, "")} onChange={(e) => onChange("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
        className="flex-1 min-w-0 bg-transparent outline-none font-mono text-primary uppercase"
        style={{ fontSize: "var(--t13)" }} aria-label={(label || "") + " hex"} />
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
  const Wrap = label
    ? ({ children }) => <Field label={label}>{children}</Field>
    : ({ children }) => <div className="flex items-center justify-between gap-2">{children}</div>;
  return (
    <Wrap>
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
    </Wrap>
  );
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

// Figma-style fill list: ordered solid paints (index 0 = front). Add / reorder via the
// header "+", toggle visibility (eye), remove (−). Each row edits color + opacity.
function FillList({ t, fills, onChange }) {
  const list = Array.isArray(fills) ? fills : [];
  const set = (i, patch) => onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => onChange([{ id: Math.random().toString(36).slice(2), type: "solid", color: "#ffffff", opacity: 100, visible: true }, ...list]);
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  return (
    <Section title={t("ovlFill")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddFill") || "Add fill"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((f, i) => (
        <div key={f.id || i} className="group/frow flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><ColorField corners={hdrCorners(false, true, 30)} value={f.color} onChange={(c) => set(i, { color: c })} /></div>
          <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlOpacity")} value={f.opacity ?? 100} onChange={(o) => set(i, { opacity: o })} />
          <BareIconBtn onPress={() => set(i, { visible: f.visible === false })} label={t("ovlVisible")}>
            {f.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </BareIconBtn>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"} title={t("ovlRemove") || "Remove"}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-muted hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
        </div>
      ))}
    </Section>
  );
}

// Figma-style stroke list: multiple stroke paints (colour + opacity each) sharing a
// single weight + position. Add via header "+", toggle/remove per row.
function StrokeList({ t, strokes, weight, position, onChange, onWeight, onPosition }) {
  const list = Array.isArray(strokes) ? strokes : [];
  const set = (i, patch) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => onChange([{ id: Math.random().toString(36).slice(2), color: "#ffffff", opacity: 100, visible: true }, ...list]);
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  return (
    <Section title={t("ovlStroke") || t("ovlBorder")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddStroke") || "Add stroke"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((s, i) => (
        <div key={s.id || i} className="group/srow flex items-center gap-1.5">
          <div className="flex-1 min-w-0"><ColorField corners={hdrCorners(false, true, 30)} value={s.color} onChange={(c) => set(i, { color: c })} /></div>
          <PercentField corners={hdrCorners(true, false, 30)} label={t("ovlOpacity")} value={s.opacity ?? 100} onChange={(o) => set(i, { opacity: o })} />
          <BareIconBtn onPress={() => set(i, { visible: s.visible === false })} label={t("ovlVisible")}>
            {s.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </BareIconBtn>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"} title={t("ovlRemove") || "Remove"}
            className="shrink-0 w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-muted hover:text-[var(--status-danger)] transition-colors"><Minus size={13} /></button>
        </div>
      ))}
      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-2 items-end">
          <Field label={t("ovlStrokePosition") || "Position"}>
            <SelectField value={position} options={STROKE_POS_OPTS(t)} onChange={onPosition} />
          </Field>
          <Field label={t("ovlStrokeWeight") || "Weight"}>
            <PillNum prefix={<OvlStrokeWeight size={12} />} ariaLabel={t("ovlStrokeWeight") || "Weight"} value={weight} min={0} max={40} step={0.5} onChange={onWeight} />
          </Field>
        </div>
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
  const remove = (i) => onChange(list.filter((_, j) => j !== i));
  return (
    <Section title={t("ovlEffects")} right={
      <button type="button" onClick={add} aria-label={t("ovlAddEffect") || "Add effect"} className="w-7 h-7 flex items-center justify-center border-0 bg-transparent cursor-pointer text-secondary hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.map((e, i) => (
        <div key={e.id || i} className="flex items-start gap-1.5">
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
        </div>
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
    return (<Section title={t("ovlStyle")}>
      <ColorField label={t("ovlFill")} value={s.fillColor} onChange={(v) => setStyle(id, { fillColor: v })} opacity={s.fillOpacity ?? 100} onOpacity={(v) => setStyle(id, { fillOpacity: v })} />
      <ColorField label={t("ovlTrackColor")} value={s.trackColor} onChange={(v) => setStyle(id, { trackColor: v })} />
    </Section>);
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
function LayerEffectsSection({ t, layer, setStyle }) {
  const s = layer.style || {};
  const id = layer.id;
  const fx = s.fx || {};
  const setFx = (key, patch) => setStyle(id, { fx: { ...fx, [key]: { ...(fx[key] || {}), ...patch } } });
  return (<>
    <EffectList t={t} effects={s.effects} onChange={(effects) => setStyle(id, { effects })} />
    <Section title={t("ovlAnimation") || "Animation"}>
      {/* Named blocks, like the rest of the panel. The duration and speed appear only once
          their animation is set to something, so an unused section stays two fields. */}
      <Field label={t("ovlEntrance")}>
        <SelectField value={fx.entrance?.type || "none"} options={ENTRANCE_OPTS(t)} onChange={(v) => setFx("entrance", { type: v })} />
      </Field>
      {fx.entrance?.type && fx.entrance.type !== "none" && (
        <Field label={t("ovlDuration")}>
          <PillNum ariaLabel={t("ovlDuration")} value={fx.entrance?.duration ?? 0.5} min={0.1} max={3} step={0.1} onChange={(v) => setFx("entrance", { duration: v })} />
        </Field>
      )}
      <Field label={t("ovlLoop")}>
        <SelectField value={fx.loop?.type || "none"} options={LOOP_OPTS(t)} onChange={(v) => setFx("loop", { type: v })} />
      </Field>
      {fx.loop?.type && fx.loop.type !== "none" && (
        <Field label={t("ovlSpeed")}>
          <PillNum ariaLabel={t("ovlSpeed")} value={fx.loop?.speed ?? 2} min={0.3} max={10} step={0.1} onChange={(v) => setFx("loop", { speed: v })} />
        </Field>
      )}
    </Section>
  </>);
}

// Custom window controls (minimize / maximize / close) for the standalone editor window.
// A real thumbnail of a saved design: the same engine that drives OBS, loaded in still mode
// (no live stream, no active config) and fed the saved document by postMessage, then scaled to
// fit the card. Nothing here is a second implementation of the renderer, so what the card shows
// is exactly what the design produces.
function DesignPreview({ apiBase, doc: rawDoc, box }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  // Same normalisation applyProfile does. Without it a design saved in the older format is
  // handed to the engine in a shape it does not understand and the card stays blank.
  const doc = useMemo(() => normalizeOverlayDoc(rawDoc), [rawDoc]);
  const cw = doc?.canvas?.width || 480;
  const ch = doc?.canvas?.height || 120;
  // 16px of breathing room inside the card, and never blown up past 1:1.
  const scale = Math.min((box.w - 32) / cw, (box.h - 32) / ch, 1);

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
  const orderedDesc = [...doc.layers].sort((a, b) => (b.z || 0) - (a.z || 0)); // list (top first)

  // Drag-and-drop layer reorder. Takes the position to insert AT, counted in gaps between rows
  // (0 = above the first row, length = below the last), rather than "the row I happen to be
  // over": dropping onto a row cannot say whether you meant above or below it.
  const moveLayerTo = useCallback((fromId, insertIndex) => {
    const ordered = [...doc.layers].sort((a, b) => (b.z || 0) - (a.z || 0));
    const fromIdx = ordered.findIndex((l) => l.id === fromId);
    if (fromIdx === -1) return;
    // Pulling the row out shifts every gap below it up by one.
    let target = insertIndex > fromIdx ? insertIndex - 1 : insertIndex;
    if (target === fromIdx) return;
    const next = [...ordered];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(target, 0, moved);
    const n = next.length;
    const updatedLayers = doc.layers.map((l) => ({
      ...l,
      z: n - 1 - next.findIndex((r) => r.id === l.id),
    }));
    commit({ ...doc, layers: updatedLayers });
  }, [doc, commit]);

  // Stable ref so pointer-event closures always call the latest moveLayerTo.
  const moveLayerToRef = useRef(null);
  moveLayerToRef.current = moveLayerTo;

  // Pointer-based drag sort (HTML5 drag-and-drop is unreliable in WebView2/WebKit).
  const onRowPointerDown = useCallback((e, id) => {
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
        moveLayerToRef.current?.(fromId, at);
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
  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const l = doc.layers.find((x) => x.id === selectedId);
    if (!l) return;
    const clone = { ...l, id: crypto.randomUUID(), x: l.x + 20, y: l.y + 20 };
    commit({ ...doc, layers: [...doc.layers, clone] }, doc);
    setSelectedId(clone.id);
  }, [doc, selectedId, commit]);

  // An editor-local clipboard rather than the system one: layers are a structure, not text,
  // and serialising them through the OS clipboard would only buy pasting into a foreign app
  // that could not read them anyway.
  const clipboardRef = useRef([]);
  const pasteCountRef = useRef(0);

  const copySelected = useCallback(() => {
    const picked = doc.layers.filter((l) => selectedIds.includes(l.id));
    if (!picked.length) return false;
    // Deep-cloned on copy, not on paste: otherwise editing the original before pasting would
    // quietly change what lands.
    clipboardRef.current = picked.map((l) => JSON.parse(JSON.stringify(l)));
    pasteCountRef.current = 0;
    return true;
  }, [doc.layers, selectedIds]);

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
    const clones = items.map((l, i) => ({
      ...l,
      id: crypto.randomUUID(),
      x: (l.x || 0) + off,
      y: (l.y || 0) + off,
      z: topZ + 1 + i,
    }));
    commit({ ...doc, layers: [...doc.layers, ...clones] }, doc);
    setSelectedIds(clones.map((c) => c.id));
  }, [doc, commit]);

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
    if (!selected) return;
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
    setFontPickerPos((pos) => (pos.left ? pos : { top: 88, left: Math.max(8, window.innerWidth - rightW - 264) }));
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
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && tool) { e.preventDefault(); setTool(null); setDrawRect(null); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      } else if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault(); copySelected();
      } else if (mod && e.key.toLowerCase() === "x") {
        e.preventDefault(); cutSelected();
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault(); pasteClipboard();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault(); duplicateSelected();
      } else if (mod && e.shiftKey && e.key === "2") {
        e.preventDefault(); zoomToSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length) {
        e.preventDefault(); deleteSelected();
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
      if (!moved) { setSelectedId(null); return; }
      const p = toCanvas(ev.clientX, ev.clientY);
      const bx = Math.min(p0.x, p.x), by = Math.min(p0.y, p.y), bw = Math.abs(p.x - p0.x), bh = Math.abs(p.y - p0.y);
      const hits = doc.layers
        .filter((l) => l.visible !== false && !l.locked)
        .filter((l) => l.x < bx + bw && l.x + l.w > bx && l.y < by + bh && l.y + l.h > by)
        .map((l) => l.id);
      setSelectedIds(hits);
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
    // Dragging a member of a multi-selection moves the whole group; otherwise select just it.
    const multiMove = mode === "move" && selectedIds.length > 1 && selectedIds.includes(layer.id);
    if (!multiMove) setSelectedId(layer.id);
    const startPositions = multiMove
      ? doc.layers.filter((l) => selectedIds.includes(l.id) && !l.locked).map((l) => ({ id: l.id, x: l.x, y: l.y }))
      : null;
    const rect = viewportRef.current.getBoundingClientRect();
    const z = zoom, p = { ...pan }, L0 = { ...layer };
    const center0 = { x: L0.x + L0.w / 2, y: L0.y + L0.h / 2 };
    const startClient = { x: e.clientX, y: e.clientY };

    // Snap targets: canvas edges + center, and every other visible layer's
    // edges + centers. Threshold is ~6 screen px (converted to canvas px).
    const SNAP = prefs.snap ? 6 / z : 0;
    const gxs = [0, doc.canvas.width / 2, doc.canvas.width];
    const gys = [0, doc.canvas.height / 2, doc.canvas.height];
    for (const l of doc.layers) {
      if (l.id === L0.id || l.visible === false) continue;
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
          // Multi-selection: shift every selected layer by the same delta (no snapping).
          const rdx = Math.round(dx), rdy = Math.round(dy);
          changed = true;
          lastDoc = { ...doc, layers: doc.layers.map((l) => {
            const sp = startPositions.find((s) => s.id === l.id);
            return sp ? { ...l, x: sp.x + rdx, y: sp.y + rdy } : l;
          }) };
          setDoc(lastDoc); liveToIframe(lastDoc); setSnapLines({ x: null, y: null });
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


  // ── Profile management ───────────────────────────────────────────────────────
  const importFileRef = useRef(null);
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserSort, setBrowserSort] = useState("recent"); // recent | name | size
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const persistProfiles = useCallback((next) => {
    setProfiles(next);
    localStorage.setItem("kiyoshi-overlay-profiles", JSON.stringify(next));
  }, []);

  const saveProfile = useCallback(() => {
    const name = saveName.trim() || t("ovlProfileDefaultName");
    persistProfiles([{ id: crypto.randomUUID(), name, savedAt: new Date().toISOString(), doc }, ...profiles]);
    setSaveName("");
    setSaveOpen(false);
  }, [saveName, doc, profiles, persistProfiles, t]);

  const applyProfile = useCallback((prof) => {
    commit(normalizeOverlayDoc(prof.doc));
    setBrowserOpen(false);
  }, [commit]);

  const deleteProfile = useCallback((id) => {
    persistProfiles(profiles.filter((p) => p.id !== id));
  }, [profiles, persistProfiles]);

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

  const exportProfile = useCallback((prof) => {
    const blob = new Blob([JSON.stringify(prof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prof.name.replace(/[^\w\s-]/g, "").trim() || "design"}.kiyoshi-overlay.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      className={`flex flex-col w-full overflow-hidden select-none${standalone ? "" : " rounded-xl"}`}
      style={{ height: standalone ? "100vh" : "78vh", minHeight: standalone ? undefined : 480 }}
    >
      {/* ── Top bar (doubles as the custom title bar in standalone) ────────────────
          52px tall with 30px controls, per the design. The document name moved out of here
          and sits above the layer list now: it belongs to the document, not to the toolbar. */}
      <div className="shrink-0 flex items-center gap-1 h-[52px] pl-[22px] pr-3" {...(standalone ? { "data-tauri-drag-region": true } : {})}>
        <div className="flex items-center gap-2 pr-2 shrink-0">
          <img src="/Kodama%20Logo.png" alt="" width="18" height="18" />
          <span className="text-t13 font-semibold text-primary">{t("ovlEditorTitle")}</span>
          {/* Set like a superscript beside the wordmark: raised against the cap height rather
              than centred on it, so it reads as a qualifier on the name instead of a second
              word in the row. */}
          <span className="text-[9px] font-bold tracking-wider text-white leading-none relative -top-[5px] -ml-1">BETA</span>
        </div>

        {/* The four menus read as one segmented control, like the icon groups opposite. */}
        <div className="flex items-center gap-[6px]">
        <MenuBtn label={t("ovlMenuFile")} corners={hdrCorners(false, true)}>
          <DropdownMenu aria-label={t("ovlMenuFile")} onAction={(key) => {
            if (key === "new") { commit(defaultOverlayDoc()); setSelectedId(null); }
            else if (key === "place") { const id = addLayer("image"); if (id) pickImage(id); }
            else if (key === "save") { setSaveOpen(true); setBrowserOpen(false); }
            else if (key === "browse") { setBrowserOpen(true); setSaveOpen(false); }
            else if (key === "import") { importFileRef.current?.click(); }
            else if (key === "export") { exportProfile({ id: "current", name: t("ovlMenuExportCurrent"), doc, savedAt: new Date().toISOString() }); }
          }}>
            <DropdownSection>
              <DropdownItem id="new" textValue={t("ovlMenuNew")}><Plus size={13} />{t("ovlMenuNew")}</DropdownItem>
              <DropdownItem id="place" textValue={t("ovlPlaceImage")}><ImageSquare size={13} />{t("ovlPlaceImage")}</DropdownItem>
            </DropdownSection>
            <DropdownSection className="border-t border-border mt-1 pt-1">
              <DropdownItem id="save" textValue={t("ovlProfileSave")}><FloppyDisk size={13} />{t("ovlProfileSave")}</DropdownItem>
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
            ...(selectedIds.length ? [] : ["duplicate", "delete", "selectNone", "copy", "cut"]),
            ...(clipboardRef.current.length ? [] : ["paste"]),
          ]} onAction={(key) => {
            if (key === "undo") undo();
            else if (key === "redo") redo();
            else if (key === "copy") copySelected();
            else if (key === "cut") cutSelected();
            else if (key === "paste") pasteClipboard();
            else if (key === "duplicate") duplicateSelected();
            else if (key === "delete") deleteSelected();
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
        </div>

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
            onPress={() => { setSaveOpen((o) => !o); setBrowserOpen(false); }} aria-label={t("ovlProfileSave")}><FloppyDisk size={15} weight="fill" /></Button>
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
        <Button variant="ghost" size="sm" className="gap-1.5 h-[30px]! px-4! ml-1.5 bg-accent! hover:bg-accent! text-white! text-t14! font-medium" style={{ borderRadius: hdrCorners(false, false) }}
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
            {orderedDesc.length === 0 && <div className="text-t11 text-muted px-1.5 py-2">{t("ovlEmptyLayers")}</div>}
            {orderedDesc.map((l, rowIdx) => {
              const M = TYPE_META[l.type] || TYPE_META.shape; const Icon = M.icon; const active = selectedIds.includes(l.id);
              const isDragging = dragId === l.id;
              // A chip stays out on its own account: locked shows the lock, hidden shows the
              // eye. The pill needs its notch as soon as either of them is beside it.
              const lockShown = !!l.locked;
              const eyeShown = l.visible === false;
              const chipsShown = lockShown || eyeShown;
              return (
                <div key={l.id} data-layer-index={rowIdx} className={`group flex items-center relative ${isDragging ? "opacity-40" : ""}`}>
                  {/* The drop line sits IN the gap, so it says where the row lands instead of
                      which row you are over -- an outline leaves you guessing above or below.
                      Zero height and absolutely placed, so showing it never nudges the list. */}
                  {dropIndex === rowIdx && (
                    <div className="absolute -top-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
                  )}
                  {dropIndex === rowIdx + 1 && rowIdx === orderedDesc.length - 1 && (
                    <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] rounded-full bg-accent pointer-events-none z-10" />
                  )}
                  <div
                    data-layer-id={l.id}
                    onPointerDown={(e) => onRowPointerDown(e, l.id)}
                    onClick={() => {
                      if (suppressLayerClickRef.current) { suppressLayerClickRef.current = false; return; }
                      setSelectedId(l.id);
                    }}
                    className={[
                      "flex-1 min-w-0 flex items-center gap-2 px-4 cursor-default select-none",
                      "transition-[background-color,border-radius] duration-150",
                      // 15px is half of LAYER_ROW_H, i.e. the pill value. It has to be a literal:
                      // Tailwind only sees class names it can read in the source.
                      "rounded-s-[15px]",
                      // The notch appears exactly when a neighbour does, so the pill is whole
                      // whenever it stands alone -- including on the selected row.
                      chipsShown ? "rounded-e-[6px]" : "rounded-e-[15px] group-hover:rounded-e-[6px]",
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
                      because Tailwind only sees class names it can read. */}
                  <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${lockShown ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayer(l.id, { locked: !l.locked }); }}
                      aria-label={t("ovlLocked")} aria-pressed={!!l.locked}
                      className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-[background-color,border-radius] duration-150 rounded-s-[6px] ${l.locked ? "text-primary" : "text-secondary"} ${eyeShown ? "rounded-e-[6px]" : "rounded-e-[15px] group-hover:rounded-e-[6px]"}`}
                      style={{ width: LAYER_ROW_H, height: LAYER_ROW_H }}>
                      {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                    </button>
                  </span>
                  <span className={`shrink-0 overflow-hidden transition-[width] duration-150 ${eyeShown ? "w-[36px]" : "w-0 group-hover:w-[36px]"}`}>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLayer(l.id, { visible: l.visible === false }); }}
                      aria-label={t("ovlVisible")} aria-pressed={l.visible !== false}
                      className={`ml-1.5 flex items-center justify-center border-0 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors duration-150 rounded-s-[6px] rounded-e-[15px] ${l.visible === false ? "text-primary" : "text-secondary"}`}
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
        className="relative flex-1 min-h-0 overflow-hidden rounded-[18px]"
        style={{ background: CANVAS_BG }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          // Handles the whole viewport (canvas + surrounding free space). Clicks on a layer
          // box / handle stopPropagation, so they never reach here.
          if (e.button === 1) { startPan(e); return; }   // middle mouse → pan anywhere
          if (e.button !== 0) return;                     // ignore right-click
          tool ? startDraw(e) : startMarquee(e);          // tool → draw; else selection box
        }}
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
                onPointerEnter={interactive ? () => setHoveredId(l.id) : undefined}
                onPointerLeave={interactive ? () => setHoveredId((h) => (h === l.id ? null : h)) : undefined}
                style={{
                  position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h,
                  transform: `rotate(${l.rotation || 0}deg)`, transformOrigin: "center center",
                  cursor: "default",
                  pointerEvents: interactive ? "auto" : "none",
                  boxShadow: isSel
                    ? `0 0 0 ${BW}px var(--accent)`
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
                        width: HANDLE_PX, height: HANDLE_PX, borderRadius: "50%",
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
                        borderRadius: 4,
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
                          background: "#fff", border: "1.5px solid var(--accent)", borderRadius: 2,
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
                      borderRadius: 4, fontSize: 11, lineHeight: 1.4, fontWeight: 600,
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
          {/* Live draw preview */}
          {drawRect && (
            <div style={{
              position: "absolute", left: drawRect.x, top: drawRect.y, width: drawRect.w, height: drawRect.h,
              border: `${1 / zoom}px dashed var(--accent)`, background: "rgba(224,64,251,0.10)", pointerEvents: "none",
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
      <div className="shrink-0 flex items-center justify-center pt-2.5" style={{ gap: HDR_NOTCH }}>
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
                <DropdownPopover placement="top start" className="min-w-44">
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
      </div>
      </div>{/* end canvas + toolbar column */}

      {/* ── Right: inspector (docked) ──────────────────────────────────────────── */}
      {prefs.showRight && <div className="shrink-0 flex flex-col relative" style={{ width: rightW }}>
        <div onPointerDown={(e) => startPanelResize("right", e)}
          className="absolute top-0 left-0 h-full w-1.5 -translate-x-1/2 z-20 cursor-col-resize hover:bg-[var(--accent)]/40" />
        <div className="overflow-y-auto flex-1 min-h-0 px-[26px] py-3">
          {selectedIds.length > 1 ? (
            <>
              <div className="text-t12 font-semibold text-primary mb-1">{selectedIds.length} {t("ovlSelectedCount") || "selected"}</div>
              <div className="text-t11 text-muted mb-3 leading-snug">{t("ovlMultiHint") || "Drag any of them to move the group. Delete removes all."}</div>
              <Button variant="secondary" size="sm" className="gap-1.5 text-[var(--status-danger)]!" onPress={deleteSelected}>
                <Trash size={13} /> {t("ovlMenuDelete")}
              </Button>
            </>
          ) : !selected ? (
            <>
              <div className="text-t12 font-semibold text-primary mb-1">{t("ovlCanvas")}</div>
              <div className="text-t11 text-muted mb-3 leading-snug">{t("ovlNoSelection")}</div>
              <Section title={t("ovlSize")}>
                <div className="grid grid-cols-2 gap-2">
                  <PillNum prefix="W" value={doc.canvas.width} min={40} max={3840} onChange={(v) => updateCanvas({ width: v })} />
                  <PillNum prefix="H" value={doc.canvas.height} min={20} max={2160} onChange={(v) => updateCanvas({ height: v })} />
                </div>
                <SwitchField label={t("overlayAutoHide")} checked={doc.canvas.autoHide} onChange={(v) => updateCanvas({ autoHide: v })} />
              </Section>
              <Section title={t("ovlBackground")}>
                <ColorField label={t("ovlColor")} value={doc.canvas.bg?.color} onChange={(v) => updateCanvasBg({ color: v })}
                  opacity={doc.canvas.bg?.opacity} onOpacity={(v) => updateCanvasBg({ opacity: v })} />
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
                    <PillNum prefix="TL" value={doc.canvas.corners?.TL ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), TL: v } })} />
                    <PillNum prefix="TR" value={doc.canvas.corners?.TR ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), TR: v } })} />
                    <PillNum prefix="BL" value={doc.canvas.corners?.BL ?? 0} min={0} max={400}
                      onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), BL: v } })} />
                    <PillNum prefix="BR" value={doc.canvas.corners?.BR ?? 0} min={0} max={400}
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
                    <InputRoot className="text-t12! h-8! bg-[var(--surface-2)]! border-border!" placeholder={(TYPE_META[selected.type] || {}).label} />
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
                  <DropdownPopover placement="bottom end" className="min-w-[180px] max-h-[320px] overflow-y-auto">
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
              <LayerEffectsSection t={t} layer={selected} setStyle={setStyle} />
            </>
            );
          })()}

        </div>
      </div>}

      {/* ── Save-as popover ──────────────────────────────────────────────────── */}
      {saveOpen && (
        <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-64 rounded-xl shadow-xl border border-border p-3 flex flex-col gap-2"
          style={{ background: "var(--bg-elevated)" }}
          onKeyDown={(e) => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setSaveOpen(false); }}>
          <span className="text-t12 font-semibold text-primary">{t("ovlProfileSave")}</span>
          <TextFieldRoot value={saveName} onChange={setSaveName} aria-label={t("ovlProfileName")}>
            <InputRoot autoFocus className="text-t12! bg-[var(--surface-2)]! border-border!" placeholder={t("ovlProfileName")} />
          </TextFieldRoot>
          <div className="flex gap-1.5">
            <Button variant="flat" color="primary" size="sm" className="flex-1 text-t12!" onPress={saveProfile}>
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
          <span className="text-t12 font-semibold text-primary">{t("ovlPrefNudge")}</span>
          <label className="flex items-center justify-between gap-2">
            <span className="text-t12 text-muted">{t("ovlPrefNudgeStep")}</span>
            <input type="text" inputMode="numeric" autoFocus value={prefs.nudge}
              onChange={(e) => setPref("nudge", Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 1))}
              className="w-[70px] rounded-md px-2 py-1 text-t12 text-primary text-right outline-none border border-border focus:border-accent"
              style={{ background: "var(--surface-2)" }} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span className="text-t12 text-muted">{t("ovlPrefNudgeBig")}</span>
            <input type="text" inputMode="numeric" value={prefs.nudgeBig}
              onChange={(e) => setPref("nudgeBig", Math.max(1, parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 1))}
              className="w-[70px] rounded-md px-2 py-1 text-t12 text-primary text-right outline-none border border-border focus:border-accent"
              style={{ background: "var(--surface-2)" }} />
          </label>
          <div className="flex gap-1.5 mt-0.5">
            <Button variant="flat" color="primary" size="sm" className="flex-1 text-t12!" onPress={() => setNudgeOpen(false)}>
              <Check size={13} /> {t("ovlDone")}
            </Button>
            <Button variant="ghost" size="sm" className="text-t12!" onPress={() => { setPref("nudge", 1); setPref("nudgeBig", 10); }}>
              {t("ovlReset")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Font Picker panel ────────────────────────────────────────────────── */}
      {fontPickerOpen && selected && (() => {
        const currentValue = selected.style?.fontFamily || "system-ui, sans-serif";
        // Local fonts: deduplicate against FONT_LIST labels
        const localFontItems = (localFonts || [])
          .filter((name) => !FONT_LIST.some((f) => f.label.toLowerCase() === name.toLowerCase()))
          .map((name) => ({ value: `'${name}'`, label: name, category: "local" }));
        const allFonts = [...FONT_LIST, ...localFontItems];
        const filtered = allFonts.filter((f) => {
          if (fontPickerCategory === "google" && f.category !== "google") return false;
          if (fontPickerCategory === "system" && f.category !== "system") return false;
          if (fontPickerCategory === "local" && f.category !== "local") return false;
          return f.label.toLowerCase().includes(fontPickerSearch.toLowerCase());
        });
        const closePicker = () => { setFontPickerOpen(false); setFontPickerSearch(""); };
        const CAT_OPTS = [
          { value: "all", label: t("ovlFontAll") },
          { value: "google", label: t("ovlFontGoogle") },
          { value: "system", label: t("ovlFontSystem") },
          { value: "local", label: t("ovlFontLocal") + (localFonts === null ? " …" : localFontItems.length > 0 ? ` (${localFontItems.length})` : "") },
        ];
        return (
          <div
            ref={fontPanelRef}
            className="fixed z-50 w-60 flex flex-col overflow-hidden select-none"
            style={{
              top: fontPickerPos.top, left: fontPickerPos.left, maxHeight: "68vh",
              // The same shell the colour picker uses, so the two floating panels of the editor
              // are recognisably the same kind of thing.
              background: "#1c1c1c", border: "0.5px solid rgba(255,255,255,0.12)",
              borderRadius: "var(--r-xl)", boxShadow: "var(--elevation-4)",
            }}
            onKeyDown={(e) => { if (e.key === "Escape") closePicker(); }}
          >
            {/* Drag header. The panel used to be pinned under the toolbar, which put it on top
                of the inspector it belongs to and nowhere near the text being styled. */}
            <div onPointerDown={startFontPanelDrag}
              className="flex items-center gap-2 px-3 h-9 shrink-0 text-muted" style={{ cursor: "move" }}>
              <DotsSixVertical size={13} />
              <span className="flex-1 font-semibold text-primary" style={{ fontSize: "var(--t13)" }}>{t("ovlFont")}</span>
              <button data-no-drag type="button" onClick={closePicker} aria-label={t("close")}
                className="w-6 h-6 flex items-center justify-center rounded-[var(--r-md)] border-0 bg-transparent text-muted hover:text-primary hover:bg-hover transition-colors cursor-pointer">
                <X size={13} />
              </button>
            </div>

            {/* Search + category, both in the editor's field shape */}
            <div className="px-2.5 pb-2 flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center gap-2 h-[30px] px-3 rounded-[var(--r-full)] bg-[var(--surface-2)] border border-transparent focus-within:border-accent transition-colors">
                <MagnifyingGlass size={12} className="text-muted shrink-0" />
                <input
                  autoFocus
                  value={fontPickerSearch}
                  onChange={(e) => setFontPickerSearch(e.target.value)}
                  placeholder={t("ovlFontSearch")}
                  style={{ fontSize: "var(--t13)" }}
                  className="flex-1 min-w-0 bg-transparent text-primary outline-none placeholder:text-muted"
                />
                {fontPickerSearch && (
                  <button type="button" onClick={() => setFontPickerSearch("")} aria-label={t("close")}
                    className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-primary transition-colors cursor-pointer">
                    <X size={10} />
                  </button>
                )}
              </div>
              <SelectField value={fontPickerCategory} options={CAT_OPTS} onChange={setFontPickerCategory} />
            </div>

            {/* Font list */}
            <div className="overflow-y-auto flex-1 min-h-0 px-1.5 pb-2">
              {fontPickerCategory === "local" && localFonts === null ? (
                <div className="text-muted text-center py-4" style={{ fontSize: "var(--t12)" }}>{t("ovlFontLocalLoading")}</div>
              ) : filtered.length === 0 ? (
                <div className="text-muted text-center py-4" style={{ fontSize: "var(--t12)" }}>{t("ovlFontNoResults")}</div>
              ) : filtered.map((f) => (
                <div
                  key={f.value}
                  onClick={() => { setStyle(selected.id, { fontFamily: f.value }); closePicker(); }}
                  className={[
                    "flex items-center h-8 px-3 rounded-[var(--r-full)] cursor-pointer leading-none transition-colors",
                    f.value === currentValue
                      ? "text-accent bg-accent-dim"
                      : "text-primary hover:bg-[var(--surface-2)]",
                  ].join(" ")}
                  style={{ fontFamily: f.value, fontSize: "var(--t14)" }}
                >
                  <span className="truncate">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Widget Browser modal ─────────────────────── */}
      {browserOpen && (() => {
        const q = browserQuery.trim().toLowerCase();
        const shown = profiles
          .filter((p) => !q || p.name.toLowerCase().includes(q))
          .sort((x, y) => {
            if (browserSort === "name") return x.name.localeCompare(y.name);
            if (browserSort === "size") return ((y.doc?.canvas?.width || 0) * (y.doc?.canvas?.height || 0)) - ((x.doc?.canvas?.width || 0) * (x.doc?.canvas?.height || 0));
            return String(y.savedAt || "").localeCompare(String(x.savedAt || ""));
          });
        // id -> position in the sorted, filtered result. Cards render in the stored order and
        // take their place from this, so the DOM is never reordered.
        const rankOf = new Map(shown.map((p, i) => [p.id, i]));
        const closeBrowser = () => { setBrowserOpen(false); setRenamingId(null); setConfirmDeleteId(null); };
        const sortOpts = [
          ["recent", t("ovlProfileSortRecent")],
          ["name", t("ovlProfileSortName")],
          ["size", t("ovlProfileSortSize")],
        ];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onKeyDown={(e) => { if (e.key === "Escape") closeBrowser(); }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBrowser(); }}>
          <div className="w-[860px] max-w-[92vw] h-[76vh] flex flex-col rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}>

            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
              <div className="flex items-center gap-2.5 shrink-0">
                <Swatches size={16} className="text-accent" />
                <span className="text-t14 font-semibold text-primary">{t("ovlProfileBrowse")}</span>
                {profiles.length > 0 && (
                  <span className="text-t11 text-muted">({profiles.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {profiles.length > 1 && (
                  <>
                    {/* Search */}
                    <div className="relative">
                      <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                      <input
                        value={browserQuery}
                        onChange={(e) => setBrowserQuery(e.target.value)}
                        placeholder={t("ovlProfileSearch")}
                        className="h-8 w-[210px] rounded-lg pl-8 pr-2.5 text-t12 text-primary border border-border outline-none focus:border-accent transition-colors"
                        style={{ background: "var(--bg-base)" }}
                      />
                    </div>
                    {/* Sort. A plain segmented row rather than a dropdown: three options do not
                        need a menu, and this keeps the header a single line of controls. */}
                    <div className="flex items-center gap-[3px] h-8 rounded-lg p-[3px]" style={{ background: "var(--bg-base)" }}>
                      {sortOpts.map(([id, label]) => (
                        <button key={id} type="button" onClick={() => setBrowserSort(id)}
                          className={[
                            "h-full px-3 rounded-md text-t12 font-medium border-0 cursor-default transition-colors",
                            browserSort === id ? "bg-accent text-[var(--accent-foreground)]" : "bg-transparent text-secondary hover:text-primary",
                          ].join(" ")}
                        >{label}</button>
                      ))}
                    </div>
                  </>
                )}
                <input ref={importFileRef} type="file" accept=".json" multiple className="hidden" onChange={handleImportFiles} />
                <Button variant="flat" size="sm" className="h-8! gap-1.5 text-t12!" onPress={() => importFileRef.current?.click()}>
                  <UploadSimple size={14} /> {t("ovlProfileImport")}
                </Button>
                <Tooltip text={t("close")}>
                  <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0!" onPress={closeBrowser} aria-label={t("close")}>
                    <X size={15} />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Grid */}
            <div className="overflow-y-auto p-4 flex-1 min-h-0">
              {profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Swatches size={36} className="text-muted opacity-40" />
                  <div className="text-t13 text-muted">{t("ovlProfileEmpty")}</div>
                  <div className="text-t11 text-muted opacity-70">{t("ovlProfileEmptyHint")}</div>
                </div>
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <MagnifyingGlass size={30} className="text-muted opacity-40" />
                  <div className="text-t13 text-muted">{t("ovlProfileNoResults")}</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {profiles.map((prof) => {
                    const rank = rankOf.get(prof.id);
                    const hidden = rank === undefined;
                    const layerCount = prof.doc?.layers?.length ?? 0;
                    const cw = prof.doc?.canvas?.width ?? "?";
                    const ch = prof.doc?.canvas?.height ?? "?";
                    const date = prof.savedAt ? new Date(prof.savedAt).toLocaleDateString() : "";
                    const renaming = renamingId === prof.id;
                    const confirming = confirmDeleteId === prof.id;
                    return (
                      <div key={prof.id}
                        className="group/design relative flex flex-col rounded-xl border border-border overflow-hidden hover:border-accent/60 transition-colors"
                        style={{
                          background: "color-mix(in srgb, var(--bg-elevated) 85%, var(--bg-base))",
                          order: hidden ? 0 : rank,
                          display: hidden ? "none" : undefined,
                        }}>

                        {/* Live preview on a checkerboard, so translucent designs read correctly */}
                        <div className="relative h-[168px] border-b border-border"
                          style={{ background: "repeating-conic-gradient(rgba(255,255,255,0.05) 0% 25%, rgba(255,255,255,0.02) 0% 50%) 0 0/16px 16px" }}>
                          <DesignPreview apiBase={apiBase} doc={prof.doc} box={{ w: 414, h: 168 }} />

                          {/* Actions ride over the preview and only appear on hover, so the card
                              itself stays quiet. */}
                          <div className="absolute inset-x-0 bottom-0 p-2 flex items-center gap-1.5 opacity-0 group-hover/design:opacity-100 focus-within:opacity-100 transition-opacity"
                            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))" }}>
                            <Button variant="flat" color="primary" size="sm" className="flex-1 h-9! text-t12!" onPress={() => applyProfile(prof)}>
                              {t("ovlProfileApply")}
                            </Button>
                            <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)" }}>
                              <Tooltip text={t("ovlProfileRename")}>
                                <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0! text-white!"
                                  onPress={() => { setRenamingId(prof.id); setRenameDraft(prof.name); }} aria-label={t("ovlProfileRename")}>
                                  <PencilSimple size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip text={t("ovlProfileDuplicate")}>
                                <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0! text-white!"
                                  onPress={() => duplicateProfile(prof)} aria-label={t("ovlProfileDuplicate")}>
                                  <Copy size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip text={t("ovlProfileExport")}>
                                <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0! text-white!"
                                  onPress={() => exportProfile(prof)} aria-label={t("ovlProfileExport")}>
                                  <DownloadSimple size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip text={t("ovlProfileDelete")}>
                                <Button variant="ghost" size="sm" isIconOnly className="h-8! w-8! min-w-0! text-danger!"
                                  onPress={() => setConfirmDeleteId(prof.id)} aria-label={t("ovlProfileDelete")}>
                                  <Trash size={14} />
                                </Button>
                              </Tooltip>
                            </div>
                          </div>

                          {/* The delete confirmation covers the preview it belongs to, rather than
                              opening a second modal over the first. */}
                          {confirming && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center"
                              style={{ background: "rgba(0,0,0,0.74)", backdropFilter: "blur(4px)" }}>
                              <div className="text-t12 text-white">{t("ovlProfileDeleteConfirm")}</div>
                              <div className="flex items-center gap-2">
                                <Button variant="flat" size="sm" className="h-8! text-t12!" onPress={() => setConfirmDeleteId(null)}>
                                  {t("cancel")}
                                </Button>
                                <Button variant="flat" color="danger" size="sm" className="h-8! text-t12!"
                                  onPress={() => { deleteProfile(prof.id); setConfirmDeleteId(null); }}>
                                  {t("ovlProfileDelete")}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="px-3 py-2.5">
                          {renaming ? (
                            <input
                              autoFocus
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => { renameProfile(prof.id, renameDraft); setRenamingId(null); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { renameProfile(prof.id, renameDraft); setRenamingId(null); }
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="w-full h-6 rounded-md px-1.5 text-t12 font-medium text-primary border border-accent outline-none"
                              style={{ background: "var(--bg-base)" }}
                            />
                          ) : (
                            <div className="text-t12 font-medium text-primary truncate cursor-default"
                              onDoubleClick={() => { setRenamingId(prof.id); setRenameDraft(prof.name); }}
                              title={prof.name}>{prof.name}</div>
                          )}
                          <div className="text-t10 text-muted mt-0.5 tabular-nums">
                            {cw} × {ch} · {layerCount} {t("ovlLayers").toLowerCase()} · {date}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      </div>{/* end canvas viewport */}
    </div>
  );
}
