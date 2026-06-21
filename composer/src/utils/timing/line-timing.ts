import type { LyricLine } from "@/domain/line/model";

type UpdateLineWithHistory = (
  id: string,
  updates: Partial<LyricLine>,
  options?: { propagateToSiblings?: boolean },
) => void;

function nudgeLineBegin(
  lines: LyricLine[],
  lineIdx: number,
  delta: number,
  updateLineWithHistory: UpdateLineWithHistory,
) {
  const line = lines[lineIdx];
  if (line?.begin === undefined) return;

  const newBegin = Math.max(0, line.begin + delta);
  const duration = line.end - line.begin;
  updateLineWithHistory(line.id, { begin: newBegin, end: newBegin + duration }, { propagateToSiblings: false });
}

function setLineBegin(
  lines: LyricLine[],
  lineIdx: number,
  newBegin: number,
  updateLineWithHistory: UpdateLineWithHistory,
) {
  const line = lines[lineIdx];
  if (line?.begin === undefined) return;

  const duration = line.end - line.begin;
  updateLineWithHistory(line.id, { begin: newBegin, end: newBegin + duration }, { propagateToSiblings: false });
}

export { nudgeLineBegin, setLineBegin };
