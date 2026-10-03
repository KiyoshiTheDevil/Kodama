// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — the element library. PURE LOGIC apart from the storage helpers.
//
//  An element is a piece of a design kept for reuse: some layers, the groups among them, and
//  their size. Positions are stored relative to the element's own top-left corner, so it can be
//  dropped anywhere. Placing one makes fresh copies; the library entry is never linked to what
//  was placed (no components, on purpose: a change to one copy must not travel to the others).
// ─────────────────────────────────────────────────────────────────────────────
import { makeId } from "./schema.js";
import { groupsOf, membersOf, chainOf, boundsOf, tidyGroups } from "./groups.js";

const KEY = "kiyoshi-overlay-elements";
const clone = (v) => JSON.parse(JSON.stringify(v));

export function readElements() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
export function writeElements(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/**
 * The selected layers as an element. A group comes along when all of it is selected; a layer
 * from a group that is only partly selected moves up to the nearest group that did come along.
 */
export function makeElement(doc, ids, name) {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (!picked.length) return null;
  const keep = new Set(groupsOf(doc)
    .filter((g) => { const m = membersOf(doc, g.id); return m.length > 0 && m.every((l) => ids.includes(l.id)); })
    .map((g) => g.id));
  const nearestKept = (gid) => {
    const chain = chainOf(doc, { group: gid });
    for (let i = chain.length - 1; i >= 0; i--) if (keep.has(chain[i])) return chain[i];
    return null;
  };
  const box = boundsOf(picked);
  const layers = picked.map((l) => {
    const c = clone(l);
    c.x = (l.x || 0) - box.x;
    c.y = (l.y || 0) - box.y;
    const g = l.group ? nearestKept(l.group) : null;
    if (g) c.group = g; else delete c.group;
    return c;
  });
  const groups = groupsOf(doc).filter((g) => keep.has(g.id)).map((g) => {
    const c = clone(g);
    delete c.collapsed;
    const p = g.parent ? nearestKept(g.parent) : null;
    if (p) c.parent = p; else delete c.parent;
    return c;
  });
  return {
    id: makeId("el"),
    name: name || "Element",
    savedAt: new Date().toISOString(),
    w: Math.round(box.w), h: Math.round(box.h),
    layers, groups,
  };
}

/**
 * Put a copy of the element into the document, centred on `at` (canvas coordinates). Fresh ids
 * throughout, on top of everything. An element of several loose parts arrives as one group
 * named after it, so it can be moved as the one thing it was saved as.
 */
export function placeElement(doc, el, at, makeLayerId) {
  const gmap = new Map((el.groups || []).map((g) => [g.id, makeId("g")]));
  const dx = Math.round((at?.x ?? doc.canvas.width / 2) - el.w / 2);
  const dy = Math.round((at?.y ?? doc.canvas.height / 2) - el.h / 2);
  const topZ = doc.layers.reduce((m, l) => Math.max(m, l.z || 0), -1);
  const ordered = [...el.layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const layers = ordered.map((l, i) => {
    const c = clone(l);
    c.id = makeLayerId();
    c.x = (l.x || 0) + dx; c.y = (l.y || 0) + dy; c.z = topZ + 1 + i;
    if (l.group && gmap.has(l.group)) c.group = gmap.get(l.group); else delete c.group;
    return c;
  });
  let groups = (el.groups || []).map((g) => {
    const c = { ...clone(g), id: gmap.get(g.id) };
    if (g.parent && gmap.has(g.parent)) c.parent = gmap.get(g.parent); else delete c.parent;
    return c;
  });
  // The top level of the element: loose layers and outermost groups.
  const topLayers = layers.filter((l) => !l.group);
  const topGroups = groups.filter((g) => !g.parent);
  if (topLayers.length + topGroups.length > 1) {
    const wrap = { id: makeId("g"), name: el.name || "Element" };
    for (const l of topLayers) l.group = wrap.id;
    groups = groups.map((g) => (g.parent ? g : { ...g, parent: wrap.id }));
    groups.push(wrap);
  }
  const next = tidyGroups({ ...doc, layers: [...doc.layers, ...layers], groups: [...groupsOf(doc), ...groups] });
  return { doc: next, ids: layers.map((l) => l.id) };
}
