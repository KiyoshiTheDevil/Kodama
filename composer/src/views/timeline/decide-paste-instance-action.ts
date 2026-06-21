import type { LineTemplate } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { fillEmptyLinesWithInstance } from "@/views/timeline/fill-empty-lines-with-instance";

type PasteInstanceDecision =
  | { kind: "no-target" }
  | { kind: "fill"; updatedLines: LyricLine[]; instanceIdx: number }
  | { kind: "needs-confirm-insert"; insertAt: number; instanceStart: number };

interface DecideInput {
  lines: LyricLine[];
  groupId: string;
  template: LineTemplate[];
  hoveredLineIndex: number;
  cursorTime: number;
}

function decidePasteInstanceAction({
  lines,
  groupId,
  template,
  hoveredLineIndex,
  cursorTime,
}: DecideInput): PasteInstanceDecision {
  if (hoveredLineIndex < 0) return { kind: "no-target" };
  const instanceStart = Math.max(0, cursorTime);
  const fill = fillEmptyLinesWithInstance({
    lines,
    groupId,
    template,
    startIndex: hoveredLineIndex,
    instanceStart,
  });
  if (fill.ok) {
    return { kind: "fill", updatedLines: fill.updatedLines!, instanceIdx: fill.instanceIdx ?? 0 };
  }
  return { kind: "needs-confirm-insert", insertAt: hoveredLineIndex, instanceStart };
}

export { decidePasteInstanceAction };
