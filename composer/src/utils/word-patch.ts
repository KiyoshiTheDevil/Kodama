import type { WordTiming } from "@/domain/word/timing";

// -- Types --------------------------------------------------------------------

interface AdjacentPatch {
  index: number;
  updates: Partial<WordTiming>;
}

// -- Functions ----------------------------------------------------------------

function applyWordPatch(
  words: WordTiming[],
  wordIndex: number,
  updates: Partial<WordTiming>,
  adjacent?: AdjacentPatch,
): WordTiming[] | null {
  if (wordIndex < 0 || wordIndex >= words.length) return null;
  if (adjacent && (adjacent.index < 0 || adjacent.index >= words.length)) return null;
  const result = [...words];
  result[wordIndex] = { ...result[wordIndex], ...updates };
  if (adjacent) {
    result[adjacent.index] = { ...result[adjacent.index], ...adjacent.updates };
  }
  return result;
}

// -- Exports ------------------------------------------------------------------

export { applyWordPatch };
