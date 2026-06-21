import { isLineSynced, isWordSynced } from "@/domain/line/predicates";
import { type Bounds, firstBegin, lastEnd } from "@/domain/word/bounds";
import type { LyricLine } from "@/domain/line/model";

// -- Functions ----------------------------------------------------------------

function mainBounds(line: LyricLine): Bounds | null {
  if (isWordSynced(line)) {
    const words = line.words!;
    return { begin: firstBegin(words), end: lastEnd(words) };
  }
  if (isLineSynced(line)) {
    return { begin: line.begin, end: line.end };
  }
  return null;
}

function bgBounds(line: LyricLine): Bounds | null {
  if (!line.backgroundWords?.length) return null;
  const bg = line.backgroundWords;
  return { begin: firstBegin(bg), end: lastEnd(bg) };
}

function effectiveBounds(line: LyricLine): Bounds | null {
  const main = mainBounds(line);
  if (!main) return null;
  const bg = bgBounds(line);
  if (!bg) return main;
  return { begin: Math.min(main.begin, bg.begin), end: Math.max(main.end, bg.end) };
}

// -- Exports ------------------------------------------------------------------

export { bgBounds, effectiveBounds, mainBounds };
