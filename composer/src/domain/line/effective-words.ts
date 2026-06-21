import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { isLineSynced } from "@/domain/line/predicates";
import { stripSplitCharacter } from "@/utils/split-character";

// -- Functions ----------------------------------------------------------------

function effectiveWords(line: LyricLine): WordTiming[] {
  if (line.words?.length) return line.words;
  if (isLineSynced(line)) {
    return [{ text: stripSplitCharacter(line.text), begin: line.begin, end: line.end }];
  }
  return [];
}

function getEffectiveLines(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => {
    if (!isLineSynced(line)) return line;
    const { begin, end, ...rest } = line;
    return { ...rest, words: effectiveWords(line) };
  });
}

// -- Exports ------------------------------------------------------------------

export { effectiveWords, getEffectiveLines };
