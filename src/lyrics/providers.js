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
