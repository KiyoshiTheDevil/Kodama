// Preset storage for the equaliser. Ten bands, octave spaced, matching audio/eq.rs — the two
// lists have to agree, so the frequencies live here as the single place the UI reads them and
// the Rust side keeps its own copy of the same numbers.
export const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const RANGE_DB = 12;      // slider travel, matching the design's +12 / -12 scale
export const STORAGE_KEY = "kodama-eq";

const z = () => new Array(BANDS.length).fill(0);

/**
 * The shipped presets. Values are gentle on purpose: a graphic equaliser is applied on top of
 * a master that was already mixed, so the point is a nudge, not a redesign. Anything that
 * boosts carries a matching preamp cut, otherwise the loudest passages simply clip and the
 * preset sounds "better" only because it is louder.
 */
export const BUILTIN = [
  { id: "default", name: "Default", preamp: 0, gains: z() },
  { id: "flat", name: "Flat", preamp: 0, gains: z() },
  //                    32   64  125  250  500   1k   2k   4k   8k  16k
  { id: "acoustic", name: "Acoustic", preamp: -2, gains: [3, 3, 2, 0, 1, 1, 2, 3, 3, 2] },
  { id: "dance", name: "Dance", preamp: -3, gains: [5, 4, 2, 0, -1, -2, 0, 2, 4, 4] },
  { id: "rock", name: "Rock", preamp: -3, gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 4] },
  { id: "hiphop", name: "Hip-Hop", preamp: -3, gains: [6, 5, 3, 1, -1, -1, 1, 2, 3, 3] },
  { id: "pop", name: "Pop", preamp: -2, gains: [-1, -1, 0, 2, 4, 4, 2, 0, -1, -1] },
  { id: "jazz", name: "Jazz", preamp: -2, gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: "treble", name: "Treble Booster", preamp: -3, gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: "bassboost", name: "Bass Booster", preamp: -4, gains: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "bassreduce", name: "Bass Reducer", preamp: 0, gains: [-6, -5, -3, -1, 0, 0, 0, 0, 0, 0] },
];

export const isBuiltin = (id) => BUILTIN.some((p) => p.id === id);

const clampGain = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-RANGE_DB, Math.min(RANGE_DB, n)) : 0;
};

/**
 * Bring anything claiming to be a preset into shape. Imported files come from outside the app,
 * and a band list of the wrong length would otherwise reach the Rust command, which rejects it
 * wholesale — one short array would silently disable the equaliser rather than load partially.
 */
export function normalizePreset(raw, fallbackName = "Preset") {
  const gains = Array.isArray(raw?.gains) ? raw.gains : [];
  return {
    id: typeof raw?.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackName,
    preamp: clampGain(raw?.preamp),
    gains: BANDS.map((_, i) => clampGain(gains[i])),
  };
}

export function loadState() {
  const empty = { enabled: false, presetId: "default", preamp: 0, gains: z(), custom: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== "object") return empty;
    return {
      enabled: !!raw.enabled,
      presetId: typeof raw.presetId === "string" ? raw.presetId : "default",
      preamp: clampGain(raw.preamp),
      gains: BANDS.map((_, i) => clampGain(raw.gains?.[i])),
      custom: Array.isArray(raw.custom) ? raw.custom.map((p) => normalizePreset(p)) : [],
    };
  } catch {
    return empty;
  }
}

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private window */ }
}

/**
 * Push the curve to the audio core. Also called by the main window at startup, so playback
 * comes up with the saved curve rather than flat until the equaliser window is opened once.
 */
export async function applyToCore(state) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("audio_set_eq", {
      enabled: !!state.enabled,
      preampDb: state.preamp,
      gainsDb: state.gains,
    });
  } catch { /* not in Tauri, or the core is not up yet */ }
}
