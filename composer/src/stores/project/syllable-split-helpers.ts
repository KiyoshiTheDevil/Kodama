import { manualBackgroundWordEdit } from "@/domain/line/background";
import { reconcileLine, type LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { findIdenticalWords, type IdenticalMatchSource } from "@/utils/identical-word-matcher";
import { splitWordIntoSyllables } from "@/utils/single-word-syllable-split";

// -- Types --------------------------------------------------------------------

interface SplitTarget {
  lineId: string;
  wordIndex: number;
  type: "word" | "bg";
  word: WordTiming;
  reuseGroupId: boolean;
}

// -- Helpers ------------------------------------------------------------------

function replaceWordsAt(track: WordTiming[], wordIndex: number, replacement: WordTiming[]): WordTiming[] {
  return [...track.slice(0, wordIndex), ...replacement, ...track.slice(wordIndex + 1)];
}

function applyTargetsToLine(line: LyricLine, targets: SplitTarget[], splitPoints: number[]): LyricLine {
  let mainTrack = line.words;
  let bgTrack = line.backgroundWords;

  // Single descending sort across all targets is safe: projecting onto each
  // track preserves descending order, so per-track splice indices don't drift.
  const sortedDescending = targets.toSorted((a, b) => b.wordIndex - a.wordIndex);
  for (const target of sortedDescending) {
    const replacement = splitWordIntoSyllables({
      word: target.word,
      splitPoints,
      reuseGroupId: target.reuseGroupId,
    });
    if (target.type === "word" && mainTrack) {
      mainTrack = replaceWordsAt(mainTrack, target.wordIndex, replacement);
    } else if (target.type === "bg" && bgTrack) {
      bgTrack = replaceWordsAt(bgTrack, target.wordIndex, replacement);
    }
  }

  return reconcileLine({
    ...line,
    ...(mainTrack !== line.words ? { words: mainTrack } : {}),
    ...(bgTrack && bgTrack !== line.backgroundWords ? manualBackgroundWordEdit(bgTrack) : {}),
  });
}

function findSourceTarget(lines: LyricLine[], source: IdenticalMatchSource): SplitTarget | null {
  const sourceLine = lines.find((line) => line.id === source.lineId);
  if (!sourceLine) return null;
  const track = source.type === "word" ? sourceLine.words : sourceLine.backgroundWords;
  const word = track?.[source.wordIndex];
  if (!word) return null;
  return { lineId: source.lineId, wordIndex: source.wordIndex, type: source.type, word, reuseGroupId: true };
}

function applySyllableSplitToLines(
  lines: LyricLine[],
  source: IdenticalMatchSource,
  splitPoints: number[],
  caseInsensitive: boolean,
): LyricLine[] {
  const sourceTarget = findSourceTarget(lines, source);
  if (!sourceTarget) return lines;

  const matches = findIdenticalWords(lines, source, {
    caseInsensitive,
    excludeSource: true,
    splitPoints,
  });

  const targetsByLine = new Map<string, SplitTarget[]>();
  const pushTarget = (target: SplitTarget) => {
    const existing = targetsByLine.get(target.lineId);
    if (existing) existing.push(target);
    else targetsByLine.set(target.lineId, [target]);
  };

  pushTarget(sourceTarget);
  for (const match of matches) {
    pushTarget({
      lineId: match.lineId,
      wordIndex: match.wordIndex,
      type: match.type,
      word: match.word,
      reuseGroupId: false,
    });
  }

  return lines.map((line) => {
    const targets = targetsByLine.get(line.id);
    if (!targets) return line;
    return applyTargetsToLine(line, targets, splitPoints);
  });
}

// -- Exports ------------------------------------------------------------------

export { applySyllableSplitToLines };
