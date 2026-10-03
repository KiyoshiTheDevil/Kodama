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

// ─────────────────────────────────────────────────────────────────────────────
//  Single entries, as in Figma: click one fill, stroke, effect or the animation in the
//  inspector, Ctrl+C, select another element, Ctrl+V.
// ─────────────────────────────────────────────────────────────────────────────
const freshId = (p) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const ITEM_LIST = { fill: "fills", stroke: "strokes", effect: "effects" };

/** The entry `sel` ({ kind: "fill" | "stroke" | "effect" | "animation", index }) of a layer or group. */
export function copyItem(doc, ids, sel) {
  if (!sel || !ids.length) return null;
  const g = ids.length > 1 ? selectedGroup(doc, ids) : null;
  if (g) return sel.kind === "animation" ? { kind: "animation", anim: animOf(g.fx) } : null;
  const l = ids.length === 1 ? doc.layers.find((x) => x.id === ids[0]) : null;
  if (!l) return null;
  const s = l.style || {};
  if (sel.kind === "fill" && s.fills?.[sel.index]) return { kind: "fill", paint: clone(s.fills[sel.index]) };
  if (sel.kind === "stroke" && s.strokes?.[sel.index]) {
    return { kind: "stroke", paint: clone(s.strokes[sel.index]), weight: s.strokeWeight, position: s.strokePosition };
  }
  if (sel.kind === "effect" && s.effects?.[sel.index]) return { kind: "effect", effect: clone(s.effects[sel.index]) };
  if (sel.kind === "animation") return { kind: "animation", anim: animOf(s.fx) };
  return null;
}

/** Insert at `at` (or replace there when `replace`). */
function put(list, item, at, replace) {
  const next = Array.isArray(list) ? [...list] : [];
  if (replace && at != null && at < next.length) next[at] = item;
  else next.splice(at == null ? next.length : at, 0, item);
  return next;
}

const withAnim = (fx, anim) => {
  const out = { ...(fx || {}) };
  for (const k of ANIM_KEYS) { if (anim[k]) out[k] = clone(anim[k]); else delete out[k]; }
  return out;
};

function itemOntoLayer(l, item, target) {
  const st = { ...(l.style || {}) };
  const same = !!target && target.kind === item.kind;
  if (item.kind === "fill") {
    if (supports(l.type, "fills")) {
      st.fills = put(st.fills, { ...clone(item.paint), id: freshId("fill") }, same ? target.index : 0, same);
      if (l.type === "text" && st.fills[0]?.color) st.color = st.fills[0].color;
    } else if (l.type === "progress") {
      st.fillColor = item.paint.color;
      st.fillOpacity = item.paint.opacity ?? 100;
    } else return l;
  } else if (item.kind === "stroke") {
    if (!supports(l.type, "strokes")) return l;
    const had = Array.isArray(st.strokes) && st.strokes.length > 0;
    st.strokes = put(st.strokes, { ...clone(item.paint), id: freshId("stroke") }, same ? target.index : 0, same);
    // A first stroke brings its weight and position along; otherwise it would land at whatever
    // the layer happened to default to and not look like the one that was copied.
    if (!had) {
      if (item.weight != null) st.strokeWeight = item.weight;
      if (item.position) st.strokePosition = item.position;
    }
  } else if (item.kind === "effect") {
    st.effects = put(st.effects, { ...clone(item.effect), id: freshId("fx") }, same ? target.index : null, same);
  } else if (item.kind === "animation") {
    st.fx = withAnim(st.fx, item.anim);
  } else return l;
  return { ...l, style: st };
}

/**
 * Paste a copied entry onto the selection. `target` is the entry selected in the inspector of
 * the element being pasted onto: one of the same kind is replaced, otherwise the entry is added
 * (fills and strokes on top, effects at the end). A whole group takes an animation itself and
 * hands paints and effects to its layers.
 */
export function pasteItem(doc, ids, item, target = null) {
  if (!item || !ids.length) return doc;
  const g = ids.length > 1 ? selectedGroup(doc, ids) : null;
  if (g && item.kind === "animation") {
    return { ...doc, groups: (doc.groups || []).map((x) => (x.id === g.id ? { ...x, fx: withAnim(x.fx, item.anim) } : x)) };
  }
  const layerIds = g ? membersOf(doc, g.id).map((l) => l.id) : ids;
  const single = !g && ids.length === 1;
  return {
    ...doc,
    layers: doc.layers.map((l) => (layerIds.includes(l.id) && !l.locked ? itemOntoLayer(l, item, single ? target : null) : l)),
  };
}

/** Remove the selected entry from the selected layer (or a group's animation). */
export function removeItem(doc, ids, sel) {
  if (!sel || !ids.length) return doc;
  const g = ids.length > 1 ? selectedGroup(doc, ids) : null;
  if (g) {
    if (sel.kind !== "animation") return doc;
    return { ...doc, groups: (doc.groups || []).map((x) => (x.id === g.id ? { ...x, fx: withAnim(x.fx, {}) } : x)) };
  }
  if (ids.length !== 1) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (l.id !== ids[0] || l.locked) return l;
      const st = { ...(l.style || {}) };
      const key = ITEM_LIST[sel.kind];
      if (key) st[key] = (st[key] || []).filter((_, i) => i !== sel.index);
      else if (sel.kind === "animation") st.fx = withAnim(st.fx, {});
      return { ...l, style: st };
    }),
  };
}
