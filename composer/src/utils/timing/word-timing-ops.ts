import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";

// -- Types --------------------------------------------------------------------

type UpdateLineWithHistory = (
  id: string,
  updates: Partial<LyricLine>,
  options?: { propagateToSiblings?: boolean },
) => void;

interface WordFieldConfig {
  getWords: (line: LyricLine) => WordTiming[] | undefined;
  updateKey: "words" | "backgroundWords";
}

interface NeighborContext {
  word: WordTiming;
  prevWord: WordTiming | undefined;
  nextWord: WordTiming | undefined;
}

type WordMutator = (ctx: NeighborContext) => WordTiming;

// -- Factory ------------------------------------------------------------------

function createWordTimingOps(config: WordFieldConfig) {
  const { getWords, updateKey } = config;

  function mutateWord(
    lines: LyricLine[],
    lineIdx: number,
    wordIdx: number,
    updateLineWithHistory: UpdateLineWithHistory,
    mutator: WordMutator,
  ): void {
    const line = lines[lineIdx];
    if (!line) return;
    const words = getWords(line);
    if (!words?.[wordIdx]) return;

    const updatedWords = [...words];
    const word = updatedWords[wordIdx];
    updatedWords[wordIdx] = mutator({ word, prevWord: updatedWords[wordIdx - 1], nextWord: updatedWords[wordIdx + 1] });

    updateLineWithHistory(line.id, { [updateKey]: updatedWords } as Partial<LyricLine>, {
      propagateToSiblings: false,
    });
  }

  function clampBegin({ word, prevWord }: NeighborContext, candidate: number): WordTiming {
    const minBegin = prevWord?.end ?? 0;
    return { ...word, begin: Math.min(word.end, Math.max(minBegin, candidate)) };
  }

  function clampEnd({ word, nextWord }: NeighborContext, candidate: number): WordTiming {
    const maxEnd = nextWord?.begin ?? Number.POSITIVE_INFINITY;
    return { ...word, end: Math.min(maxEnd, Math.max(word.begin, candidate)) };
  }

  function nudgeBegin(
    lines: LyricLine[],
    lineIdx: number,
    wordIdx: number,
    delta: number,
    updateLineWithHistory: UpdateLineWithHistory,
  ): void {
    mutateWord(lines, lineIdx, wordIdx, updateLineWithHistory, (ctx) => clampBegin(ctx, ctx.word.begin + delta));
  }

  function setBegin(
    lines: LyricLine[],
    lineIdx: number,
    wordIdx: number,
    newBegin: number,
    updateLineWithHistory: UpdateLineWithHistory,
  ): void {
    mutateWord(lines, lineIdx, wordIdx, updateLineWithHistory, (ctx) => clampBegin(ctx, newBegin));
  }

  function nudgeEnd(
    lines: LyricLine[],
    lineIdx: number,
    wordIdx: number,
    delta: number,
    updateLineWithHistory: UpdateLineWithHistory,
  ): void {
    mutateWord(lines, lineIdx, wordIdx, updateLineWithHistory, (ctx) => clampEnd(ctx, ctx.word.end + delta));
  }

  function setEnd(
    lines: LyricLine[],
    lineIdx: number,
    wordIdx: number,
    newEnd: number,
    updateLineWithHistory: UpdateLineWithHistory,
  ): void {
    mutateWord(lines, lineIdx, wordIdx, updateLineWithHistory, (ctx) => clampEnd(ctx, newEnd));
  }

  return { nudgeBegin, setBegin, nudgeEnd, setEnd };
}

// -- Exports -------------------------------------------------------------------

export { createWordTimingOps };
