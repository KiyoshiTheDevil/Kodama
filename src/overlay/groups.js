// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — groups. PURE LOGIC, no React/DOM.
//
//  A group is a mark on its layers (`layer.group = "g_…"`) plus an entry in `doc.groups` that
//  carries its name and whether the layers panel shows it open. The layer list itself stays
//  flat, and that is the point: the OBS renderer in the backend sorts layers by z and draws
//  them, and it keeps doing exactly that. A real container would have meant a second renderer
//  that understands nesting, in Python, for something that is purely about editing.
//
//  The one rule the rest of this file exists to keep: a group's members are NEIGHBOURS in the
//  paint order. A group is one thing in the layers panel, so it has to be one block in z, or the
//  panel would show it in one place while it paints in two.
// ─────────────────────────────────────────────────────────────────────────────
import { makeId } from "./schema.js";

/** Layers top first, the order the layers panel lists them in. */
export const topFirst = (layers) => [...layers].sort((a, b) => (b.z || 0) - (a.z || 0));

export const groupsOf = (doc) => (Array.isArray(doc.groups) ? doc.groups : []);
export const findGroup = (doc, gid) => groupsOf(doc).find((g) => g.id === gid) || null;
export const membersOf = (doc, gid) => (gid ? topFirst(doc.layers.filter((l) => l.group === gid)) : []);

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

/**
 * Bring a document back in line after any change: every group keeps its members together at the
 * place of its topmost member, a group without members goes, and a layer pointing at a group
 * that does not exist gets one, so a hand-edited or half-imported file cannot leave a layer
 * marked with a name the panel has nowhere to show.
 */
export function tidyGroups(doc) {
  const layers = doc.layers || [];
  let groups = groupsOf(doc);
  if (!groups.length && !layers.some((l) => l.group)) return doc;

  const known = new Set(groups.map((g) => g.id));
  const missing = [...new Set(layers.map((l) => l.group).filter((g) => g && !known.has(g)))];
  if (missing.length) groups = [...groups, ...missing.map((id, i) => ({ id, name: `Group ${groups.length + i + 1}` }))];

  const order = [];
  const placed = new Set();
  const sorted = topFirst(layers);
  for (const l of sorted) {
    if (!l.group) { order.push(l.id); continue; }
    if (placed.has(l.group)) continue;
    placed.add(l.group);
    for (const m of sorted) if (m.group === l.group) order.push(m.id);
  }
  const used = new Set(layers.map((l) => l.group).filter(Boolean));
  const keptGroups = groups.filter((g) => used.has(g.id));
  const next = withOrder({ ...doc, groups: keptGroups }, order);
  return next;
}

/** The ids plus every other member of any group they belong to. */
export function expandToGroups(doc, ids) {
  const gids = new Set(doc.layers.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group));
  if (!gids.size) return ids;
  const out = new Set(ids);
  for (const l of doc.layers) if (l.group && gids.has(l.group)) out.add(l.id);
  return doc.layers.filter((l) => out.has(l.id)).map((l) => l.id);
}

/** The group the selection IS, exactly and completely, or null. */
export function selectedGroup(doc, ids) {
  if (!ids.length) return null;
  const first = doc.layers.find((l) => l.id === ids[0]);
  const gid = first?.group;
  if (!gid) return null;
  const members = doc.layers.filter((l) => l.group === gid);
  if (members.length !== ids.length) return null;
  return members.every((m) => ids.includes(m.id)) ? findGroup(doc, gid) : null;
}

/** A name nobody in the document uses yet: "Group 1", "Group 2", ... */
export function nextGroupName(doc, base = "Group") {
  const taken = new Set(groupsOf(doc).map((g) => g.name));
  let n = groupsOf(doc).length + 1;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * Group the layers. One level only: a layer that was in another group leaves it. The new block
 * lands where the topmost of them was, so grouping never changes what is in front of what for
 * anything outside the selection.
 */
export function groupLayers(doc, ids, name) {
  const picked = topFirst(doc.layers.filter((l) => ids.includes(l.id)));
  if (!picked.length) return { doc, gid: null };
  const gid = makeId("g");
  const order = topFirst(doc.layers).map((l) => l.id);
  const at = order.indexOf(picked[0].id);
  const rest = order.filter((id) => !ids.includes(id));
  const insertAt = rest.indexOf(order.slice(at).find((id) => !ids.includes(id)));
  rest.splice(insertAt === -1 ? rest.length : insertAt, 0, ...picked.map((l) => l.id));
  const patches = Object.fromEntries(picked.map((l) => [l.id, { group: gid }]));
  const next = withOrder({ ...doc, groups: [...groupsOf(doc), { id: gid, name: name || nextGroupName(doc) }] }, rest, patches);
  return { doc: tidyGroups(next), gid };
}

export function ungroupLayers(doc, gids) {
  const set = new Set(gids);
  const patches = Object.fromEntries(doc.layers.filter((l) => set.has(l.group)).map((l) => [l.id, { group: null }]));
  const next = withOrder(doc, topFirst(doc.layers).map((l) => l.id), patches);
  return tidyGroups({ ...next, groups: groupsOf(next).filter((g) => !set.has(g.id)) });
}

export function setGroup(doc, gid, patch) {
  return { ...doc, groups: groupsOf(doc).map((g) => (g.id === gid ? { ...g, ...patch } : g)) };
}

/**
 * Copies of layers with fresh ids. A group copied whole becomes a new group with the same name;
 * a group copied in part keeps its members' copies inside the original, which is what
 * duplicating one element of a group means.
 */
export function cloneLayers(doc, layers, { offset = 0, topZ = 0, makeLayerId, groups = groupsOf(doc) }) {
  const byGroup = new Map();
  for (const l of layers) if (l.group) byGroup.set(l.group, (byGroup.get(l.group) || 0) + 1);
  const remap = new Map();
  const newGroups = [];
  for (const [gid, count] of byGroup) {
    const whole = doc.layers.filter((l) => l.group === gid).length;
    // A group that no longer exists in this document (cut, then pasted) is whole by definition.
    if (count >= whole || whole === 0) {
      const id = makeId("g");
      remap.set(gid, id);
      const src = groups.find((g) => g.id === gid);
      newGroups.push({ id, name: src?.name || nextGroupName(doc) });
    }
  }
  const ordered = [...layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const clones = ordered.map((l, i) => {
    const c = { ...JSON.parse(JSON.stringify(l)), id: makeLayerId(), x: (l.x || 0) + offset, y: (l.y || 0) + offset, z: topZ + 1 + i };
    if (l.group) c.group = remap.get(l.group) || l.group;
    return c;
  });
  return { clones, newGroups };
}

// ── The layers panel ─────────────────────────────────────────────────────────

/** Rows top first: a header for each group, followed by its members unless it is closed. */
export function buildRows(doc) {
  const rows = [];
  const seen = new Set();
  for (const l of topFirst(doc.layers)) {
    if (!l.group) { rows.push({ kind: "layer", id: l.id, group: null }); continue; }
    if (seen.has(l.group)) {
      if (!findGroup(doc, l.group)?.collapsed) rows.push({ kind: "layer", id: l.id, group: l.group });
      continue;
    }
    seen.add(l.group);
    rows.push({ kind: "group", gid: l.group });
    if (!findGroup(doc, l.group)?.collapsed) rows.push({ kind: "layer", id: l.id, group: l.group });
  }
  return rows;
}

/**
 * Drop a dragged row into gap `gap` (0 = above the first row). A layer dropped between two rows
 * of the same group joins it, anywhere else it stands on its own; a group always moves as a
 * block and never lands inside another one.
 */
export function dropRow(doc, rows, drag, gap) {
  const above = rows[gap - 1], below = rows[gap];
  let target = null;
  if (below?.kind === "layer" && below.group &&
      ((above?.kind === "group" && above.gid === below.group) || (above?.kind === "layer" && above.group === below.group))) {
    target = below.group;
  }
  const firstOf = (gid) => membersOf(doc, gid)[0]?.id;
  let before = !below ? null : below.kind === "layer" ? below.id : firstOf(below.gid);

  const moving = drag.kind === "group" ? membersOf(doc, drag.gid).map((l) => l.id) : [drag.id];
  if (drag.kind === "group" && target) { before = firstOf(target); target = null; }
  if (drag.kind === "group" && target == null && moving.includes(before)) return doc;

  const order = topFirst(doc.layers).map((l) => l.id).filter((id) => !moving.includes(id));
  // Dropping a row onto its own place: `before` is the row itself or its own next neighbour.
  let at = before == null ? order.length : order.indexOf(before);
  if (at === -1) at = order.length;
  order.splice(at, 0, ...moving);
  const patches = drag.kind === "group" ? {} : { [drag.id]: { group: target } };
  return tidyGroups(withOrder(doc, order, patches));
}

/** The box around some layers, ignoring rotation like the rest of the editor's snapping. */
export function boundsOf(layers) {
  if (!layers.length) return null;
  const minX = Math.min(...layers.map((l) => l.x || 0)), minY = Math.min(...layers.map((l) => l.y || 0));
  const maxX = Math.max(...layers.map((l) => (l.x || 0) + (l.w || 0))), maxY = Math.max(...layers.map((l) => (l.y || 0) + (l.h || 0)));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
