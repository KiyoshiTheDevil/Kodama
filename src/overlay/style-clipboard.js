// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — copy and paste properties ("Copy properties" in Figma). PURE LOGIC.
//
//  Copied from one layer or one group: how it looks, not what it is. Pasted onto any number of
//  layers and groups, all of it or one part (colors, effects, animations). Each target takes what
//  its type can draw and skips the rest: a progress bar has no font, an image has no fill. A
//  group takes the animations itself and hands colors and effects to the layers inside it.
// ─────────────────────────────────────────────────────────────────────────────
import { LAYER_FACTORIES } from "./schema.js";
import { selectedGroup, membersOf } from "./groups.js";

const COLOR_KEYS = ["fills", "fill", "fillOpacity", "color", "fillColor", "trackColor", "strokes", "strokeWeight", "strokePosition", "border"];
const LOOK_KEYS = ["corners"];
const TEXT_KEYS = ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "align", "valign"];
const ANIM_KEYS = ["entrance", "loop"];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const supportCache = {};
/** The style keys a layer type has, plus the lists every type can carry. */
function supports(type, key) {
  if (key === "effects" || key === "fx") return true;
  if (!supportCache[type]) {
    const f = LAYER_FACTORIES[type];
    supportCache[type] = new Set(Object.keys((f && f().style) || {}));
  }
  return supportCache[type].has(key);
}
const animOf = (fx) => {
  const out = {};
  for (const k of ANIM_KEYS) if (fx?.[k]) out[k] = clone(fx[k]);
  return out;
};
const firstColor = (s) => (Array.isArray(s?.fills) && s.fills[0]?.color) || s?.fill || s?.color || null;

/** What can be copied from the selection: one layer or exactly one group. Null otherwise. */
export function copyProps(doc, ids) {
  const g = ids.length > 1 ? selectedGroup(doc, ids) : null;
  if (g) return { from: "group", anim: animOf(g.fx) };
  if (ids.length !== 1) return null;
  const l = doc.layers.find((x) => x.id === ids[0]);
  if (!l) return null;
  return { from: "layer", type: l.type, style: clone(l.style || {}), opacity: l.opacity, blend: l.blend, anim: animOf(l.style?.fx) };
}

function pasteOntoLayer(l, clip, what) {
  const src = clip.style || {};
  const st = { ...(l.style || {}) };
  const all = what === "all";
  const fromLayer = clip.from === "layer";
  let next = { ...l };

  if (fromLayer && (all || what === "colors")) {
    for (const k of COLOR_KEYS) if (k in src && supports(l.type, k)) st[k] = clone(src[k]);
    // The two colour models meet halfway: a fill becomes a progress bar's colour and back.
    if (l.type === "progress" && !("fillColor" in src) && firstColor(src)) st.fillColor = firstColor(src);
    if ((l.type === "shape" || l.type === "text") && !("fills" in src) && src.fillColor) {
      st.fills = [{ id: `fill_${Math.random().toString(36).slice(2, 9)}`, type: "solid", color: src.fillColor, opacity: src.fillOpacity ?? 100, visible: true }];
      if (l.type === "text") st.color = src.fillColor;
    }
  }
  if (fromLayer && (all || what === "effects")) {
    if ("effects" in src) st.effects = clone(src.effects);
    // Older designs keep shadow/glow/blur under fx, next to the animations.
    const legacy = { ...(src.fx || {}) };
    for (const k of ANIM_KEYS) delete legacy[k];
    const keep = animOf(st.fx);
    if (Object.keys(legacy).length || st.fx) st.fx = { ...clone(legacy), ...keep };
  }
  if (all || what === "animations") {
    const fx = { ...(st.fx || {}) };
    for (const k of ANIM_KEYS) { if (clip.anim[k]) fx[k] = clone(clip.anim[k]); else delete fx[k]; }
    st.fx = fx;
  }
  if (fromLayer && all) {
    for (const k of LOOK_KEYS) if (k in src && supports(l.type, k)) st[k] = clone(src[k]);
    if (clip.type === "text" && l.type === "text") for (const k of TEXT_KEYS) if (k in src) st[k] = src[k];
    if (clip.opacity != null) next.opacity = clip.opacity;
    if (clip.blend) next.blend = clip.blend;
  }
  next.style = st;
  return next;
}

/**
 * Paste onto the selection. `what` is "all", "colors", "effects" or "animations". A selection
 * that is one whole group is pasted onto that group; anything else onto its layers.
 */
export function pasteProps(doc, ids, clip, what = "all") {
  if (!clip || !ids.length) return doc;
  const g = ids.length > 1 ? selectedGroup(doc, ids) : null;
  let groups = doc.groups;
  let layerIds = ids;
  if (g) {
    if (what === "all" || what === "animations") {
      groups = (doc.groups || []).map((x) => {
        if (x.id !== g.id) return x;
        const fx = { ...(x.fx || {}) };
        for (const k of ANIM_KEYS) { if (clip.anim[k]) fx[k] = clone(clip.anim[k]); else delete fx[k]; }
        return { ...x, fx };
      });
    }
    // The group's layers keep their own animations; they get colors and effects only.
    if (what === "animations") return { ...doc, groups };
    layerIds = membersOf(doc, g.id).map((l) => l.id);
    if (what === "all") what = "look";
  }
  const layers = doc.layers.map((l) => {
    if (!layerIds.includes(l.id) || l.locked) return l;
    if (what === "look") {
      // colors and effects (and the layer's look), without touching its animations
      let n = pasteOntoLayer(l, clip, "colors");
      n = pasteOntoLayer(n, clip, "effects");
      return n;
    }
    return pasteOntoLayer(l, clip, what);
  });
  return { ...doc, groups, layers };
}
