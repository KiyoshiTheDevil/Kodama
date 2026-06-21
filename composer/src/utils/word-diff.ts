import type { WordTiming } from "@/domain/word/timing";
import { stripSplitCharacter } from "@/utils/split-character";
import { synthesizeBracketedWord } from "@/utils/word-timing";

// Normalizes a word's text for diff comparison: strips split characters and
// trailing whitespace so "love" matches "love " etc.
function wordKey(text: string): string {
  return stripSplitCharacter(text).trim();
}

// Standard longest-common-subsequence pairs. Returns [(beforeIdx, afterIdx), ...]
// in ascending order. Used to align unchanged words across a source structural edit.
function lcsPairs<T>(a: T[], b: T[]): Array<[number, number]> {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return [];
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return pairs;
}

function proportionalRemap(sourceAfter: WordTiming[], siblingWords: WordTiming[]): WordTiming[] | null {
  if (sourceAfter.length === 0 || siblingWords.length === 0) return null;
  const sourceStart = Math.min(...sourceAfter.map((w) => w.begin));
  const sourceEnd = Math.max(...sourceAfter.map((w) => w.end));
  const sourceSpan = sourceEnd - sourceStart;
  if (sourceSpan <= 0) return null;
  const siblingStart = Math.min(...siblingWords.map((w) => w.begin));
  const siblingEnd = Math.max(...siblingWords.map((w) => w.end));
  const siblingSpan = siblingEnd - siblingStart;
  if (siblingSpan <= 0) return null;
  return sourceAfter.map((w) => ({
    text: w.text,
    begin: siblingStart + ((w.begin - sourceStart) / sourceSpan) * siblingSpan,
    end: siblingStart + ((w.end - sourceStart) / sourceSpan) * siblingSpan,
    ...(w.explicit ? { explicit: true as const } : {}),
  }));
}

// Diff-based propagation that preserves sibling timing for words that didn't
// structurally change. Words that were split/merged get their slot derived from
// the sibling slot they replace, distributed proportionally per source-after's
// chosen ratios.
//
// Returns null when sibling has structurally diverged from sourceBefore (different
// word count). Caller should fall back to proportional remap or handle separately.
function applySiblingWords(
  sourceAfter: WordTiming[] | undefined,
  sourceBefore: WordTiming[] | undefined,
  siblingWords: WordTiming[] | undefined,
): WordTiming[] | null {
  if (!sourceAfter || !sourceBefore || !siblingWords) return null;
  if (sourceAfter.length === 0) return [];
  if (siblingWords.length !== sourceBefore.length) {
    // Sibling already diverged from source-before; can't align reliably.
    return proportionalRemap(sourceAfter, siblingWords);
  }

  const beforeKeys = sourceBefore.map((w) => wordKey(w.text));
  const afterKeys = sourceAfter.map((w) => wordKey(w.text));

  const matchedBefore: Array<number | null> = new Array(sourceAfter.length).fill(null);
  for (const [b, a] of lcsPairs(beforeKeys, afterKeys)) {
    matchedBefore[a] = b;
  }

  const result: WordTiming[] = new Array(sourceAfter.length);
  let i = 0;
  let lastMatchedBefore = -1;

  while (i < sourceAfter.length) {
    if (matchedBefore[i] !== null) {
      const bIdx = matchedBefore[i] as number;
      const { explicit: _siblingExplicit, ...siblingBase } = siblingWords[bIdx];
      result[i] = {
        ...siblingBase,
        text: sourceAfter[i].text,
        ...(sourceAfter[i].explicit ? { explicit: true as const } : {}),
      };
      lastMatchedBefore = bIdx;
      i++;
      continue;
    }

    let runEnd = i;
    while (runEnd < sourceAfter.length && matchedBefore[runEnd] === null) runEnd++;
    const nextMatchedBefore = runEnd < sourceAfter.length ? (matchedBefore[runEnd] as number) : sourceBefore.length;

    const bRangeStart = lastMatchedBefore + 1;
    const bRangeEnd = nextMatchedBefore;

    let slotStart: number;
    let slotEnd: number;

    if (bRangeStart < bRangeEnd) {
      slotStart = siblingWords[bRangeStart].begin;
      slotEnd = siblingWords[bRangeEnd - 1].end;
    } else {
      const prevEnd = lastMatchedBefore >= 0 ? siblingWords[lastMatchedBefore].end : 0;
      const nextBegin = nextMatchedBefore < siblingWords.length ? siblingWords[nextMatchedBefore].begin : prevEnd;
      slotStart = prevEnd;
      slotEnd = Math.max(prevEnd, nextBegin);
    }

    const sourceSegStart = sourceAfter[i].begin;
    const sourceSegEnd = sourceAfter[runEnd - 1].end;
    const sourceSegSpan = sourceSegEnd - sourceSegStart;
    const slotSpan = slotEnd - slotStart;
    const runLen = runEnd - i;

    const leftBracket = lastMatchedBefore >= 0 ? siblingWords[lastMatchedBefore] : undefined;
    const rightBracket = nextMatchedBefore < siblingWords.length ? siblingWords[nextMatchedBefore] : undefined;

    for (let k = i; k < runEnd; k++) {
      const w = sourceAfter[k];
      let begin: number;
      let end: number;
      if (sourceSegSpan > 0 && slotSpan > 0) {
        begin = slotStart + ((w.begin - sourceSegStart) / sourceSegSpan) * slotSpan;
        end = slotStart + ((w.end - sourceSegStart) / sourceSegSpan) * slotSpan;
      } else if (slotSpan > 0) {
        const each = slotSpan / runLen;
        begin = slotStart + each * (k - i);
        end = slotStart + each * (k - i + 1);
      } else {
        begin = slotStart;
        end = slotStart;
      }
      result[k] = synthesizeBracketedWord({
        text: w.text,
        begin,
        end,
        leftBracket,
        rightBracket,
        explicit: w.explicit ?? false,
      });
    }

    i = runEnd;
  }

  return result;
}

interface LineWithWords {
  id: string;
  groupId?: string;
  templateLineIdx?: number;
  detached?: boolean;
  words?: WordTiming[];
  backgroundWords?: WordTiming[];
}

// Returns true if applying the smart-sync algorithm would produce a different
// per-word timing than the naive proportional remap for at least one linked
// sibling. When false, both algorithms coincide so the modal can be skipped
// (no risk of silently retiming unchanged words).
function wouldDivergenceCauseRetiming(
  lines: LineWithWords[],
  sourceId: string,
  newWords: WordTiming[],
  field: "words" | "backgroundWords" = "words",
): boolean {
  const source = lines.find((l) => l.id === sourceId);
  if (!source) return false;
  const sourceBefore = source[field];
  if (!sourceBefore || sourceBefore.length === newWords.length) return false;
  if (source.groupId === undefined || source.templateLineIdx === undefined) return false;

  for (const sibling of lines) {
    if (sibling.id === sourceId) continue;
    if (sibling.groupId !== source.groupId) continue;
    if (sibling.templateLineIdx !== source.templateLineIdx) continue;
    if (sibling.detached) continue;
    const siblingWords = sibling[field];
    if (!siblingWords || siblingWords.length === 0) continue;

    const smart = applySiblingWords(newWords, sourceBefore, siblingWords);
    const naive = proportionalRemap(newWords, siblingWords);
    if (!wordsDeepEqual(smart, naive)) return true;
  }
  return false;
}

function wordsDeepEqual(a: WordTiming[] | null, b: WordTiming[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i].text) return false;
    if (Math.abs(a[i].begin - b[i].begin) > 1e-9) return false;
    if (Math.abs(a[i].end - b[i].end) > 1e-9) return false;
  }
  return true;
}

// -- Exports ------------------------------------------------------------------

export { applySiblingWords, lcsPairs, proportionalRemap, wordKey, wordsDeepEqual, wouldDivergenceCauseRetiming };
