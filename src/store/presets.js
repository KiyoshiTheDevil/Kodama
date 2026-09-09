// Installing a published preset.
//
// A preset installed from the store lands in the SAME list the app already reads, because a second
// list would mean every screen that shows presets had to learn about the store.
//
// What it needs beyond a hand-imported preset is an identity: the store has to be able to say
// "installed", offer an update, and take it away again. That identity is carried IN THE ID,
// as "store:<catalogue id>@<version>".
//
// Encoding it in the id rather than in a field beside it is not decoration. The equaliser runs
// every preset through normalizePreset, which rebuilds the object from four known keys and drops
// everything else, so a field would survive being written and vanish on the next read - and the
// store would then offer an update forever, because it could never see which version was there.
// The id is one of the four keys it keeps.
//
// A preset installed this way is otherwise an ordinary custom preset. Deleting it in the equaliser
// window is allowed and simply makes the store offer it again, which is the honest outcome: the
// store reports what is there, it does not own it.
import { normalizePreset, loadState, saveState } from "../equalizer/presets.js";
import { VIZ_DEFAULTS } from "../visualizer/defaults.js";

export const STORE_PREFIX = "store:";
export const PRESETS_CHANGED = "kodama://presets-changed";
export const PRESET_KINDS = ["visualizer", "equalizer"];

const VIZ_KEY = "kodama-visualizer-presets";

/** "store:speech@1.0.0" → { id: "speech", version: "1.0.0" }. Null for a listener's own preset. */
export function parseStoreId(raw) {
  if (typeof raw !== "string" || !raw.startsWith(STORE_PREFIX)) return null;
  const rest = raw.slice(STORE_PREFIX.length);
  const at = rest.lastIndexOf("@");            // versions carry dots and hyphens, never "@"
  if (at <= 0) return { id: rest, version: null };
  return { id: rest.slice(0, at), version: rest.slice(at + 1) || null };
}

const makeStoreId = (id, version) => `${STORE_PREFIX}${id}@${version || "1.0.0"}`;

/** Only the keys the visualizer actually reads. An unknown one would be dead weight in storage. */
function cleanVizConfig(config) {
  const out = {};
  if (!config || typeof config !== "object") return out;
  for (const key of Object.keys(VIZ_DEFAULTS)) {
    if (key in config) out[key] = config[key];
  }
  return out;
}

// ─── The two lists ───────────────────────────────────────────────────────────

function readViz() {
  try {
    const raw = JSON.parse(localStorage.getItem(VIZ_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function writeViz(list) {
  try { localStorage.setItem(VIZ_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

const listOf = (kind) => (kind === "visualizer" ? readViz() : loadState().custom);

// ─── What is installed ───────────────────────────────────────────────────────

/** Installed store presets of one kind, as `{ id, version }`. */
export function installedPresets(kind) {
  return listOf(kind)
    .map(p => parseStoreId(p?.id))
    .filter(Boolean);
}

// ─── Installing ──────────────────────────────────────────────────────────────

export function installPreset(kind, entry) {
  if (!entry?.id) return false;
  const id = makeStoreId(entry.id, entry.version);
  const name = entry.title || entry.id;
  // An update replaces the older version, which has a DIFFERENT id because the version is part of
  // it. Matching on the catalogue id rather than on the whole id is what keeps an update from
  // leaving both copies behind.
  const keep = (p) => parseStoreId(p?.id)?.id !== entry.id;

  if (kind === "visualizer") {
    // Only what the preset CHANGES, exactly as published: applyVizPreset merges over VIZ_DEFAULTS,
    // so a partial config is the point rather than an omission.
    return writeViz([
      { id, name, savedAt: new Date().toISOString(), config: cleanVizConfig(entry.config) },
      ...readViz().filter(keep),
    ]);
  }
  const state = loadState();
  const custom = state.custom.filter(keep);
  custom.push(normalizePreset({ ...entry.config, id, name }));
  // Updating changes the id, because the version is part of it. Without following the selection
  // across, an update to the preset that is CURRENTLY ON would leave the equaliser pointing at an
  // id that no longer exists, and it would show nothing selected right after the listener asked
  // for a newer version of the thing they were listening to.
  const selected = parseStoreId(state.presetId)?.id === entry.id ? id : state.presetId;
  saveState({ ...state, custom, presetId: selected });
  return true;
}

export function uninstallPreset(kind, id) {
  const keep = (p) => parseStoreId(p?.id)?.id !== id;
  if (kind === "visualizer") return writeViz(readViz().filter(keep));

  const state = loadState();
  // Matched on the catalogue id, not the whole id: the selection may still name an older version
  // of the same preset, and comparing the full strings would miss it and leave the equaliser
  // selecting something that is no longer in its own list.
  const presetId = parseStoreId(state.presetId)?.id === id ? "default" : state.presetId;
  saveState({ ...state, custom: state.custom.filter(keep), presetId });
  return true;
}

// ─── Telling the other windows ───────────────────────────────────────────────
//
// The equaliser is a window of its own and holds this state in memory. Without being told, its
// next save would write its stale copy back over a freshly installed preset: a silent loss, which
// is the worst kind.

async function announce() {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(PRESETS_CHANGED);
  } catch { /* not running in Tauri */ }
}

export async function installPresetEverywhere(kind, entry) {
  const ok = installPreset(kind, entry);
  if (ok) await announce();
  return ok;
}

export async function uninstallPresetEverywhere(kind, id) {
  const ok = uninstallPreset(kind, id);
  if (ok) await announce();
  return ok;
}

/** Run `fn` whenever a preset is installed or removed in any window. */
export function onPresetsChanged(fn) {
  let stop = () => {};
  let dead = false;
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen(PRESETS_CHANGED, fn))
    .then(un => { if (dead) un(); else stop = un; })
    .catch(() => {});
  return () => { dead = true; stop(); };
}
