// -- Constants -----------------------------------------------------------------

const GROUP_COLORS = [
  "#f472b6", // pink
  "#60a5fa", // blue
  "#4ade80", // green
  "#fb923c", // orange
  "#a78bfa", // violet
  "#22d3d1", // cyan
  "#facc15", // yellow
  "#fb7185", // rose
  "#34d399", // emerald
  "#e879f9", // fuchsia
];

// -- Helpers -------------------------------------------------------------------

function pickNextGroupColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  for (const candidate of GROUP_COLORS) {
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return GROUP_COLORS[usedColors.length % GROUP_COLORS.length];
}

// -- Exports -------------------------------------------------------------------

export { GROUP_COLORS, pickNextGroupColor };
