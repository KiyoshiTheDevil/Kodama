import type { LyricLine } from "@/domain/line/model";
import type { WordSelection } from "@/domain/selection/model";
import { sameWordSelection } from "@/domain/selection/identity";

// -- Functions -----------------------------------------------------------------

function findWordsAtTime(lines: LyricLine[], time: number): WordSelection[] {
  const matches: WordSelection[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.words) {
      for (let wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
        const word = line.words[wordIndex];
        if (time >= word.begin && time < word.end) {
          matches.push({ lineId: line.id, lineIndex, wordIndex, type: "word" });
        }
      }
    }
    if (line.backgroundWords) {
      for (let wordIndex = 0; wordIndex < line.backgroundWords.length; wordIndex++) {
        const word = line.backgroundWords[wordIndex];
        if (time >= word.begin && time < word.end) {
          matches.push({ lineId: line.id, lineIndex, wordIndex, type: "bg" });
        }
      }
    }
  }
  return matches;
}

function pickNextWordAtPlayhead(matches: WordSelection[], selectedWords: WordSelection[]): WordSelection | null {
  if (matches.length === 0) return null;
  if (selectedWords.length === 1) {
    const current = selectedWords[0];
    const index = matches.findIndex((match) => sameWordSelection(match, current));
    if (index >= 0) return matches[(index + 1) % matches.length];
  }
  return matches[0];
}

// -- Exports -------------------------------------------------------------------

export { findWordsAtTime, pickNextWordAtPlayhead };
