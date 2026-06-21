function formatTime(seconds: number, precision: 0 | 2 | 3 = 3): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return precision === 0 ? "0:00" : `0:00.${"0".repeat(precision)}`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const base = `${mins}:${secs.toString().padStart(2, "0")}`;
  if (precision === 0) return base;
  const fraction = Math.floor((seconds % 1) * 10 ** precision);
  return `${base}.${fraction.toString().padStart(precision, "0")}`;
}

// -- Exports -------------------------------------------------------------------

export { formatTime };
