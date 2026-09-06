// Shared formatting helpers.

/**
 * A byte count as people read it.
 *
 * Binary steps, because that is what the two places using this are measuring: what a
 * filesystem reports for the caches, and what a server reports as a download's length.
 */
export function fmtBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
