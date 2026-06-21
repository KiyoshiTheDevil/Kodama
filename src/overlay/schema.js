// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — Document Schema, Layer Factories & v1→v2 Migration
//
//  Phase 0 of the Overlay-Editor rebuild. PURE LOGIC, no React/DOM.
//  The old overlay used a flat `obsConfig` object (~40 keys) rendered by a fixed
//  HTML structure. The new editor uses a layer-based document (`overlayDoc` v2):
//  a canvas (= widget bounds = OBS source size) plus an ordered list of freely
//  positioned layers. A generic engine (Phase 1) renders this doc; the editor
//  (Phase 2+) manipulates it.
//
//  This module is the single source of truth for the data shape and is consumed
//  by both the React editor and (mirrored) the backend engine.
// ─────────────────────────────────────────────────────────────────────────────

export const OVERLAY_DOC_VERSION = 2;

// Bindable now-playing data fields a layer can subscribe to.
// `subtitle` is a composite (artist · album) that preserves the old sub-line.
export const TEXT_BINDS = ["title", "subtitle", "artist", "album", "position", "duration", "static"];
export const LAYER_TYPES = ["albumArt", "text", "progress", "image", "shape"];

let _idCounter = 0;
export function makeId(prefix = "l") {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${_idCounter.toString(36)}`;
}

// ── Paint helpers (Figma-style multi-fill) ───────────────────────────────────
// A solid paint: { id, type:"solid", color, opacity, visible }. Layers carry an
// ordered `style.fills` array (index 0 = front). The engine stacks them; the
// inspector edits them as a list. Legacy single `fill`/`color` is migrated below.
export function solidFill(color = "#ffffff", opacity = 100) {
  return { id: makeId("fill"), type: "solid", color, opacity, visible: true };
}

// A stroke paint. The stroke *weight* and *position* are shared per layer
// (`style.strokeWeight` / `style.strokePosition`), Figma-style; each paint carries
// its own colour + opacity + visibility.
export function strokePaint(color = "#ffffff", opacity = 100) {
  return { id: makeId("stroke"), color, opacity, visible: true };
}

// ── Corner helpers ────────────────────────────────────────────────────────────
// A corner object carries 4 radii + 4 types ("r" = round, "b" = bevel). This
// mirrors the existing per-corner SVG clip-path system (kept verbatim).
export function uniformCorners(radius = 14, type = "r") {
  return {
    TL: radius, TR: radius, BR: radius, BL: radius,
    typeTL: type, typeTR: type, typeBR: type, typeBL: type,
  };
}

// Pull a corner object out of a flat v1 config given key prefixes.
function cornersFromV1(cfg, rKeys, tKeys, fallback) {
  return {
    TL: cfg[rKeys[0]] ?? fallback, TR: cfg[rKeys[1]] ?? fallback,
    BR: cfg[rKeys[2]] ?? fallback, BL: cfg[rKeys[3]] ?? fallback,
    typeTL: cfg[tKeys[0]] || "r", typeTR: cfg[tKeys[1]] || "r",
    typeBR: cfg[tKeys[2]] || "r", typeBL: cfg[tKeys[3]] || "r",
  };
}

// ── Formatting (used by engine + inspector previews) ──────────────────────────
export function formatTime(sec) {
  if (!sec || sec < 0 || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Layer factories — each returns a fully-formed layer with sensible defaults.
//  Common transform fields: x, y, w, h (px, canvas-relative), rotation (deg),
//  opacity (0-100), z (paint order), visible, locked. `bind` ties the layer to
//  live data. `style` is type-specific. `effects` is an array (Phase 4).
// ─────────────────────────────────────────────────────────────────────────────

function baseLayer(type, over = {}) {
  return {
    id: makeId(type.slice(0, 3)),
    type,
    name: over.name || type,
    x: 0, y: 0, w: 100, h: 40,
    rotation: 0,
    flipH: false, flipV: false,
    blend: "normal",            // CSS mix-blend-mode
    opacity: 100,
    z: 0,
    visible: true,
    locked: false,
    bind: null,
    style: {},
    effects: [],
    ...over,
  };
}

export function makeAlbumArtLayer(over = {}) {
  return baseLayer("albumArt", {
    name: "Album Art",
    w: 56, h: 56,
    bind: "cover",
    style: {
      corners: uniformCorners(8, "r"),
      fit: "cover",
      border: { on: false, color: "#EEA8FF", width: 1.5, position: "inside", opacity: 100 },
      shadow: { on: false, strength: 0.35 },
      placeholderBg: "rgba(255,255,255,0.12)",
    },
    ...over,
  });
}

export function makeTextLayer(over = {}) {
  return baseLayer("text", {
    name: "Text",
    w: 220, h: 22,
    bind: "title",
    style: {
      content: "Text",            // used when bind === "static"
      parts: ["artist"],          // used when bind === "subtitle"
      fontFamily: "system-ui, sans-serif",
      fontSize: 14,
      fontWeight: 700,
      color: "#ffffff",
      fills: [solidFill("#ffffff", 100)],
      align: "left",              // left | center | right
      valign: "top",              // top | middle | bottom
      letterSpacing: 0,
      lineHeight: 1.3,
      maxLines: 1,
      marquee: false,
      marqueeSpeed: 80,
    },
    ...over,
  });
}

export function makeProgressLayer(over = {}) {
  return baseLayer("progress", {
    name: "Progress",
    w: 400, h: 3,
    bind: "progress",
    style: {
      fillColor: "#EEA8FF",
      fillOpacity: 100,
      trackColor: "rgba(255,255,255,0.12)",
      corners: uniformCorners(0, "r"),
      shape: "bar",               // bar | ring (ring = Phase 4)
    },
    ...over,
  });
}

export function makeImageLayer(over = {}) {
  return baseLayer("image", {
    name: "Image",
    w: 64, h: 64,
    style: {
      src: "",                    // data URL
      fit: "contain",
      corners: uniformCorners(0, "r"),
    },
    ...over,
  });
}

export function makeShapeLayer(over = {}) {
  return baseLayer("shape", {
    name: "Shape",
    w: 80, h: 80,
    style: {
      shape: "rect",              // rect | ellipse
      fill: "#EEA8FF",
      fillOpacity: 100,
      fills: [solidFill("#EEA8FF", 100)],
      corners: uniformCorners(8, "r"),
      strokes: [],
      strokeWeight: 1.5,
      strokePosition: "inside",   // inside | center | outside
      border: { on: false, color: "#ffffff", width: 1.5, position: "inside", opacity: 100 },
    },
    ...over,
  });
}

export const LAYER_FACTORIES = {
  albumArt: makeAlbumArtLayer,
  text: makeTextLayer,
  progress: makeProgressLayer,
  image: makeImageLayer,
  shape: makeShapeLayer,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Canvas defaults
// ─────────────────────────────────────────────────────────────────────────────
export function defaultCanvas(over = {}) {
  return {
    width: 400,
    height: 80,
    autoSize: false,             // "fit to content" (replaces old dynamicWidth)
    bg: { color: "#1a1a1a", opacity: 90, blurFromCover: false, blur: 10 },
    corners: uniformCorners(14, "r"),
    border: { on: false, color: "#EEA8FF", width: 1.5, glow: 0 },
    shadow: { on: false, strength: 0.35 },
    autoHide: false,
    // Theme defaults — new layers inherit these via the editor.
    theme: { fontFamily: "system-ui, sans-serif", textColor: "#ffffff", accentColor: "#EEA8FF" },
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  v1 → v2 migration
//  Produces a layer document that reproduces the old fixed layout
//  (album art left · title/subtitle column · progress bar at the bottom edge).
//  Positions are computed from the old padding/gap/size config so the migrated
//  default looks equivalent to the current overlay.
// ─────────────────────────────────────────────────────────────────────────────
export function migrateV1toV2(cfg = {}) {
  const padH = cfg.paddingH ?? 16;
  const padV = cfg.paddingV ?? 12;
  const gap = cfg.gap ?? 12;
  const artSize = cfg.artSize ?? 56;
  const showArt = cfg.showAlbumArt !== false;
  const showProgress = cfg.showProgress !== false;
  const progH = cfg.progressHeight ?? 3;
  const titleFS = cfg.titleFontSize ?? 14;
  const subFS = cfg.artistFontSize ?? 12;
  const textColor = cfg.textColor || "#ffffff";
  const accentColor = cfg.accentColor || "#EEA8FF";
  const fontFamily = cfg.fontFamily || "system-ui, sans-serif";

  const W = cfg.widgetWidth ?? 400;

  // Row content height drives the canvas height when not explicitly set.
  const titleLineH = Math.round(titleFS * 1.3);
  const subLineH = Math.round(subFS * 1.3);
  const textBlockH = titleLineH + 3 + subLineH;
  const rowH = Math.max(showArt ? artSize : 0, textBlockH);
  const H = cfg.widgetHeight && cfg.widgetHeight > 0
    ? cfg.widgetHeight
    : Math.round(padV * 2 + rowH);

  const contentX = padH + (showArt ? artSize + gap : 0);
  const contentW = Math.max(10, W - contentX - padH);
  const textY = Math.round((H - textBlockH) / 2);

  const canvas = defaultCanvas({
    width: W,
    height: H,
    autoSize: !!cfg.dynamicWidth,
    bg: {
      color: cfg.bgColor || "#1a1a1a",
      opacity: cfg.bgOpacity ?? 90,
      blurFromCover: !!cfg.bgBlurEnabled,
      blur: cfg.bgBlur ?? 10,
    },
    corners: cornersFromV1(
      cfg,
      ["radiusTL", "radiusTR", "radiusBR", "radiusBL"],
      ["cornerTypeTL", "cornerTypeTR", "cornerTypeBR", "cornerTypeBL"],
      cfg.borderRadius ?? 14,
    ),
    border: {
      on: !!cfg.border,
      color: cfg.borderColor || "#EEA8FF",
      width: cfg.borderWidth ?? 1.5,
      glow: cfg.borderBlur ?? 0,
    },
    shadow: { on: !!cfg.showShadow, strength: cfg.shadowStrength ?? 0.35 },
    autoHide: !!cfg.autoHide,
    theme: { fontFamily, textColor, accentColor },
  });

  const layers = [];
  let z = 0;

  if (showArt) {
    layers.push(makeAlbumArtLayer({
      x: padH,
      y: Math.round((H - artSize) / 2),
      w: artSize, h: artSize,
      z: z++,
      style: {
        corners: cornersFromV1(
          cfg,
          ["artRadiusTL", "artRadiusTR", "artRadiusBR", "artRadiusBL"],
          ["artCornerTypeTL", "artCornerTypeTR", "artCornerTypeBR", "artCornerTypeBL"],
          cfg.artRadius ?? 8,
        ),
        fit: "cover",
        border: { on: false, color: "#EEA8FF", width: 1.5 },
        shadow: { on: false, strength: 0.35 },
        placeholderBg: "rgba(255,255,255,0.12)",
      },
    }));
  }

  // Title
  layers.push(makeTextLayer({
    name: "Title",
    x: contentX, y: textY, w: contentW, h: titleLineH,
    z: z++,
    bind: "title",
    style: {
      content: "", parts: [],
      fontFamily, fontSize: titleFS, fontWeight: 700,
      color: textColor, align: "left", valign: "top",
      letterSpacing: 0, lineHeight: 1.3, maxLines: 1,
      marquee: !!cfg.scrollTitle, marqueeSpeed: cfg.scrollSpeed ?? 80,
    },
  }));

  // Subtitle (artist · album) — opacity 65 mirrors the old --wtxts rgba(.65).
  const parts = [];
  if (cfg.showArtist !== false) parts.push("artist");
  if (cfg.showAlbum) parts.push("album");
  layers.push(makeTextLayer({
    name: "Subtitle",
    x: contentX, y: textY + titleLineH + 3, w: contentW, h: subLineH,
    z: z++,
    opacity: 65,
    bind: "subtitle",
    style: {
      content: "", parts,
      fontFamily, fontSize: subFS, fontWeight: 400,
      color: textColor, align: "left", valign: "top",
      letterSpacing: 0, lineHeight: 1.3, maxLines: 1,
      marquee: false, marqueeSpeed: 80,
    },
  }));

  if (showProgress) {
    layers.push(makeProgressLayer({
      x: 0, y: H - progH, w: W, h: progH,
      z: z++,
      style: {
        fillColor: accentColor,
        trackColor: "rgba(255,255,255,0.12)",
        corners: uniformCorners(0, "r"),
        shape: "bar",
      },
    }));
  }

  return { version: OVERLAY_DOC_VERSION, canvas, layers };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Default v2 document (= migration of the canonical v1 default).
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_V1_CONFIG = {
  bgColor: "#1a1a1a", bgOpacity: 90,
  accentColor: "#EEA8FF", textColor: "#ffffff",
  borderRadius: 14,
  showProgress: true, showAlbumArt: true, showArtist: true, showAlbum: false,
  border: false, borderColor: "#EEA8FF", borderWidth: 1.5,
  fontFamily: "system-ui, sans-serif",
  titleFontSize: 14, artistFontSize: 12,
  dynamicWidth: false, widgetWidth: 400, widgetHeight: 0, artSize: 56, artRadius: 8,
  paddingV: 12, paddingH: 16, gap: 12,
  progressHeight: 3,
  showShadow: false, shadowStrength: 0.35,
  bgBlur: 10, bgBlurEnabled: false,
  autoHide: false,
  scrollTitle: false, scrollSpeed: 80,
};

export function defaultOverlayDoc() {
  return migrateV1toV2(DEFAULT_V1_CONFIG);
}

// ── v2 Presets (derived from the old presets via migration → DRY) ─────────────
const _V1_PRESETS = {
  basic:   { bgColor: "#1a1a1a", bgOpacity: 90, accentColor: "#ffffff", textColor: "#ffffff", borderRadius: 14, border: false },
  pink:    { bgColor: "#e0527a", bgOpacity: 95, accentColor: "#ffffff", textColor: "#ffffff", borderRadius: 22, border: false },
  outline: { bgColor: "#000000", bgOpacity: 0, accentColor: "#EEA8FF", textColor: "#ffffff", borderRadius: 16, border: true, borderColor: "#EEA8FF" },
  dark:    { bgColor: "#0d0d0d", bgOpacity: 85, accentColor: "#EEA8FF", textColor: "#ffffff", borderRadius: 10, border: false },
  minimal: { bgColor: "#000000", bgOpacity: 0, accentColor: "#ffffff", textColor: "#ffffff", borderRadius: 0, border: false, showProgress: false, showAlbumArt: false },
};

export function buildPresetDoc(presetId) {
  const p = _V1_PRESETS[presetId];
  if (!p) return defaultOverlayDoc();
  return migrateV1toV2({ ...DEFAULT_V1_CONFIG, ...p });
}

export const OVERLAY_PRESET_IDS = Object.keys(_V1_PRESETS);

// ─────────────────────────────────────────────────────────────────────────────
//  Guards & normalization
// ─────────────────────────────────────────────────────────────────────────────
export function isV2Doc(obj) {
  return !!obj && typeof obj === "object" && obj.version === OVERLAY_DOC_VERSION
    && Array.isArray(obj.layers) && !!obj.canvas;
}

// Coerce any stored value (v1 flat config OR v2 doc OR junk) into a valid v2 doc.
// Ensure a layer's style carries the new array-based paints/effects (fills/strokes/
// effects), migrated from the legacy single fill/color/border/fx, so the Figma-style
// lists always populate.
function migrateLayer(l) {
  if (!l) return l;
  const s = l.style || {};
  let next = s;
  if ((l.type === "shape" || l.type === "text") && !Array.isArray(next.fills)) {
    const color = l.type === "text" ? next.color : next.fill;
    if (color != null) next = { ...next, fills: [solidFill(color, next.fillOpacity ?? 100)] };
  }
  if (l.type === "shape" && !Array.isArray(next.strokes)) {
    const b = next.border || {};
    next = {
      ...next,
      strokes: b.on ? [strokePaint(b.color || "#ffffff", b.opacity ?? 100)] : [],
      strokeWeight: next.strokeWeight ?? b.width ?? 1.5,
      strokePosition: next.strokePosition ?? b.position ?? "inside",
    };
  }
  if (!Array.isArray(next.effects) && next.fx) {
    const fx = next.fx, eff = [];
    if (fx.shadow && fx.shadow.on) eff.push({ id: makeId("fx"), type: "shadow", visible: true, color: fx.shadow.color ?? "#000000", x: fx.shadow.x ?? 0, y: fx.shadow.y ?? 2, blur: fx.shadow.blur ?? 8, opacity: Math.round((fx.shadow.opacity ?? 0.5) * 100) });
    if (fx.glow && fx.glow.on) eff.push({ id: makeId("fx"), type: "glow", visible: true, color: fx.glow.color ?? "#ffffff", blur: fx.glow.blur ?? 10 });
    if (fx.blur && fx.blur.on) eff.push({ id: makeId("fx"), type: "blur", visible: true, amount: fx.blur.amount ?? 4 });
    next = { ...next, effects: eff };
  }
  return next === s ? l : { ...l, style: next };
}

export function normalizeOverlayDoc(stored) {
  if (isV2Doc(stored)) {
    // Backfill canvas defaults + per-layer fill migration for forward-compat.
    return {
      ...stored,
      canvas: { ...defaultCanvas(), ...stored.canvas },
      layers: (stored.layers || []).map(migrateLayer),
    };
  }
  if (stored && typeof stored === "object") {
    // Looks like a v1 flat config → migrate.
    return migrateV1toV2(stored);
  }
  return defaultOverlayDoc();
}
