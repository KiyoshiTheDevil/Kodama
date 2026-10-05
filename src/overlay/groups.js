// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — groups. PURE LOGIC, no React/DOM.
//
//  A group is a mark on its layers (`layer.group` = the innermost group) plus an entry in
//  `doc.groups` with its name, whether the layers panel shows it open, and the group it sits in
//  (`parent`). The layer list itself stays flat, and that is the point: the OBS renderer in the
//  backend sorts layers by z and draws them, and it keeps doing exactly that. A real container
//  would have meant a second renderer that understands nesting, in Python, for something that
//  is purely about editing.
//
//  The one rule the rest of this file exists to keep: everything inside a group is NEIGHBOURS in
//  the paint order, at every level. A group is one thing in the layers panel, so it has to be one
//  block in z, or the panel would show it in one place while it paints in two.
// ─────────────────────────────────────────────────────────────────────────────
import { makeId } from "./schema.js";

/** Layers top first, the order the layers panel lists them in. */
export const topFirst = (layers) => [...layers].sort((a, b) => (b.z || 0) - (a.z || 0));

export const groupsOf = (doc) => (Array.isArray(doc.groups) ? doc.groups : []);
export const findGroup = (doc, gid) => groupsOf(doc).find((g) => g.id === gid) || null;
const groupMap = (groups) => new Map(groups.map((g) => [g.id, g]));

/** The groups a layer sits in, outermost first. Stops at a loop rather than hanging on one. */
function chainWith(map, layer) {
  const out = [];
  const seen = new Set();
  let gid = layer?.group || null;
  while (gid && map.has(gid) && !seen.has(gid)) {
    seen.add(gid);
    out.unshift(gid);
    gid = map.get(gid).parent || null;
  }
  return out;
}
export const chainOf = (doc, layer) => chainWith(groupMap(groupsOf(doc)), layer);

/** Every layer inside the group, at any depth, top first. */
export function membersOf(doc, gid) {
  if (!gid) return [];
  const map = groupMap(groupsOf(doc));
  return topFirst(doc.layers.filter((l) => chainWith(map, l).includes(gid)));
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Rewrite z from an order (ids, top first). Leaves z alone when the order did not change. */
function withOrder(doc, order, patches = {}) {
  const before = topFirst(doc.layers).map((l) => l.id);
  const same = before.length === order.length && before.every((id, i) => id === order[i]);
  const n = order.length;
  const rank = new Map(order.map((id, i) => [id, n - 1 - i]));
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const p = patches[l.id];
      const z = same ? l.z : rank.get(l.id);
      if (!p && z === l.z) return l;
      const next = { ...l, ...(p || {}), z };
      if (next.group == null) delete next.group;
      return next;
    }),
  };
}

/** Walk the tree in paint order, top first. `visit(node, depth)`; return false to skip children. */
function walk(doc, visit) {
  const groups = groupsOf(doc);
  const map = groupMap(groups);
  const kids = new Map([[null, []]]);
  for (const g of groups) kids.set(g.id, []);
  for (const g of groups) kids.get(map.has(g.parent) ? g.parent : null).push({ kind: "group", gid: g.id });
  for (const l of doc.layers) kids.get(map.has(l.group) ? l.group : null).push({ kind: "layer", id: l.id, z: l.z || 0 });
  // A group sits where its topmost layer is.
  const top = new Map();
  const topOf = (node) => {
    if (node.kind === "layer") return node.z;
    if (top.has(node.gid)) return top.get(node.gid);
    top.set(node.gid, -Infinity); // loop guard
    const v = Math.max(-Infinity, ...kids.get(node.gid).map(topOf));
    top.set(node.gid, v);
    return v;
  };
  const go = (parent, depth) => {
    const list = [...kids.get(parent)].sort((a, b) => topOf(b) - topOf(a));
    for (const node of list) {
      const into = visit({ ...node, parent }, depth);
      if (node.kind === "group" && into !== false) go(node.gid, depth + 1);
    }
  };
  go(null, 0);
}

/**
 * Bring a document back in line after any change: everything inside a group is kept together at
 * the place of its topmost layer, a group with nothing in it goes, a group pointing at a parent
 * that does not exist moves to the top level, and a layer pointing at a group that does not exist
 * gets one, so a hand-edited or half-imported file cannot leave a layer marked with a name the
 * panel has nowhere to show.
 */
export function tidyGroups(doc) {
  const layers = doc.layers || [];
  let groups = groupsOf(doc);
  if (!groups.length && !layers.some((l) => l.group)) return doc;

  const known = new Set(groups.map((g) => g.id));
  const missing = [...new Set(layers.map((l) => l.group).filter((g) => g && !known.has(g)))];
  if (missing.length) groups = [...groups, ...missing.map((id, i) => ({ id, name: `Group ${groups.length + i + 1}` }))];

  // Parents that do not exist, and loops, go to the top level.
  let map = groupMap(groups);
  groups = groups.map((g) => {
    if (!g.parent) return g;
    let p = g.parent; const seen = new Set([g.id]);
    while (p && map.has(p) && !seen.has(p)) { seen.add(p); p = map.get(p).parent; }
    const broken = !map.has(g.parent) || (p && seen.has(p));
    if (!broken) return g;
    const { parent, ...rest } = g; // eslint-disable-line no-unused-vars
    return rest;
  });

  // A group survives while some layer is inside it at any depth.
  map = groupMap(groups);
  const used = new Set();
  for (const l of layers) for (const gid of chainWith(map, l)) used.add(gid);
  groups = groups.filter((g) => used.has(g.id));

  const next = { ...doc, groups };
  const order = [];
  walk(next, (node) => { if (node.kind === "layer") order.push(node.id); });
  return withOrder(next, order);
}

/** For a box selection: the ids plus everything else in the top-level groups they belong to. */
export function expandToGroups(doc, ids) {
  const map = groupMap(groupsOf(doc));
  const tops = new Set(doc.layers.filter((l) => ids.includes(l.id)).map((l) => chainWith(map, l)[0]).filter(Boolean));
  if (!tops.size) return ids;
  const out = new Set(ids);
  for (const l of doc.layers) { const c = chainWith(map, l); if (c.length && tops.has(c[0])) out.add(l.id); }
  return doc.layers.filter((l) => out.has(l.id)).map((l) => l.id);
}

/** The group the selection IS, exactly and completely (the deepest such one), or null. */
export function selectedGroup(doc, ids) {
  if (!ids.length) return null;
  const first = doc.layers.find((l) => l.id === ids[0]);
  if (!first) return null;
  const chain = chainOf(doc, first);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (sameSet(membersOf(doc, chain[i]).map((l) => l.id), ids)) return findGroup(doc, chain[i]);
  }
  return null;
}

/**
 * Where a click on a layer lands, as in Figma. Nothing selected inside a group: the outermost
 * group it is in. Something selected inside a group: the item one level below that group, so
 * clicking around stays at the depth that was entered.
 */
export function pickOnClick(doc, layerId, selectedIds) {
  const layer = doc.layers.find((l) => l.id === layerId);
  const chain = chainOf(doc, layer);
  if (!chain.length) return [layerId];
  // The level the selection lives at: the deepest group holding all of it, or that group's
  // parent when the selection IS that group.
  let ctx = null;
  if (selectedIds.length) {
    const chains = doc.layers.filter((l) => selectedIds.includes(l.id)).map((l) => chainOf(doc, l));
    let common = chains[0] || [];
    for (const c of chains) { let i = 0; while (i < common.length && common[i] === c[i]) i++; common = common.slice(0, i); }
    const sel = selectedGroup(doc, selectedIds);
    const at = sel ? common.indexOf(sel.id) : -1;
    if (at !== -1) common = common.slice(0, at);
    ctx = common.length ? common[common.length - 1] : null;
  }
  const idx = ctx ? chain.indexOf(ctx) : -1;
  if (ctx && idx === -1) return membersOf(doc, chain[0]).map((l) => l.id);
  const next = chain[idx + 1];
  return next ? membersOf(doc, next).map((l) => l.id) : [layerId];
}

/** A double-click goes one level deeper than what is selected, down to the layer itself. */
export function pickOnDoubleClick(doc, layerId, selectedIds) {
  const layer = doc.layers.find((l) => l.id === layerId);
  const chain = chainOf(doc, layer);
  let deepest = -1;
  chain.forEach((gid, i) => { if (sameSet(membersOf(doc, gid).map((l) => l.id), selectedIds)) deepest = i; });
  const next = deepest === -1 ? null : chain[deepest + 1];
  return next ? membersOf(doc, next).map((l) => l.id) : [layerId];
}

/** A name nobody in the document uses yet: "Group 1", "Group 2", ... */
export function nextGroupName(doc, base = "Group") {
  const taken = new Set(groupsOf(doc).map((g) => g.name));
  let n = groupsOf(doc).length + 1;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * The selection as tree items: a group whose content is selected completely counts as that
 * group, as high up as that stays true; anything else counts as its layers.
 */
function liftNodes(doc, ids) {
  const map = groupMap(groupsOf(doc));
  const full = (gid) => membersOf(doc, gid).every((l) => ids.includes(l.id));
  const nodes = new Map();
  for (const l of doc.layers.filter((x) => ids.includes(x.id))) {
    const chain = chainWith(map, l);
    let node = { kind: "layer", id: l.id };
    for (let i = chain.length - 1; i >= 0 && full(chain[i]); i--) node = { kind: "group", gid: chain[i] };
    nodes.set(node.kind === "layer" ? node.id : `g:${node.gid}`, node);
  }
  return [...nodes.values()];
}

/**
 * Group the selection. A group selected whole goes in as a group, which is what makes a group of
 * groups possible. The new group sits inside the group the topmost item was in, at its place.
 */
export function groupLayers(doc, ids, name) {
  const nodes = liftNodes(doc, ids);
  if (!nodes.length) return { doc, gid: null };
  const zOf = (n) => Math.max(...(n.kind === "layer" ? doc.layers.filter((l) => l.id === n.id) : membersOf(doc, n.gid)).map((l) => l.z || 0));
  const topNode = [...nodes].sort((a, b) => zOf(b) - zOf(a))[0];
  const parent = topNode.kind === "layer"
    ? (doc.layers.find((l) => l.id === topNode.id)?.group || null)
    : (findGroup(doc, topNode.gid)?.parent || null);
  const gid = makeId("g");
  const layerIds = new Set(nodes.filter((n) => n.kind === "layer").map((n) => n.id));
  const groupIds = new Set(nodes.filter((n) => n.kind === "group").map((n) => n.gid));
  const entry = { id: gid, name: name || nextGroupName(doc) };
  if (parent) entry.parent = parent;
  const next = {
    ...doc,
    groups: [...groupsOf(doc).map((g) => (groupIds.has(g.id) ? { ...g, parent: gid } : g)), entry],
    layers: doc.layers.map((l) => (layerIds.has(l.id) ? { ...l, group: gid } : l)),
  };
  return { doc: tidyGroups(next), gid };
}

/** Dissolve groups: what was inside each moves up into the group it sat in. */
export function ungroupLayers(doc, gids) {
  let next = doc;
  for (const gid of gids) {
    const g = findGroup(next, gid);
    if (!g) continue;
    const up = g.parent || null;
    next = {
      ...next,
      groups: groupsOf(next).filter((x) => x.id !== gid).map((x) => {
        if (x.parent !== gid) return x;
        if (up) return { ...x, parent: up };
        const { parent, ...rest } = x; // eslint-disable-line no-unused-vars
        return rest;
      }),
      layers: next.layers.map((l) => {
        if (l.group !== gid) return l;
        if (up) return { ...l, group: up };
        const { group, ...rest } = l; // eslint-disable-line no-unused-vars
        return rest;
      }),
    };
  }
  return tidyGroups(next);
}

/** What "ungroup" means for a selection: the groups selected whole, else the layers' own groups. */
export function groupsToUngroup(doc, ids) {
  const whole = liftNodes(doc, ids).filter((n) => n.kind === "group").map((n) => n.gid);
  if (whole.length) return whole;
  return [...new Set(doc.layers.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group))];
}

/**
 * Arrange: move the selection to the front or back, or one step, among its siblings (the items
 * in the same group, or at the top level). A layer inside a group moves within that group, a
 * group moves as one item. A selection spread over different groups is left alone.
 */
export function reorderNodes(doc, ids, where) {
  const nodes = liftNodes(doc, ids);
  if (!nodes.length) return doc;
  const keyOf = (n) => (n.kind === "layer" ? "l:" + n.id : "g:" + n.gid);
  const parentOf = (n) => (n.kind === "layer"
    ? (doc.layers.find((l) => l.id === n.id)?.group || null)
    : (findGroup(doc, n.gid)?.parent || null));
  const p = parentOf(nodes[0]);
  if (nodes.some((n) => parentOf(n) !== p)) return doc;
  const kids = [];
  walk(doc, (node) => { if ((node.parent || null) === p) kids.push(keyOf(node)); });
  const sel = new Set(nodes.map(keyOf));
  let seq = [...kids];
  if (where === "front") seq = [...seq.filter((k) => sel.has(k)), ...seq.filter((k) => !sel.has(k))];
  else if (where === "back") seq = [...seq.filter((k) => !sel.has(k)), ...seq.filter((k) => sel.has(k))];
  else if (where === "forward") {
    for (let i = 1; i < seq.length; i++) if (sel.has(seq[i]) && !sel.has(seq[i - 1])) [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]];
  } else if (where === "backward") {
    for (let i = seq.length - 2; i >= 0; i--) if (sel.has(seq[i]) && !sel.has(seq[i + 1])) [seq[i], seq[i + 1]] = [seq[i + 1], seq[i]];
  }
  // The parent's content is one block in the paint order; lay it out again in the new sequence.
  const idsOf = (k) => (k.startsWith("l:") ? [k.slice(2)] : membersOf(doc, k.slice(2)).map((l) => l.id));
  const block = seq.flatMap(idsOf);
  const inBlock = new Set(block);
  const cur = topFirst(doc.layers).map((l) => l.id);
  const at = cur.findIndex((id) => inBlock.has(id));
  const rest = cur.filter((id) => !inBlock.has(id));
  rest.splice(at === -1 ? 0 : at, 0, ...block);
  return tidyGroups(withOrder(doc, rest));
}

export function setGroup(doc, gid, patch) {
  return { ...doc, groups: groupsOf(doc).map((g) => (g.id === gid ? { ...g, ...patch } : g)) };
}

/**
 * Copies of layers with fresh ids. A group copied whole becomes a new group with the same name
 * (nested groups inside it too); a group copied in part keeps its copies inside the original,
 * which is what duplicating one element of a group means.
 */
export function cloneLayers(doc, layers, { offset = 0, topZ = 0, makeLayerId, groups = groupsOf(doc) }) {
  const map = groupMap(groups);
  const existing = new Set(groupsOf(doc).map((g) => g.id));
  const copied = new Set(layers.map((l) => l.id));
  const involved = new Set();
  for (const l of layers) for (const gid of chainWith(map, l)) involved.add(gid);
  // Whole: nothing still in the document sits in it without being copied too. A group that no
  // longer exists here (cut, then pasted) is whole by definition.
  const whole = (gid) => doc.layers.every((l) => !chainWith(map, l).includes(gid) || copied.has(l.id));
  const remap = new Map();
  for (const gid of involved) if (whole(gid)) remap.set(gid, makeId("g"));
  const newGroups = [...remap].map(([gid, id]) => {
    const src = map.get(gid);
    const entry = { id, name: src?.name || nextGroupName(doc) };
    const p = src?.parent;
    if (p && remap.has(p)) entry.parent = remap.get(p);
    else if (p && existing.has(p)) entry.parent = p;
    return entry;
  });
  const ordered = [...layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const clones = ordered.map((l, i) => {
    const c = { ...JSON.parse(JSON.stringify(l)), id: makeLayerId(), x: (l.x || 0) + offset, y: (l.y || 0) + offset, z: topZ + 1 + i };
    delete c.group;
    if (l.group) {
      if (remap.has(l.group)) c.group = remap.get(l.group);
      else if (existing.has(l.group)) c.group = l.group;
    }
    return c;
  });
  return { clones, newGroups };
}

/**
 * Put some layers directly above another one in the paint order. A duplicate belongs right over
 * its original, as in Figma: put on top of everything, a copy made inside a group would drag the
 * whole group up with it.
 */
export function placeAbove(doc, ids, anchorId) {
  const order = topFirst(doc.layers).map((l) => l.id).filter((id) => !ids.includes(id));
  const at = order.indexOf(anchorId);
  const moving = topFirst(doc.layers.filter((l) => ids.includes(l.id))).map((l) => l.id);
  order.splice(at === -1 ? 0 : at, 0, ...moving);
  return tidyGroups(withOrder(doc, order));
}

// ── The layers panel ─────────────────────────────────────────────────────────

/** Rows top first, as a tree: a header per group, its content under it unless it is closed. */
export function buildRows(doc) {
  const rows = [];
  const map = groupMap(groupsOf(doc));
  walk(doc, (node, depth) => {
    if (node.kind === "layer") { rows.push({ kind: "layer", id: node.id, parent: node.parent, depth }); return; }
    rows.push({ kind: "group", gid: node.gid, parent: node.parent, depth });
    return !map.get(node.gid)?.collapsed;
  });
  return rows;
}

/**
 * Drop a dragged row into gap `gap` (0 = above the first row). It lands in the same group as the
 * row below the gap: right under an open group's header that is the group itself, below its last
 * row it is whatever comes next. A group moves as a block and never lands inside itself.
 */
export function dropRow(doc, rows, drag, gap) {
  const below = rows[gap];
  const target = below ? below.parent : null;
  const firstOf = (row) => (row.kind === "layer" ? row.id : membersOf(doc, row.gid)[0]?.id);
  const before = below ? firstOf(below) : null;

  if (drag.kind === "group") {
    if (target === drag.gid || (target && chainOf(doc, { group: target }).includes(drag.gid))) return doc;
  }
  const moving = drag.kind === "group" ? membersOf(doc, drag.gid).map((l) => l.id) : [drag.id];
  if (before && moving.includes(before)) return doc;

  const order = topFirst(doc.layers).map((l) => l.id).filter((id) => !moving.includes(id));
  let at = before == null ? order.length : order.indexOf(before);
  if (at === -1) at = order.length;
  order.splice(at, 0, ...moving);
  let next = withOrder(doc, order, drag.kind === "layer" ? { [drag.id]: { group: target } } : {});
  if (drag.kind === "group") {
    next = { ...next, groups: groupsOf(next).map((g) => {
      if (g.id !== drag.gid) return g;
      if (target) return { ...g, parent: target };
      const { parent, ...rest } = g; // eslint-disable-line no-unused-vars
      return rest;
    }) };
  }
  return tidyGroups(next);
}

/** The box around some layers, ignoring rotation like the rest of the editor's snapping. */
export function boundsOf(layers) {
  if (!layers.length) return null;
  const minX = Math.min(...layers.map((l) => l.x || 0)), minY = Math.min(...layers.map((l) => l.y || 0));
  const maxX = Math.max(...layers.map((l) => (l.x || 0) + (l.w || 0))), maxY = Math.max(...layers.map((l) => (l.y || 0) + (l.h || 0)));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── Editing several layers at once ───────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
const norm = (c) => (typeof c === "string" ? c.trim().toLowerCase() : "");

/**
 * Every place a layer keeps a colour the renderer actually draws, as [read, write] pairs. Only
 * plain #rrggbb values: an rgba() track colour cannot be shown or edited in a hex field.
 */
function colorSlots(l) {
  const s = l.style || {};
  const slots = [];
  const list = (key) => (Array.isArray(s[key]) ? s[key] : []).forEach((p, i) => {
    if (p && p.visible !== false) slots.push({ get: () => p.color, set: (st, c) => ({ ...st, [key]: st[key].map((q, j) => (j === i ? { ...q, color: c } : q)) }) });
  });
  list("fills"); list("strokes"); list("effects");
  if (l.type === "text" && !Array.isArray(s.fills)) slots.push({ get: () => s.color, set: (st, c) => ({ ...st, color: c }) });
  if (l.type === "progress") {
    slots.push({ get: () => s.fillColor, set: (st, c) => ({ ...st, fillColor: c }) });
    slots.push({ get: () => s.trackColor, set: (st, c) => ({ ...st, trackColor: c }) });
  }
  if (s.border?.on && !Array.isArray(s.strokes)) slots.push({ get: () => s.border.color, set: (st, c) => ({ ...st, border: { ...st.border, color: c } }) });
  return slots.filter((x) => HEX.test(norm(x.get())));
}

/** The distinct colours in some layers, with how often each occurs, in order of first use. */
export function selectionColors(layers) {
  const out = new Map();
  for (const l of layers) for (const slot of colorSlots(l)) {
    const c = norm(slot.get());
    if (!HEX.test(c)) continue;
    out.set(c, (out.get(c) || 0) + 1);
  }
  return [...out].map(([color, count]) => ({ color, count }));
}

/** Replace one colour with another everywhere in the given layers (and keep text's mirror in step). */
export function replaceColor(doc, ids, from, to) {
  const f = norm(from);
  if (!HEX.test(f) || !to) return doc;
  let changed = false;
  const layers = doc.layers.map((l) => {
    if (!ids.includes(l.id)) return l;
    let st = l.style || {};
    for (const slot of colorSlots(l)) if (norm(slot.get()) === f) { st = slot.set(st, to); changed = true; }
    if (l.type === "text" && norm(st.color) === f) st = { ...st, color: to };
    return st === l.style ? l : { ...l, style: st };
  });
  return changed ? { ...doc, layers } : doc;
}
