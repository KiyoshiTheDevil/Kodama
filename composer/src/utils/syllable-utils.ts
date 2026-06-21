import type { WordTiming } from "@/domain/word/timing";

// -- Helpers ------------------------------------------------------------------

function distributeTiming(text: string, splitPoints: number[], begin: number, end: number): WordTiming[] {
  const parts: string[] = [];
  let lastIdx = 0;

  const sortedPoints = splitPoints.toSorted((a, b) => a - b);
  for (const point of sortedPoints) {
    if (point > lastIdx && point < text.length) {
      parts.push(text.slice(lastIdx, point));
      lastIdx = point;
    }
  }
  parts.push(text.slice(lastIdx));

  const duration = end - begin;
  const charDuration = duration / text.length;

  let currentBegin = begin;
  return parts.map((part) => {
    const partEnd = currentBegin + part.length * charDuration;
    const timing: WordTiming = {
      text: part,
      begin: currentBegin,
      end: partEnd,
    };
    currentBegin = partEnd;
    return timing;
  });
}

// -- Exports ------------------------------------------------------------------

export { distributeTiming };
