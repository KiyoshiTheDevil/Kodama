import type { WordTiming } from "@/domain/word/timing";
import { distributeTiming } from "@/utils/syllable-utils";
import { splitSourceWord } from "@/utils/word-timing";
import { nanoid } from "nanoid";

// -- Types --------------------------------------------------------------------

interface SplitOneWordParams {
  word: WordTiming;
  splitPoints: number[];
  reuseGroupId?: boolean;
}

// -- Helpers ------------------------------------------------------------------

function splitWordIntoSyllables({ word, splitPoints, reuseGroupId = false }: SplitOneWordParams): WordTiming[] {
  const groupId = reuseGroupId && word.syllableGroupId !== undefined ? word.syllableGroupId : nanoid(8);
  const sourceForSplit: WordTiming = { ...word, syllableGroupId: groupId };
  const trimmed = word.text.trimEnd();
  const partitions = distributeTiming(trimmed, splitPoints, word.begin, word.end);
  const newWords = splitSourceWord(sourceForSplit, partitions);
  if (word.text.endsWith(" ") && newWords.length > 0) {
    const last = newWords[newWords.length - 1];
    newWords[newWords.length - 1] = { ...last, text: `${last.text} ` };
  }
  return newWords;
}

// -- Exports ------------------------------------------------------------------

export { splitWordIntoSyllables };
export type { SplitOneWordParams };
