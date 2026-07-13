// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — Figma-style direct-manipulation editor
//
//  Full-bleed canvas (pan + zoom) with the real engine in an <iframe> (zero
//  render drift, pointer-events:none) and a transparent React interaction layer
//  on top: click to select, drag to move, 8 handles to resize, knob to rotate.
//  Floating panels: left = layers, right = inspector. Live drag preview goes to
//  the iframe via postMessage; commits persist (localStorage + POST v2 → SSE/OBS).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
// createPortal removed — font picker is now lifted to OverlayEditor level
import {
  Button, Switch,
  NumberFieldRoot, NumberFieldGroup, NumberFieldInput,
  TextFieldRoot, InputRoot,
  SelectRoot, SelectTrigger, SelectValue, SelectIndicator, SelectPopover,
  ListBox, ListBoxItem,
  SeparatorRoot,
} from "@heroui/react";
import {
  ImageSquare, VinylRecord, TextSize, WaveformLines, PaintBrushBroad,
  Eye, EyeSlash, Lock, LockOpen, Plus, Trash, Copy, Check, ArrowsClockwise,
  ArrowsOut, ArrowClockwise, CaretDown, DotsSixVertical, CursorArrow,
  X, Minus, UploadSimple, DownloadSimple, FloppyDisk, Swatches, MagnifyingGlass,
} from "../icons.jsx";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
const editorWindow = getCurrentWebviewWindow();
import {
  isV2Doc, normalizeOverlayDoc, defaultOverlayDoc, LAYER_FACTORIES, uniformCorners,
} from "./schema.js";

const TYPE_META = {
  albumArt: { icon: VinylRecord, label: "Album Art" },
  text:     { icon: TextSize, label: "Text" },
  progress: { icon: WaveformLines, label: "Progress" },
  image:    { icon: ImageSquare, label: "Image" },
  shape:    { icon: PaintBrushBroad, label: "Shape" },
};
const ADD_TYPES = ["text", "albumArt", "progress", "image", "shape"];

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
const EFFECT_DEFAULTS = {
  shadow: { color: "#000000", x: 0, y: 2, blur: 8, opacity: 50 },
  glow: { color: "#ffffff", blur: 10 },
  blur: { amount: 4 },
};
const EFFECT_TYPE_OPTS = (t) => [
  { value: "shadow", label: t("ovlFxShadow") },
  { value: "glow", label: t("ovlFxGlow") },
  { value: "blur", label: t("ovlFxBlur") },
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

// ── Inspector controls ────────────────────────────────────────────────────────
// Section header with an optional right-aligned action node (e.g. a small toggle).
function Section({ title, right, children }) {
  return (
    <div className="border-t border-border pt-2.5 mt-2.5 first:border-t-0 first:pt-0 first:mt-0">
      {(title || right) && (
        <div className="flex items-center justify-between mb-1.5 px-0.5 min-h-[16px]">
          {title && <span className="text-t12 font-medium text-secondary">{title}</span>}
          {right}
        </div>
      )}
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}
function NumField({ label, value, onChange, min, max, step = 1 }) {
  const fmt = step < 1
    ? { useGrouping: false, maximumFractionDigits: 2 }
    : { useGrouping: false, maximumFractionDigits: 0 };
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-t12 text-muted shrink-0">{label}</span>
      <NumberFieldRoot
        value={value == null || Number.isNaN(value) ? 0 : value}
        minValue={min} maxValue={max} step={step}
        onChange={(v) => { if (!Number.isNaN(v)) onChange(v); }}
        aria-label={label} formatOptions={fmt}
        className="w-[96px]"
      >
        <NumberFieldGroup className="h-8! bg-[var(--surface-2)]! border-border!">
          <NumberFieldInput className="text-right! pr-2!" />
        </NumberFieldGroup>
      </NumberFieldRoot>
    </div>
  );
}
// Compact pill with a short prefix (X/Y/W/H …) — a plain controlled <input> (HeroUI's
// NumberField input sizing was unreliable). Prefix overlaid absolutely; live edits flow
// through on every valid keystroke; external value updates sync only while not focused.
function PillNum({ prefix, value, onChange, min, max, step = 1 }) {
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
    <div className="flex items-center h-8 w-full min-w-0 rounded-md bg-[var(--surface-2)] border border-border focus-within:border-accent">
      <span onPointerDown={onScrub} className="shrink-0 px-2 text-t11 text-muted select-none whitespace-nowrap" style={{ cursor: "ew-resize" }}>{prefix}</span>
      <div className="w-px h-4 bg-border shrink-0" />
      <input
        value={text}
        inputMode="numeric"
        aria-label={prefix}
        onFocus={() => { focused.current = true; }}
        onChange={onInput}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }}
        className="flex-1 min-w-0 bg-transparent outline-none text-t12 text-primary tabular-nums px-2"
      />
    </div>
  );
}
function OvlTextField({ label, value, onChange, placeholder }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {label && <span className="text-t12 text-muted shrink-0">{label}</span>}
      <TextFieldRoot value={value ?? ""} onChange={onChange} aria-label={label || placeholder} className="flex-1 min-w-0">
        <InputRoot className="text-t12! h-8! bg-[var(--surface-2)]! border-border!" placeholder={placeholder} />
      </TextFieldRoot>
    </div>
  );
}
function ColorField({ label, value, onChange, opacity, onOpacity }) {
  const hex = typeof value === "string" && value[0] === "#" ? value.slice(0, 7) : "#000000";
  return (
    <div className="flex items-center gap-2 h-8 px-1.5 rounded-md bg-[var(--surface-2)] border border-border">
      <label className="relative w-4 h-4 rounded shrink-0 overflow-hidden border border-border cursor-pointer" style={{ background: value || "#000" }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={label} />
      </label>
      <input value={(value ?? "").replace(/^#/, "")} onChange={(e) => onChange("#" + e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
        className="flex-1 min-w-0 bg-transparent outline-none text-t12 font-mono text-primary uppercase" aria-label={(label || "") + " hex"} />
      {onOpacity ? (
        <div className="flex items-center shrink-0 pl-1.5 border-l border-border">
          <input value={opacity ?? 100} onChange={(e) => onOpacity(clamp(parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10), 0, 100))}
            className="w-7 bg-transparent outline-none text-t11 text-muted text-right tabular-nums" aria-label={(label || "") + " opacity"} />
          <span className="text-t11 text-muted">%</span>
        </div>
      ) : opacity != null && <span className="text-t11 text-muted shrink-0 tabular-nums">{opacity}%</span>}
    </div>
  );
}
function SwitchField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-t12 text-muted">{label}</span>
      <Switch isSelected={!!checked} onChange={onChange} aria-label={label}>
        <Switch.Control><Switch.Thumb /></Switch.Control>
      </Switch>
    </div>
  );
}
function SelectField({ label, value, onChange, options }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {label && <span className="text-t12 text-muted shrink-0">{label}</span>}
      <SelectRoot
        selectedKey={value} onSelectionChange={(k) => onChange(String(k))}
        aria-label={label} className={label ? "w-[132px]" : "flex-1 min-w-0"}
      >
        <SelectTrigger className="text-t12! h-8! bg-[var(--surface-2)]! border-border!">
          <SelectValue className="text-t12!" />
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {options.map((o) => (
              <ListBoxItem key={o.value} id={o.value} className="text-t12!">{o.label}</ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </SelectRoot>
    </div>
  );
}
// Icon/label segmented control (e.g. align L/C/R) — a pill matching the input fields,
// with rounded inner segments (no hard per-segment dividers).
function Segmented({ value, onChange, options }) {
  return (
    <div className="flex h-8 gap-0.5 p-0.5 rounded-md border border-border bg-[var(--surface-2)]">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-label={o.aria || o.value}
          className={[
            "flex-1 flex items-center justify-center rounded-[5px] text-t12 transition-colors",
            value === o.value ? "text-white" : "text-muted hover:text-primary hover:bg-[var(--bg-hover)]",
          ].join(" ")}
          style={{ background: value === o.value ? "var(--accent)" : undefined }}
        >{o.icon || o.label}</button>
      ))}
    </div>
  );
}
// Row of compact icon buttons (rotate / flip) — same pill look as Segmented.
function IconBtnRow({ actions }) {
  return (
    <div className="flex h-8 gap-0.5 p-0.5 rounded-md border border-border bg-[var(--surface-2)]">
      {actions.map((a, i) => (
        <button key={i} type="button" onClick={a.onAction} aria-label={a.aria}
          className={[
            "flex-1 min-w-7 flex items-center justify-center rounded-[5px] transition-colors",
            a.active ? "text-white" : "text-secondary hover:text-primary hover:bg-[var(--bg-hover)]",
          ].join(" ")}
          style={{ background: a.active ? "var(--accent)" : undefined }}
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
      <button type="button" onClick={add} aria-label={t("ovlAddFill") || "Add fill"} className="text-muted hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.length === 0 && <div className="text-t11 text-muted px-0.5">—</div>}
      {list.map((f, i) => (
        <div key={f.id || i} className="group/frow flex items-center gap-1">
          <div className="flex-1 min-w-0"><ColorField value={f.color} onChange={(c) => set(i, { color: c })} opacity={f.opacity ?? 100} onOpacity={(o) => set(i, { opacity: o })} /></div>
          <button type="button" onClick={() => set(i, { visible: f.visible === false })} aria-label={t("ovlVisible")}
            className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-[color,opacity] hover:text-primary ${f.visible === false ? "opacity-100 text-muted" : "opacity-0 group-hover/frow:opacity-100 text-secondary"}`}>
            {f.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </button>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted opacity-0 group-hover/frow:opacity-100 hover:text-[#ff7070] transition-[color,opacity]"><Minus size={13} /></button>
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
      <button type="button" onClick={add} aria-label={t("ovlAddStroke") || "Add stroke"} className="text-muted hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.length === 0 && <div className="text-t11 text-muted px-0.5">—</div>}
      {list.map((s, i) => (
        <div key={s.id || i} className="group/srow flex items-center gap-1">
          <div className="flex-1 min-w-0"><ColorField value={s.color} onChange={(c) => set(i, { color: c })} opacity={s.opacity ?? 100} onOpacity={(o) => set(i, { opacity: o })} /></div>
          <button type="button" onClick={() => set(i, { visible: s.visible === false })} aria-label={t("ovlVisible")}
            className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-[color,opacity] hover:text-primary ${s.visible === false ? "opacity-100 text-muted" : "opacity-0 group-hover/srow:opacity-100 text-secondary"}`}>
            {s.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
          </button>
          <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted opacity-0 group-hover/srow:opacity-100 hover:text-[#ff7070] transition-[color,opacity]"><Minus size={13} /></button>
        </div>
      ))}
      {list.length > 0 && (
        <div className="grid grid-cols-[78px_1fr] gap-2">
          <PillNum prefix="W" value={weight} min={0} max={40} step={0.5} onChange={onWeight} />
          <SelectField value={position} options={STROKE_POS_OPTS(t)} onChange={onPosition} />
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
      <button type="button" onClick={add} aria-label={t("ovlAddEffect") || "Add effect"} className="text-muted hover:text-primary transition-colors"><Plus size={13} /></button>
    }>
      {list.length === 0 && <div className="text-t11 text-muted px-0.5">—</div>}
      {list.map((e, i) => (
        <div key={e.id || i} className="group/erow rounded-md border border-border bg-[var(--surface-1)] p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0"><SelectField value={e.type} options={EFFECT_TYPE_OPTS(t)} onChange={(ty) => setType(i, ty)} /></div>
            <button type="button" onClick={() => set(i, { visible: e.visible === false })} aria-label={t("ovlVisible")}
              className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-[color,opacity] hover:text-primary ${e.visible === false ? "opacity-100 text-muted" : "opacity-0 group-hover/erow:opacity-100 text-secondary"}`}>
              {e.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
            </button>
            <button type="button" onClick={() => remove(i)} aria-label={t("ovlRemove") || "Remove"}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted opacity-0 group-hover/erow:opacity-100 hover:text-[#ff7070] transition-[color,opacity]"><Minus size={13} /></button>
          </div>
          {e.type === "shadow" && (<>
            <ColorField value={e.color} onChange={(c) => set(i, { color: c })} opacity={e.opacity ?? 50} onOpacity={(o) => set(i, { opacity: o })} />
            <div className="grid grid-cols-2 gap-2">
              <PillNum prefix="X" value={e.x ?? 0} onChange={(v) => set(i, { x: v })} />
              <PillNum prefix="Y" value={e.y ?? 2} onChange={(v) => set(i, { y: v })} />
            </div>
            <NumField label={t("ovlBlur")} value={e.blur ?? 8} min={0} max={60} onChange={(v) => set(i, { blur: v })} />
          </>)}
          {e.type === "glow" && (<>
            <ColorField value={e.color} onChange={(c) => set(i, { color: c })} />
            <NumField label={t("ovlBlur")} value={e.blur ?? 10} min={0} max={60} onChange={(v) => set(i, { blur: v })} />
          </>)}
          {e.type === "blur" && (
            <NumField label={t("ovlAmount")} value={e.amount ?? 4} min={0} max={40} onChange={(v) => set(i, { amount: v })} />
          )}
        </div>
      ))}
    </Section>
  );
}

// ── Menu bar helpers ──────────────────────────────────────────────────────────
function MenuSep() {
  return <div className="mx-2 my-0.5 h-px bg-border" />;
}
function MenuItem({ icon, label, shortcut, onAction, disabled, checked }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onAction}
      className={[
        "flex items-center gap-2 w-full text-left px-3 py-1.5 text-t12 transition-colors",
        disabled
          ? "text-muted cursor-default pointer-events-none"
          : "text-primary hover:bg-[var(--bg-hover)] cursor-pointer",
      ].join(" ")}
      style={{ background: "none", border: "none" }}
    >
      <span className="w-4 shrink-0 flex items-center justify-center text-muted">
        {checked ? <Check size={12} className="text-accent" /> : icon || null}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-t11 text-muted ml-2 shrink-0">{shortcut}</span>}
    </button>
  );
}

// ── Font Picker trigger (panel is lifted to OverlayEditor level) ──────────────
function FontPicker({ t, value, onOpen }) {
  // Resolve a human-readable label even for locally-installed fonts not in FONT_LIST
  const knownFont = FONT_LIST.find((f) => f.value === value);
  const label = knownFont
    ? knownFont.label
    : value.replace(/'/g, "").split(",")[0].trim() || "System";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-t12 text-muted shrink-0">{t("ovlFont")}</span>
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 text-right text-t12 text-primary truncate cursor-pointer hover:text-accent transition-colors"
        style={{ fontFamily: value, background: "none", border: "none", padding: 0 }}
      >
        {label}
      </button>
    </div>
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
        <SelectField label={t("ovlAlign")} value={s.align || "left"} options={ALIGN_OPTS(t)} onChange={(v) => setStyle(id, { align: v })} />
        <SelectField label={t("ovlVAlign")} value={s.valign || "top"} options={VALIGN_OPTS(t)} onChange={(v) => setStyle(id, { valign: v })} />
        <NumField label={t("ovlLineHeight")} value={s.lineHeight ?? 1.3} min={0.5} max={3} step={0.1} onChange={(v) => setStyle(id, { lineHeight: v })} />
        <NumField label={t("ovlLetterSpacing")} value={s.letterSpacing ?? 0} min={-5} max={20} step={0.5} onChange={(v) => setStyle(id, { letterSpacing: v })} />
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
          <NumField label={t("ovlPoints")} value={s.points ?? 5} min={3} max={12} onChange={(v) => setStyle(id, { points: v })} />
          <NumField label={t("ovlInnerRatio")} value={Math.round((s.innerRatio ?? 0.5) * 100)} min={10} max={90} onChange={(v) => setStyle(id, { innerRatio: clamp(v / 100, 0.1, 0.9) })} />
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
      <SelectField label={t("ovlEntrance")} value={fx.entrance?.type || "none"} options={ENTRANCE_OPTS(t)} onChange={(v) => setFx("entrance", { type: v })} />
      {fx.entrance?.type && fx.entrance.type !== "none" && <NumField label={t("ovlDuration")} value={fx.entrance?.duration ?? 0.5} min={0.1} max={3} step={0.1} onChange={(v) => setFx("entrance", { duration: v })} />}
      <SelectField label={t("ovlLoop")} value={fx.loop?.type || "none"} options={LOOP_OPTS(t)} onChange={(v) => setFx("loop", { type: v })} />
      {fx.loop?.type && fx.loop.type !== "none" && <NumField label={t("ovlSpeed")} value={fx.loop?.speed ?? 2} min={0.3} max={10} step={0.1} onChange={(v) => setFx("loop", { speed: v })} />}
    </Section>
  </>);
}

// Custom window controls (minimize / maximize / close) for the standalone editor window.
function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    let cancel = false;
    const check = () => editorWindow.isMaximized().then((v) => { if (!cancel) setMax(v); });
    check();
    const un = editorWindow.onResized(() => check());
    return () => { cancel = true; un.then((fn) => fn()); };
  }, []);
  const base = "w-9 h-7 flex items-center justify-center rounded text-secondary transition-colors shrink-0";
  return (
    <div className="flex items-center gap-0.5 ml-1" style={{ pointerEvents: "all" }}>
      <button type="button" className={`${base} hover:bg-[var(--bg-hover)]`} onClick={() => editorWindow.minimize()} aria-label="Minimize"><Minus size={11} /></button>
      <button type="button" className={`${base} hover:bg-[var(--bg-hover)]`} onClick={() => editorWindow.toggleMaximize()} aria-label="Maximize">
        {max
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="2" y="0" width="8" height="8" rx="0.5" /><path d="M0 2v7a1 1 0 0 0 1 1h7" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="0.5" /></svg>}
      </button>
      <button type="button" className={`${base} hover:bg-[#c42b1c] hover:text-white!`} onClick={() => editorWindow.close()} aria-label="Close"><X size={11} /></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OverlayEditor({
  t, apiBase, obsPort, obsEnabled, toggleObs, obsPortInput, setObsPortInput, onPortSave,
  standalone = false,
}) {
  const [doc, setDoc] = useState(loadInitialDoc);
  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [tool, setTool] = useState(null);     // null = select; { type, shape? } = draw mode
  const [drawRect, setDrawRect] = useState(null); // live preview while drawing
  const [aspectLock, setAspectLock] = useState(false);
  const aspectLockRef = useRef(false);
  const [canvasCornersInd, setCanvasCornersInd] = useState(false); // uniform ↔ per-corner radius (canvas)
  const [layerCornersInd, setLayerCornersInd] = useState(false); // uniform ↔ per-corner radius (layer)
  aspectLockRef.current = aspectLock;
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const dragIdRef = useRef(null);       // stable refs for pointer event closures
  const dragOverIdRef = useRef(null);
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
  const [localFonts, setLocalFonts] = useState(null); // null = not yet fetched
  const [menuOpen, setMenuOpen] = useState(null); // { name: "file"|"edit"|"view", x, y }

  const [viewportRef, viewportSize] = useElementSize();
  const iframeRef = useRef(null);
  const rafRef = useRef(0);
  const didFit = useRef(false);
  const nudgeTimer = useRef(0);
  const nudgeActive = useRef(false);
  const liveDocRef = useRef(null); // accumulates the doc across a keyboard-nudge burst

  const overlayUrl = `http://localhost:${obsPort}/overlay`;
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
    const z = clamp(Math.min((vp.w - padPx) / W, (vp.h - padPx) / H), 0.1, 3);
    setZoom(z); setPan({ x: (vp.w - W * z) / 2, y: (vp.h - H * z) / 2 });
  }, [doc, viewportSize]);
  useEffect(() => {
    if (!didFit.current && viewportSize.w > 0) { didFit.current = true; fit(); }
  }, [viewportSize, fit]);

  const selected = doc.layers.find((l) => l.id === selectedId) || null;
  const orderedAsc = [...doc.layers].sort((a, b) => (a.z || 0) - (b.z || 0)); // paint order (hit-test top = last)
  const orderedDesc = [...doc.layers].sort((a, b) => (b.z || 0) - (a.z || 0)); // list (top first)

  // Drag-and-drop layer reorder: reassigns z values to reflect new visual order.
  const reorderLayers = useCallback((fromId, toId) => {
    if (fromId === toId) return;
    const ordered = [...doc.layers].sort((a, b) => (b.z || 0) - (a.z || 0));
    const fromIdx = ordered.findIndex((l) => l.id === fromId);
    const toIdx   = ordered.findIndex((l) => l.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const n = reordered.length;
    const updatedLayers = doc.layers.map((l) => ({
      ...l,
      z: n - 1 - reordered.findIndex((r) => r.id === l.id),
    }));
    commit({ ...doc, layers: updatedLayers });
  }, [doc, commit]);

  // Stable ref so pointer-event closures always call the latest reorderLayers.
  const reorderLayersRef = useRef(null);
  reorderLayersRef.current = reorderLayers;

  // Pointer-based drag sort (HTML5 drag-and-drop is unreliable in WebView2/WebKit).
  const onGripDown = useCallback((e, id) => {
    e.stopPropagation();
    e.preventDefault();
    dragIdRef.current = id;
    dragOverIdRef.current = null;
    setDragId(id);
    setDragOverId(null);

    const onMove = (ev) => {
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const rowEl = els.find((el) => el.dataset?.layerId);
      if (rowEl) {
        const overId = rowEl.dataset.layerId;
        if (overId !== dragIdRef.current) {
          dragOverIdRef.current = overId;
          setDragOverId(overId);
        }
      }
    };

    const onUp = () => {
      const fromId = dragIdRef.current;
      const toId = dragOverIdRef.current;
      if (fromId && toId && fromId !== toId) reorderLayersRef.current?.(fromId, toId);
      dragIdRef.current = null;
      dragOverIdRef.current = null;
      setDragId(null);
      setDragOverId(null);
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
  };
  const deleteLayer = (id) => { commit({ ...doc, layers: doc.layers.filter((l) => l.id !== id) }, doc); setSelectedId(null); };
  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const l = doc.layers.find((x) => x.id === selectedId);
    if (!l) return;
    const clone = { ...l, id: crypto.randomUUID(), x: l.x + 20, y: l.y + 20 };
    commit({ ...doc, layers: [...doc.layers, clone] }, doc);
    setSelectedId(clone.id);
  }, [doc, selectedId, commit]);

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
    if (!selectedId) return;
    const cur = (liveDocRef.current || doc).layers.find((x) => x.id === selectedId);
    if (!cur || cur.locked) return;
    liveEdit((b) => ({ ...b, layers: b.layers.map((x) => (x.id === selectedId ? { ...x, x: x.x + dx, y: x.y + dy } : x)) }));
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) redo(); else undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const l = doc.layers.find((x) => x.id === selectedId);
        if (l && !l.locked) { e.preventDefault(); deleteLayer(selectedId); }
      } else if (selectedId && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const step = e.shiftKey ? 10 : 1;
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
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nz = clamp(zoom * factor, 0.1, 5);
    const cx = (mx - pan.x) / zoom, cy = (my - pan.y) / zoom;
    setPan({ x: mx - cx * nz, y: my - cy * nz }); setZoom(nz);
  };
  const startPan = (e) => {
    // Only when the empty canvas (not a layer box) is pressed.
    const start = { x: e.clientX, y: e.clientY }, p0 = { ...pan };
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      setPan({ x: p0.x + dx, y: p0.y + dy });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      if (!moved) setSelectedId(null); // click on empty = deselect
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
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
      setTool(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  // ── Layer gestures (move / resize / rotate) ──────────────────────────────────
  const startGesture = (e, mode, dir, layer) => {
    e.stopPropagation(); e.preventDefault();
    if (layer.locked) return;
    flushLive();
    setSelectedId(layer.id);
    const rect = viewportRef.current.getBoundingClientRect();
    const z = zoom, p = { ...pan }, L0 = { ...layer };
    const center0 = { x: L0.x + L0.w / 2, y: L0.y + L0.h / 2 };
    const startClient = { x: e.clientX, y: e.clientY };

    // Snap targets: canvas edges + center, and every other visible layer's
    // edges + centers. Threshold is ~6 screen px (converted to canvas px).
    const SNAP = 6 / z;
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
        if (ev.shiftKey) {
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

  const copyUrl = () => { navigator.clipboard.writeText(overlayUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  // ── Profile management ───────────────────────────────────────────────────────
  const importFileRef = useRef(null);

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

  const HS = 9 / zoom, BW = 1.5 / zoom; // handle size / border width in canvas px (visually constant)

  const openMenu = (name, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuOpen((prev) => prev?.name === name ? null : { name, x: r.left, y: r.bottom });
  };
  const closeMenu = () => setMenuOpen(null);

  return (
    <div
      data-overlay-editor
      className={`flex flex-col w-full overflow-hidden select-none${standalone ? "" : " rounded-xl"}`}
      style={{ height: standalone ? "100vh" : "78vh", minHeight: standalone ? undefined : 480 }}
    >
      {/* ── Top bar (doubles as the custom title bar in standalone) ──────────────── */}
      <div className="shrink-0 flex items-center gap-2 h-12 px-3 border-b border-border" {...(standalone ? { "data-tauri-drag-region": true } : {})}>
        <button type="button" onClick={(e) => openMenu("main", e)}
          className="flex items-center gap-1.5 h-8 pl-1.5 pr-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          style={{ border: "none", background: menuOpen?.name === "main" ? "var(--bg-hover)" : "none", cursor: "pointer" }}>
          <img src="/Kodama%20Logo.png" alt="" width="18" height="18" />
          <span className="text-t13 font-semibold text-primary">Overlay</span>
          <CaretDown size={10} className="text-muted" />
        </button>
        <TextFieldRoot value={doc.canvas.name ?? ""} onChange={(v) => updateCanvas({ name: v })} aria-label={t("ovlProfileName")} className="w-[184px]">
          <InputRoot className="text-t12! h-8! bg-[var(--surface-2)]! border-border!" placeholder={t("ovlProfileDefaultName")} />
        </TextFieldRoot>
        <div className="flex-1" {...(standalone ? { "data-tauri-drag-region": true } : {})} />
        <Button color="accent" variant="solid" size="sm" className="gap-1.5" onPress={() => { setSaveOpen((o) => !o); setBrowserOpen(false); }}><FloppyDisk size={14} />{t("save")}</Button>
        <Button variant="ghost" size="sm" isIconOnly onPress={() => setIframeKey((k) => k + 1)} aria-label={t("ovlReloadPreview")}><ArrowsClockwise size={15} /></Button>
        <Button variant="ghost" size="sm" isIconOnly onPress={undo} isDisabled={!past.length} aria-label={t("ovlMenuUndo")}><span style={{ transform: "scaleX(-1)", display: "inline-flex" }}><ArrowClockwise size={15} /></span></Button>
        <Button variant="ghost" size="sm" isIconOnly onPress={redo} isDisabled={!future.length} aria-label={t("ovlMenuRedo")}><ArrowClockwise size={15} /></Button>
        <Button variant="secondary" size="sm" className="gap-1.5" onPress={() => { setBrowserOpen(true); setSaveOpen(false); }}><Swatches size={14} />{t("ovlProfileBrowse")}</Button>
        {standalone && <div className="w-px h-5 bg-border mx-1" />}
        {standalone && <WindowControls />}
      </div>

      {/* ── Body (docked panels + canvas) ───────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── Left: layers ──────────────────────────────────────────────────────── */}
        <div className="w-[184px] shrink-0 flex flex-col border-r border-border">
          <div className="flex items-center justify-between pl-3 pr-1.5 h-10 shrink-0 border-b border-border relative">
            <span className="text-t12 font-medium text-secondary">{t("ovlLayers")}</span>
          </div>
          <div className="flex flex-col gap-0.5 p-1.5 overflow-y-auto min-h-0">
            {orderedDesc.length === 0 && <div className="text-t11 text-muted px-1.5 py-2">{t("ovlEmptyLayers")}</div>}
            {orderedDesc.map((l) => {
              const M = TYPE_META[l.type] || TYPE_META.shape; const Icon = M.icon; const active = l.id === selectedId;
              const isDragging = dragId === l.id;
              const isDropTarget = dragOverId === l.id && dragId !== l.id;
              return (
                <div key={l.id}
                  data-layer-id={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className={[
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-default select-none transition-opacity",
                    active ? "bg-accent-dim text-accent" : "text-primary hover:bg-[var(--bg-hover)]",
                    isDragging ? "opacity-40" : "",
                    isDropTarget ? "ring-1 ring-inset ring-accent" : "",
                  ].filter(Boolean).join(" ")}>
                  <DotsSixVertical size={12}
                    data-layer-id={l.id}
                    onPointerDown={(e) => onGripDown(e, l.id)}
                    className="shrink-0 text-muted opacity-0 group-hover:opacity-60 cursor-grab" />
                  <Icon size={15} className="shrink-0" />
                  <span className="flex-1 truncate text-t12">{l.name || M.label}</span>
                  <Button variant="ghost" size="sm" isIconOnly
                    onPress={() => toggleLayer(l.id, { visible: l.visible === false })}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t("ovlVisible")} className="shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100! h-6! w-6! min-w-0!">
                    {l.visible === false ? <EyeSlash size={13} /> : <Eye size={13} />}
                  </Button>
                  <Button variant="ghost" size="sm" isIconOnly
                    onPress={() => toggleLayer(l.id, { locked: !l.locked })}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t("ovlLocked")} className={`shrink-0 hover:opacity-100! h-6! w-6! min-w-0! ${l.locked ? "opacity-80" : "opacity-0 group-hover:opacity-60"}`}>
                    {l.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

      {/* ── Canvas viewport ────────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: "var(--bg-base)", backgroundImage: "radial-gradient(var(--stroke) 1px, transparent 0)", backgroundSize: "22px 22px" }}
        onWheel={onWheel}
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

        {/* Interaction layer (over the iframe) */}
        <div className="absolute inset-0" style={{ pointerEvents: "auto", cursor: tool ? "crosshair" : "default" }} onPointerDown={(e) => tool ? startDraw(e) : startPan(e)}>
          {orderedAsc.map((l) => {
            const isSel = l.id === selectedId;
            const interactive = !l.locked && l.visible !== false && !tool;
            return (
              <div key={l.id}
                onPointerDown={interactive ? (e) => startGesture(e, "move", null, l) : undefined}
                style={{
                  position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h,
                  transform: `rotate(${l.rotation || 0}deg)`, transformOrigin: "center center",
                  cursor: interactive ? "move" : "default",
                  pointerEvents: interactive ? "auto" : "none",
                  outline: isSel ? `${BW}px solid var(--accent)` : `${BW}px solid rgba(255,255,255,0.18)`,
                }}
              >
                {isSel && interactive && (
                  <>
                    {/* rotate knob */}
                    <div
                      onPointerDown={(e) => startGesture(e, "rotate", null, l)}
                      style={{
                        position: "absolute", left: "50%", top: -22 / zoom, width: HS, height: HS,
                        marginLeft: -HS / 2, marginTop: -HS / 2, borderRadius: "50%",
                        background: "var(--accent)", border: `${BW}px solid #fff`, cursor: "grab",
                      }}
                    />
                    {/* angle badge — visible while rotating */}
                    {rotAngle && (
                      <div style={{
                        position: "absolute", left: "50%", top: -44 / zoom,
                        transform: "translateX(-50%)",
                        background: rotAngle.snapped ? "var(--accent)" : "rgba(0,0,0,0.72)",
                        color: "#fff",
                        padding: `${2 / zoom}px ${5 / zoom}px`,
                        borderRadius: 4 / zoom,
                        fontSize: 11 / zoom,
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
                          width: HS, height: HS, marginLeft: -HS / 2, marginTop: -HS / 2,
                          background: "#fff", border: `${BW}px solid var(--accent)`, borderRadius: 2 / zoom,
                          cursor: `${h.cur}-resize`,
                        }}
                      />
                    ))}
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
      <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-lg px-1 py-0.5 border border-border" style={{ background: "var(--bg-elevated)" }}>
        <Button variant="ghost" size="sm" isIconOnly onPress={() => setZoom((z) => clamp(z * 0.8, 0.1, 5))} aria-label="Zoom out"><span className="text-t13">−</span></Button>
        <Button variant="ghost" size="sm" onPress={() => fit()} className="text-t11! tabular-nums px-1.5! min-w-[42px]">{Math.round(zoom * 100)}%</Button>
        <Button variant="ghost" size="sm" isIconOnly onPress={() => setZoom((z) => clamp(z * 1.25, 0.1, 5))} aria-label="Zoom in"><span className="text-t13">+</span></Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button variant="ghost" size="sm" isIconOnly onPress={() => fit()} aria-label="Fit"><ArrowsOut size={14} /></Button>
      </div>

      {/* ── Floating element toolbar (Figma-style, bottom-center) ─────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-2xl px-2.5 py-1.5 border border-border shadow-xl" style={{ background: "var(--bg-elevated)" }}>
        {/* Select / cursor */}
        <Button variant="ghost" size="md" isIconOnly onPress={() => setTool(null)} aria-label={t("ovlSelect") || "Select"} className={`w-10! h-10! ${!tool ? "bg-accent! text-white!" : ""}`}>
          <CursorArrow size={15} />
        </Button>
        <div className="w-px h-6 bg-border mx-0.5" />
        {/* Shape group with variant dropdown */}
        <div className="relative flex items-center">
          <Button variant="ghost" size="md" isIconOnly onPress={() => setTool({ type: "shape", shape: "rect" })} aria-label={TYPE_META.shape.label} className={`w-10! h-10! ${tool?.type === "shape" ? "bg-accent! text-white!" : ""}`}><PaintBrushBroad size={16} /></Button>
          <button type="button" onClick={() => setShapeMenu((o) => !o)} aria-label={t("ovlShape")}
            className="w-4 h-9 flex items-center justify-center text-muted hover:text-primary rounded transition-colors" style={{ background: "none", border: "none" }}>
            <CaretDown size={11} />
          </button>
          {shapeMenu && (<>
            <div className="fixed inset-0 z-[60]" onClick={() => setShapeMenu(false)} />
            <div className="absolute bottom-full left-0 mb-2 z-[61] w-44 rounded-lg shadow-xl border border-border p-1" style={{ background: "var(--bg-elevated)" }}>
              {["rect", "ellipse", "line", "triangle", "polygon", "star"].map((v) => (
                <button key={v} type="button" onClick={() => { setTool({ type: "shape", shape: v }); setShapeMenu(false); }}
                  className="flex items-center w-full text-left px-3 py-2 rounded text-t13 text-primary hover:bg-[var(--bg-hover)] transition-colors" style={{ background: "none", border: "none" }}>
                  {t("ovlShape_" + v)}
                </button>
              ))}
            </div>
          </>)}
        </div>
        <div className="w-px h-6 bg-border mx-0.5" />
        <Button variant="ghost" size="md" isIconOnly onPress={() => setTool({ type: "text" })} aria-label={TYPE_META.text.label} className={`w-10! h-10! ${tool?.type === "text" ? "bg-accent! text-white!" : ""}`}><TextSize size={16} /></Button>
        <Button variant="ghost" size="md" isIconOnly onPress={() => setTool({ type: "albumArt" })} aria-label={TYPE_META.albumArt.label} className={`w-10! h-10! ${tool?.type === "albumArt" ? "bg-accent! text-white!" : ""}`}><VinylRecord size={16} /></Button>
        <Button variant="ghost" size="md" isIconOnly onPress={() => setTool({ type: "progress" })} aria-label={TYPE_META.progress.label} className={`w-10! h-10! ${tool?.type === "progress" ? "bg-accent! text-white!" : ""}`}><WaveformLines size={16} /></Button>
        <Button variant="ghost" size="md" isIconOnly onPress={() => setTool({ type: "image" })} aria-label={TYPE_META.image.label} className={`w-10! h-10! ${tool?.type === "image" ? "bg-accent! text-white!" : ""}`}><ImageSquare size={16} /></Button>
      </div>

      </div>{/* end canvas viewport */}

      {/* ── Right: inspector (docked) ──────────────────────────────────────────── */}
      <div className="w-[248px] shrink-0 flex flex-col border-l border-border">
        <div className="overflow-y-auto flex-1 min-h-0 p-3">
          {!selected ? (
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
                  <ArrowsOut size={13} />
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
                <SelectField value={doc.canvas.corners?.typeTL || "r"} options={CORNER_OPTS(t)}
                  onChange={(v) => updateCanvas({ corners: { ...(doc.canvas.corners ?? uniformCorners(0, "r")), typeTL: v, typeTR: v, typeBR: v, typeBL: v } })} />
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
                  <Button variant="ghost" size="sm" isIconOnly onPress={() => deleteLayer(selected.id)} aria-label={t("ovlMenuDelete")} className="shrink-0 text-[#ff7070]!"><Trash size={14} /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Segmented value={null} onChange={(w) => alignSelected("x", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.hL, aria: t("ovlLeft") }, { value: "center", icon: ALIGN_GLYPH.hC, aria: t("ovlCenter") }, { value: "end", icon: ALIGN_GLYPH.hR, aria: t("ovlRight") },
                  ]} />
                  <Segmented value={null} onChange={(w) => alignSelected("y", w)} options={[
                    { value: "start", icon: ALIGN_GLYPH.vT, aria: t("ovlTop") }, { value: "center", icon: ALIGN_GLYPH.vM, aria: t("ovlMiddle") }, { value: "end", icon: ALIGN_GLYPH.vB, aria: t("ovlBottom") },
                  ]} />
                </div>
              </div>

              <Section title={t("ovlPosition")}>
                <div className="grid grid-cols-2 gap-2">
                  <PillNum prefix="X" value={selected.x} onChange={(v) => setLayer(selected.id, { x: v })} />
                  <PillNum prefix="Y" value={selected.y} onChange={(v) => setLayer(selected.id, { y: v })} />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <PillNum prefix="∠" value={selected.rotation} min={-360} max={360} onChange={(v) => setLayer(selected.id, { rotation: v })} />
                  <IconBtnRow actions={[
                    { icon: <ArrowClockwise size={13} />, onAction: rotate90, aria: t("ovlRotation") + " 90°" },
                    { icon: FLIP_H, onAction: () => setLayer(selected.id, { flipH: !selected.flipH }), aria: t("ovlFlipH") || "Flip horizontal", active: !!selected.flipH },
                    { icon: FLIP_V, onAction: () => setLayer(selected.id, { flipV: !selected.flipV }), aria: t("ovlFlipV") || "Flip vertical", active: !!selected.flipV },
                  ]} />
                </div>
              </Section>

              <Section title={t("ovlLayout")}>
                <div className="grid grid-cols-2 gap-2">
                  <PillNum prefix="W" value={selected.w} min={1} onChange={(v) => setLayer(selected.id, aspectLock ? { w: v, h: Math.max(1, Math.round(v / ratio)) } : { w: v })} />
                  <PillNum prefix="H" value={selected.h} min={1} onChange={(v) => setLayer(selected.id, aspectLock ? { h: v, w: Math.max(1, Math.round(v * ratio)) } : { h: v })} />
                </div>
                <button type="button" onClick={() => setAspectLock((a) => !a)}
                  className={`flex items-center justify-center gap-1.5 h-8 rounded-md border text-t12 transition-colors ${aspectLock ? "text-white border-transparent" : "border-border text-secondary hover:bg-[var(--bg-hover)]"}`}
                  style={{ background: aspectLock ? "var(--accent)" : "var(--surface-2)" }}>
                  {aspectLock ? <Lock size={12} /> : <LockOpen size={12} />}{t("ovlLockAspect") || "Lock aspect ratio"}
                </button>
              </Section>

              <Section title={t("ovlAppearance") || "Appearance"}>
                <PillNum prefix="O" value={selected.opacity} min={0} max={100} onChange={(v) => setLayer(selected.id, { opacity: v })} />
                <SelectField label={t("ovlBlend") || "Blend"} value={selected.blend || "normal"} options={BLEND_OPTS()} onChange={(v) => setLayer(selected.id, { blend: v })} />
              </Section>
              {hasCorners && (
              <Section title={t("ovlCorners")} right={
                <Button variant="ghost" size="sm" isIconOnly
                  aria-label={t("ovlCornersIndividual") || "Individual corners"}
                  onPress={() => setLayerCornersInd((v) => !v)}
                  className={layerCornersInd ? "text-accent!" : ""}>
                  <ArrowsOut size={13} />
                </Button>}>
                {!layerCornersInd ? (
                  <PillNum prefix={t("ovlRadius")} value={sc?.TL ?? 0} min={0} max={400}
                    onChange={(v) => setStyle(selected.id, { corners: uniformCorners(v, cornerType) })} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <PillNum prefix="TL" value={sc?.TL ?? 0} min={0} max={400} onChange={(v) => setCorner("TL", v)} />
                    <PillNum prefix="TR" value={sc?.TR ?? 0} min={0} max={400} onChange={(v) => setCorner("TR", v)} />
                    <PillNum prefix="BL" value={sc?.BL ?? 0} min={0} max={400} onChange={(v) => setCorner("BL", v)} />
                    <PillNum prefix="BR" value={sc?.BR ?? 0} min={0} max={400} onChange={(v) => setCorner("BR", v)} />
                  </div>
                )}
                <Segmented value={cornerType} onChange={setCornersType} options={[{ value: "r", label: t("ovlRound") }, { value: "b", label: t("ovlBevel") }]} />
              </Section>
              )}

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

          {/* Output (always visible) */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-t11 font-semibold text-muted uppercase tracking-wide mb-1.5 px-0.5">OBS</div>
            <div className="flex flex-col gap-1.5">
              <SwitchField label={t("overlayEnable")} checked={obsEnabled} onChange={toggleObs} />
              <label className="flex items-center justify-between gap-2">
                <span className="text-t12 text-muted shrink-0">{t("overlayPort")}</span>
                <div className="flex items-center gap-1.5">
                  <input type="text" value={obsPortInput} onChange={(e) => setObsPortInput(e.target.value.replace(/[^0-9]/g, ""))}
                    className="w-[64px] rounded-md px-2 py-1 text-t12 text-primary outline-none border border-border focus:border-accent" style={{ background: "var(--surface-2)" }} />
                  <Button variant="secondary" size="sm" onPress={() => onPortSave?.()}>{t("save")}</Button>
                </div>
              </label>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="flex-1 min-w-0 text-t11 text-muted truncate" style={{ fontFamily: "var(--font)" }}>{overlayUrl}</code>
                <Button variant="ghost" size="sm" isIconOnly onPress={copyUrl} aria-label={t("overlayUrl")}>{copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
        return (
          <div
            className="fixed inset-0 z-50"
            onClick={closePicker}
          >
            <div
              className="absolute right-[264px] top-16 w-56 rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden"
              style={{ background: "var(--bg-elevated)", maxHeight: "68vh" }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Escape") closePicker(); }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
                <span className="text-t13 font-semibold text-primary">{t("ovlFont")}</span>
                <button type="button" onClick={closePicker} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <X size={13} className="text-muted" />
                </button>
              </div>

              {/* Search */}
              <div className="px-2 pt-2 shrink-0">
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 border border-border" style={{ background: "rgba(255,255,255,0.07)" }}>
                  <MagnifyingGlass size={12} className="text-muted shrink-0" />
                  <input
                    autoFocus
                    value={fontPickerSearch}
                    onChange={(e) => setFontPickerSearch(e.target.value)}
                    placeholder={t("ovlFontSearch")}
                    className="flex-1 min-w-0 bg-transparent text-t12 text-primary outline-none placeholder:text-muted"
                  />
                  {fontPickerSearch && (
                    <button type="button" onClick={() => setFontPickerSearch("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}>
                      <X size={11} className="text-muted" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="px-2 pt-1.5 pb-2 shrink-0">
                <select
                  value={fontPickerCategory}
                  onChange={(e) => setFontPickerCategory(e.target.value)}
                  className="w-full rounded-lg px-2 py-1.5 text-t12 text-primary border border-border outline-none cursor-pointer"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <option value="all">{t("ovlFontAll")}</option>
                  <option value="google">{t("ovlFontGoogle")}</option>
                  <option value="system">{t("ovlFontSystem")}</option>
                  <option value="local">{t("ovlFontLocal")}{localFonts === null ? " …" : localFontItems.length > 0 ? ` (${localFontItems.length})` : ""}</option>
                </select>
              </div>

              {/* Font list */}
              <div className="overflow-y-auto flex-1 min-h-0 px-1 pb-2">
                {fontPickerCategory === "local" && localFonts === null ? (
                  <div className="text-t11 text-muted text-center py-4">{t("ovlFontLocalLoading")}</div>
                ) : filtered.length === 0 ? (
                  <div className="text-t11 text-muted text-center py-4">{t("ovlFontNoResults")}</div>
                ) : filtered.map((f) => (
                  <div
                    key={f.value}
                    onClick={() => { setStyle(selected.id, { fontFamily: f.value }); closePicker(); }}
                    className={[
                      "px-3 py-1.5 rounded-lg cursor-pointer leading-snug transition-colors",
                      f.value === currentValue
                        ? "text-accent bg-accent-dim"
                        : "text-primary hover:bg-[var(--bg-hover)]",
                    ].join(" ")}
                    style={{ fontFamily: f.value, fontSize: "15px" }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Widget Browser modal ──────────────────────────────────────────────── */}
      {browserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
          onKeyDown={(e) => { if (e.key === "Escape") setBrowserOpen(false); }}
          onClick={(e) => { if (e.target === e.currentTarget) setBrowserOpen(false); }}>
          <div className="w-[720px] max-h-[82vh] flex flex-col rounded-2xl shadow-2xl border border-border overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <Swatches size={16} className="text-accent" />
                <span className="text-t14 font-semibold text-primary">{t("ovlProfileBrowse")}</span>
                {profiles.length > 0 && (
                  <span className="text-t11 text-muted">({profiles.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input ref={importFileRef} type="file" accept=".json" multiple className="hidden" onChange={handleImportFiles} />
                <Button variant="flat" size="sm" className="gap-1.5 text-t12!" onPress={() => importFileRef.current?.click()}>
                  <UploadSimple size={13} /> {t("ovlProfileImport")}
                </Button>
                <Button variant="ghost" size="sm" isIconOnly onPress={() => setBrowserOpen(false)} aria-label="Close">
                  <X size={14} />
                </Button>
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
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {profiles.map((prof) => {
                    const layerCount = prof.doc?.layers?.length ?? 0;
                    const cw = prof.doc?.canvas?.width ?? "?";
                    const ch = prof.doc?.canvas?.height ?? "?";
                    const date = prof.savedAt ? new Date(prof.savedAt).toLocaleDateString() : "";
                    return (
                      <div key={prof.id} className="flex flex-col rounded-xl border border-border overflow-hidden hover:border-accent/60 transition-colors"
                        style={{ background: "color-mix(in srgb, var(--bg-elevated) 85%, var(--bg-base))" }}>
                        {/* Preview placeholder */}
                        <div className="h-24 flex flex-col items-center justify-center gap-1.5 border-b border-border"
                          style={{ background: "color-mix(in srgb, var(--bg-base) 80%, transparent)" }}>
                          <Swatches size={24} className="text-accent opacity-50" />
                          <span className="text-t10 text-muted tabular-nums">{cw} × {ch}</span>
                        </div>
                        {/* Info */}
                        <div className="px-2.5 pt-2 pb-1">
                          <div className="text-t12 font-medium text-primary truncate">{prof.name}</div>
                          <div className="text-t10 text-muted mt-0.5">
                            {layerCount} {t("ovlLayers").toLowerCase()} · {date}
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                          <Button variant="flat" color="primary" size="sm" className="flex-1 text-t11!" onPress={() => applyProfile(prof)}>
                            {t("ovlProfileApply")}
                          </Button>
                          <Button variant="ghost" size="sm" isIconOnly className="h-7! w-7! min-w-0!" onPress={() => exportProfile(prof)} aria-label={t("ovlProfileExport")}>
                            <DownloadSimple size={13} />
                          </Button>
                          <Button variant="ghost" size="sm" isIconOnly className="h-7! w-7! min-w-0! text-danger!" onPress={() => deleteProfile(prof.id)} aria-label={t("ovlProfileDelete")}>
                            <Trash size={13} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>{/* end canvas viewport */}

      {/* ── Menu bar dropdowns (fixed, outside canvas overflow) ──────────────── */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={closeMenu} />
          <div
            className="fixed z-[71] min-w-[210px] rounded-xl shadow-2xl border border-border flex flex-col py-1 overflow-hidden"
            style={{ left: menuOpen.x, top: menuOpen.y + 2, background: "var(--bg-elevated)" }}
            onKeyDown={(e) => { if (e.key === "Escape") closeMenu(); }}
          >
            {menuOpen.name === "main" && (<>
              <MenuItem icon={<Plus size={13} />} label={t("ovlMenuNew")} onAction={() => { commit(defaultOverlayDoc()); setSelectedId(null); closeMenu(); }} />
              <MenuSep />
              <MenuItem icon={<FloppyDisk size={13} />} label={t("ovlProfileSave")}  onAction={() => { setSaveOpen(true); setBrowserOpen(false); closeMenu(); }} />
              <MenuItem icon={<Swatches size={13} />}   label={t("ovlProfileBrowse")} onAction={() => { setBrowserOpen(true); setSaveOpen(false); closeMenu(); }} />
              <MenuSep />
              <MenuItem icon={<UploadSimple size={13} />}  label={t("ovlProfileImport")}  onAction={() => { importFileRef.current?.click(); closeMenu(); }} />
              <MenuItem icon={<DownloadSimple size={13} />} label={t("ovlMenuExportCurrent")} onAction={() => { exportProfile({ id: "current", name: t("ovlMenuExportCurrent"), doc, savedAt: new Date().toISOString() }); closeMenu(); }} />
              <MenuSep />
              <MenuItem icon={<ArrowsClockwise size={13} />} label={t("ovlReloadPreview")} onAction={() => { setIframeKey((k) => k + 1); closeMenu(); }} />
            </>)}
          </div>
        </>
      )}
    </div>
  );
}
