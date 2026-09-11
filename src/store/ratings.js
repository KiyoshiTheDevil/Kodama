/**
 * Star ratings for store entries.
 *
 * One vote per installation and entry. What is sent is sha256(install id + ":" + entry id): the
 * install id is the random UUID the heartbeat already keeps, and it never leaves the device. The
 * token is the same every time this installation rates this entry, so rating again replaces the
 * old vote; it is different for every other entry, so the server cannot join one device's ratings
 * together. See analytics/worker.js for the rest of the arrangement.
 *
 * Not tied to the anonymous statistics switch. That switch governs what is sent without anyone
 * doing anything; a rating is sent because someone clicked a star.
 */
import { STATS_URL } from "../stats-endpoint.js";

const MINE_KEY = "kodama-store-ratings";   // { id: stars }, this installation's own votes

/** Below this many votes no average is shown: one 5 or one 1 says nothing about an entry. */
export const MIN_RATINGS = 3;

function installId() {
  let id = localStorage.getItem("kodama-install-id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("kodama-install-id", id); }
  return id;
}

async function voterToken(entryId) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${installId()}:${entryId}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function readMine() {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** The stars this installation gave `id`, or 0. */
export function myRating(id) {
  const n = readMine()[id];
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

/**
 * Rate `id` with 1-5 stars, or withdraw with 0. Resolves to the entry's new { avg, count }, or
 * throws with a reason, so the page can say the vote did not land instead of pretending it did.
 */
export async function rate(id, stars) {
  const r = await fetch(`${STATS_URL}/store/rate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, voter: await voterToken(id), stars: stars || null }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
  const mine = readMine();
  if (stars) mine[id] = stars; else delete mine[id];
  try { localStorage.setItem(MINE_KEY, JSON.stringify(mine)); } catch { /* full or blocked */ }
  return d.rating;
}

/** Every entry's { avg, count }, or null when they cannot be had. */
export async function fetchRatings() {
  try {
    const r = await fetch(`${STATS_URL}/store/ratings`);
    if (!r.ok) return null;
    const d = await r.json();
    return d && typeof d.ratings === "object" ? d.ratings : null;
  } catch {
    return null;
  }
}
