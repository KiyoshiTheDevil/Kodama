// Lyrics-provider metadata shared across the app (settings provider list, the player's
// provider switcher, and the community lyrics browser). Pure data — extracted from App.jsx.

export const DEFAULT_LYRICS_PROVIDERS = [
  { id: "better",     label: "Better Lyrics", enabled: true },
  { id: "unison",     label: "Unison",        enabled: true },
  { id: "musixmatch", label: "Musixmatch",    enabled: true },
  { id: "lrclib",     label: "LRCLIB",        enabled: true },
  { id: "kugou",      label: "Kugou",         enabled: true },
  { id: "simp",       label: "SimpMusic",     enabled: true },
];

// Sync-type tags shown next to each provider in settings.
export const PROVIDER_SYNC = {
  better:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  unison:     { label: "Syllable", icon: "/sync-syllable.svg", color: "#ce93d8", bg: "rgba(206,147,216,0.12)" },
  musixmatch: { label: "Word",     icon: "/sync-word.svg",     color: "#f48fb1", bg: "rgba(244,143,177,0.12)" },
  lrclib:     { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  kugou:      { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
  simp:       { label: "Line",     icon: "/sync-line.svg",     color: "#81c784", bg: "rgba(129,199,132,0.12)" },
};
