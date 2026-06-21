import type { WordTiming } from "@/domain/word/timing";
import { distributeTiming } from "@/utils/syllable-utils";

// -- Functions -----------------------------------------------------------------

function splitWordIntoWords(word: WordTiming, splitPoints: number[]): WordTiming[] {
  const trimmed = word.text.trimEnd();
  const hadTrailingSpace = word.text.endsWith(" ");
  const partitions = distributeTiming(trimmed, splitPoints, word.begin, word.end);
  const { syllableGroupId: _drop, ...base } = word;

  return partitions.map((part, index) => {
    const isLast = index === partitions.length - 1;
    const trailing = isLast ? (hadTrailingSpace ? " " : "") : " ";
    return { ...base, text: `${part.text}${trailing}`, begin: part.begin, end: part.end };
  });
}

// -- Exports -------------------------------------------------------------------

export { splitWordIntoWords };
