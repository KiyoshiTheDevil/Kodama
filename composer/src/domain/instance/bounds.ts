import { bgBounds, mainBounds } from "@/domain/line/bounds";
import type { Bounds } from "@/domain/word/bounds";
import type { LyricLine } from "@/domain/line/model";

// -- Functions ----------------------------------------------------------------

function instanceBounds(lines: LyricLine[]): Bounds | null {
  let begin = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const hasWords = !!line.words?.length;
    const hasBg = !!line.backgroundWords?.length;
    if (hasWords) {
      const m = mainBounds(line);
      if (m) {
        if (m.begin < begin) begin = m.begin;
        if (m.end > end) end = m.end;
      }
    }
    if (hasBg) {
      const b = bgBounds(line);
      if (b) {
        if (b.begin < begin) begin = b.begin;
        if (b.end > end) end = b.end;
      }
    }
    if (!hasWords && !hasBg) {
      if (line.begin !== undefined && line.begin < begin) begin = line.begin;
      if (line.end !== undefined && line.end > end) end = line.end;
    }
  }
  if (!Number.isFinite(begin) || !Number.isFinite(end)) return null;
  return { begin, end };
}

// -- Exports ------------------------------------------------------------------

export { instanceBounds };
