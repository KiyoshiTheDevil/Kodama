import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";

// -- Types --------------------------------------------------------------------

interface IdenticalMatchSource {
  lineId: string;
  wordIndex: number;
  type: "word" | "bg";
}

interface IdenticalMatch extends IdenticalMatchSource {
  lineIndex: number;
  word: WordTiming;
}

interface MatchOptions {
  caseInsensitive: boolean;
  excludeSource: boolean;
  splitPoints: number[];
}

// -- Functions ----------------------------------------------------------------

function normalizeText(text: string, caseInsensitive: boolean): string {
  const trimmed = text.trimEnd();
  return caseInsensitive ? trimmed.toLocaleLowerCase() : trimmed;
}

function findSourceWord(lines: LyricLine[], source: IdenticalMatchSource): WordTiming | undefined {
  const sourceLine = lines.find((line) => line.id === source.lineId);
  if (!sourceLine) return undefined;
  const track = source.type === "word" ? sourceLine.words : sourceLine.backgroundWords;
  return track?.[source.wordIndex];
}

function collectTrackMatches(
  line: LyricLine,
  lineIndex: number,
  track: WordTiming[] | undefined,
  type: "word" | "bg",
  source: IdenticalMatchSource,
  options: MatchOptions,
  targetText: string,
  minLength: number,
  out: IdenticalMatch[],
): void {
  if (!track) return;
  for (let wordIndex = 0; wordIndex < track.length; wordIndex++) {
    const word = track[wordIndex];
    if (!word) continue;
    if (word.syllableGroupId !== undefined) continue;
    const isSource = line.id === source.lineId && type === source.type && wordIndex === source.wordIndex;
    if (options.excludeSource && isSource) continue;
    const trimmed = word.text.trimEnd();
    if (trimmed.length < minLength) continue;
    const candidate = options.caseInsensitive ? trimmed.toLocaleLowerCase() : trimmed;
    if (candidate !== targetText) continue;
    out.push({ lineId: line.id, lineIndex, wordIndex, type, word });
  }
}

function findIdenticalWords(lines: LyricLine[], source: IdenticalMatchSource, options: MatchOptions): IdenticalMatch[] {
  const sourceWord = findSourceWord(lines, source);
  if (!sourceWord) return [];

  const targetText = normalizeText(sourceWord.text, options.caseInsensitive);
  const maxSplitPoint = options.splitPoints.length > 0 ? Math.max(...options.splitPoints) : 0;
  const minLength = maxSplitPoint + 1;

  const matches: IdenticalMatch[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line) continue;
    collectTrackMatches(line, lineIndex, line.words, "word", source, options, targetText, minLength, matches);
    collectTrackMatches(line, lineIndex, line.backgroundWords, "bg", source, options, targetText, minLength, matches);
  }
  return matches;
}

// -- Exports ------------------------------------------------------------------

export { findIdenticalWords };

export type { IdenticalMatch, IdenticalMatchSource, MatchOptions };
