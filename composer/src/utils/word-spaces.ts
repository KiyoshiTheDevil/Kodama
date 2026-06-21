import type { WordTiming } from "@/domain/word/timing";

// -- Constants -----------------------------------------------------------------

const DEFAULT_MIN_WORD_DURATION = 0.05;

// -- Functions -----------------------------------------------------------------

function trimTrailingSpaceFromLast(words: WordTiming[]): WordTiming[] {
  if (words.length === 0) return words;
  const last = words[words.length - 1];
  if (!last.text.endsWith(" ")) return words;
  const next = words.slice();
  next[next.length - 1] = { ...last, text: last.text.trimEnd() };
  return next;
}

function resolveOverlapsForward(words: WordTiming[], duration: number): WordTiming[] {
  if (words.length === 0) return words;
  const result = words.map((w) => ({ ...w }));
  for (let i = 1; i < result.length; i++) {
    if (result[i].begin < result[i - 1].end) {
      const overlap = result[i - 1].end - result[i].begin;
      result[i] = { ...result[i], begin: result[i].begin + overlap, end: result[i].end + overlap };
    }
  }
  const last = result[result.length - 1];
  if (last.end > duration) {
    const overflow = last.end - duration;
    result[result.length - 1] = { ...last, begin: Math.max(0, last.begin - overflow), end: duration };
  }
  return result;
}

function findInsertionSlot(
  existingWords: WordTiming[],
  preferredTime: number,
  desiredDuration: number,
  audioDuration: number,
  minDuration: number = DEFAULT_MIN_WORD_DURATION,
): { begin: number; end: number } | null {
  const sorted = existingWords.toSorted((a, b) => a.begin - b.begin);

  let gapStart = 0;
  let gapEnd = audioDuration;

  for (let i = 0; i < sorted.length; i++) {
    const word = sorted[i];
    if (preferredTime >= word.begin && preferredTime < word.end) {
      gapStart = word.end;
      const next = sorted[i + 1];
      gapEnd = next ? next.begin : audioDuration;
      break;
    }
    if (preferredTime < word.begin) {
      gapEnd = word.begin;
      break;
    }
    gapStart = word.end;
    gapEnd = audioDuration;
  }

  const gapSize = gapEnd - gapStart;
  if (gapSize < minDuration) return null;

  const actualDuration = Math.min(desiredDuration, gapSize);
  let begin = preferredTime - actualDuration / 2;
  let end = begin + actualDuration;

  if (begin < gapStart) {
    begin = gapStart;
    end = begin + actualDuration;
  }
  if (end > gapEnd) {
    end = gapEnd;
    begin = end - actualDuration;
  }

  return { begin, end };
}

// -- Exports -------------------------------------------------------------------

export { trimTrailingSpaceFromLast, resolveOverlapsForward, findInsertionSlot };
