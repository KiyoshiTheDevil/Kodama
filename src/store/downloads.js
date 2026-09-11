/**
 * How often each store entry has been downloaded.
 *
 * Counted by the statistics Worker, under the same promise as the heartbeat: how many, never who.
 * What is sent is the id of the entry and nothing else. This installation remembers which ids it
 * has already reported, so an update, a reinstall or a remove-and-install-again is still the one
 * download it was; that list never leaves the device.
 *
 * Silent in every failure. A download count that cannot be sent or fetched must never get in the
 * way of the install it describes, and the page simply shows no number.
 */
import { STATS_URL, anonStatsAllowed } from "../stats-endpoint.js";

const COUNTED_KEY = "kodama-store-counted";

function counted() {
  try {
    const v = JSON.parse(localStorage.getItem(COUNTED_KEY) || "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

/** Report the first install of `id` from this installation. Fire and forget. */
export function reportDownload(id) {
  // A dev build is the people building the shop installing things over and over.
  if (import.meta.env.DEV || !id || !anonStatsAllowed()) return;
  const seen = counted();
  if (seen.has(id)) return;
  fetch(`${STATS_URL}/store/install`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).then(r => {
    // Remembered only once the Worker has taken it, so a failed send is tried again on the next
    // install rather than lost. A 404 means the Worker does not know the id, which will not change
    // by asking again, so that is remembered too.
    if (!r.ok && r.status !== 404) return;
    seen.add(id);
    try { localStorage.setItem(COUNTED_KEY, JSON.stringify([...seen])); } catch { /* full or blocked */ }
  }).catch(() => {});
}

/** Every entry's count, as { id: n }, or null when they cannot be had. */
export async function fetchDownloadCounts() {
  try {
    const r = await fetch(`${STATS_URL}/store/counts`);
    if (!r.ok) return null;
    const d = await r.json();
    return d && typeof d.counts === "object" ? d.counts : null;
  } catch {
    return null;
  }
}
