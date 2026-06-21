import type { WordTiming } from "@/domain/word/timing";

// -- Types --------------------------------------------------------------------

interface Bounds {
  begin: number;
  end: number;
}

// -- Functions ----------------------------------------------------------------

function firstBegin(words: ReadonlyArray<WordTiming>): number {
  return words[0].begin;
}

function lastEnd(words: ReadonlyArray<WordTiming>): number {
  return words[words.length - 1].end;
}

// -- Exports ------------------------------------------------------------------

export { firstBegin, lastEnd };
export type { Bounds };
