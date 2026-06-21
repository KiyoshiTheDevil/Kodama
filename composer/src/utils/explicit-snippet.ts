import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";

// -- Types ---------------------------------------------------------------------

interface ExplicitSnippet {
  before: string;
  word: string;
  after: string;
  leadingEllipsis: boolean;
  trailingEllipsis: boolean;
}

// -- Helpers -------------------------------------------------------------------

function findWordCharRange(source: string, wordIndices: number[]): { start: number; end: number } | null {
  if (wordIndices.length === 0) return null;
  const { parts } = splitIntoWordsWithMeta(source);
  const minIndex = Math.min(...wordIndices);
  const maxIndex = Math.max(...wordIndices);
  if (minIndex < 0 || maxIndex >= parts.length) return null;
  let cursor = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i < parts.length; i++) {
    const partStart = source.indexOf(parts[i], cursor);
    if (partStart === -1) return null;
    const partEnd = partStart + parts[i].length;
    if (i === minIndex) start = partStart;
    if (i === maxIndex) end = partEnd;
    cursor = partEnd;
  }
  if (start === -1 || end === -1) return null;
  return { start, end };
}

function getExplicitSnippet(source: string, wordIndices: number[], max: number): ExplicitSnippet | null {
  const range = findWordCharRange(source, wordIndices);
  if (!range) return null;
  const { start, end } = range;
  const wordLen = end - start;

  if (source.length <= max || wordLen >= max) {
    return {
      before: source.slice(0, start),
      word: source.slice(start, end),
      after: source.slice(end),
      leadingEllipsis: false,
      trailingEllipsis: false,
    };
  }

  const remaining = max - wordLen;
  const beforeBudget = Math.floor(remaining * 0.35);
  const afterBudget = remaining - beforeBudget;

  let beforeStart = Math.max(0, start - beforeBudget);
  let afterEnd = Math.min(source.length, end + afterBudget);

  if (beforeStart === 0) {
    const usedBefore = start;
    const extra = beforeBudget - usedBefore;
    afterEnd = Math.min(source.length, afterEnd + extra);
  }
  if (afterEnd === source.length) {
    const usedAfter = source.length - end;
    const extra = afterBudget - usedAfter;
    beforeStart = Math.max(0, beforeStart - extra);
  }

  return {
    before: source.slice(beforeStart, start),
    word: source.slice(start, end),
    after: source.slice(end, afterEnd),
    leadingEllipsis: beforeStart > 0,
    trailingEllipsis: afterEnd < source.length,
  };
}

// -- Exports -------------------------------------------------------------------

export { getExplicitSnippet };
