// Lyrics-provider metadata shared across the app (settings provider list, the player's
// provider switcher, and the community lyrics browser). Pure data — extracted from App.jsx.

export const DEFAULT_LYRICS_PROVIDERS = [
  { id: "better",     label: "Better Lyrics", enabled: true },
  { id: "unison",     label: "Unison",        enabled: true },
  { id: "portato",    label: "Better Lyrics Portato", enabled: true },
  { id: "paxsenix-netease", label: "NetEase (Paxsenix)", enabled: true },
  { id: "musixmatch", label: "Musixmatch",    enabled: true },
  { id: "lrclib",     label: "LRCLIB",        enabled: true },
  { id: "kugou",      label: "Kugou",         enabled: true },
  { id: "simp",       label: "SimpMusic",     enabled: true },
];

// Reconcile a saved provider list with the current defaults: drop entries that no longer
// exist, append newly added ones, and take the label from the defaults. That last part
// matters because the saved list stores the label too — without it a renamed provider keeps
// its old name in settings forever. The user's order and enabled flags are preserved.
export function mergeLyricsProviders(saved) {
  const byId = new Map(DEFAULT_LYRICS_PROVIDERS.map(p => [p.id, p]));
  const kept = (Array.isArray(saved) ? saved : [])
    .filter(p => p && byId.has(p.id))
    .map(p => ({ ...p, label: byId.get(p.id).label }));
  const have = new Set(kept.map(p => p.id));
  return [...kept, ...DEFAULT_LYRICS_PROVIDERS.filter(p => !have.has(p.id))];
}

// Sync-type tags shown next to each provider in settings.
export const PROVIDER_SYNC = {
  better:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  unison:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  portato:    { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  "paxsenix-netease": { label: "Word", icon: "/sync-word.svg", color: "#f48fb1", bg: "rgba(244,143,177,0.12)" },
  musixmatch: { label: "Word",     icon: "/sync-word.svg",     color: "#f48fb1", bg: "rgba(244,143,177,0.12)" },
  lrclib:     { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  kugou:      { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  simp:       { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
};

// Coarsest to finest. A source that times syllables can express words and lines from the same
// data -- syllable timings carry the word and line boundaries with them -- so a provider offers
// everything up to its best level, not only that level. PROVIDER_SYNC above names the best one,
// which is what a single result's badge needs; this is what the settings list needs.
const SYNC_ORDER = ["syllable", "word", "line"];
const SYNC_BY_LABEL = {
  syllable: PROVIDER_SYNC.better,
  word: PROVIDER_SYNC.musixmatch,
  line: PROVIDER_SYNC.lrclib,
};

export function providerSyncLevels(id) {
  const best = PROVIDER_SYNC[id];
  if (!best) return [];
  const from = SYNC_ORDER.indexOf(best.label.toLowerCase());
  if (from === -1) return [best];
  return SYNC_ORDER.slice(from).map((k) => SYNC_BY_LABEL[k]);
}
