import { instanceBounds } from "@/domain/instance/bounds";
import type { LineTemplate } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { fillEmptyLinesWithInstance } from "@/views/timeline/fill-empty-lines-with-instance";

// -- Types --------------------------------------------------------------------

interface PlacementFill {
  kind: "fill";
  updatedLines: LyricLine[];
  instanceIdx: number;
}

interface PlacementInsert {
  kind: "insert";
  instanceStart: number;
  insertAtIndex: number;
}

interface PlacementFallback {
  kind: "fallback";
  reason: "playhead-inside-line" | "gap-too-small" | "past-last-line";
}

type Placement = PlacementFill | PlacementInsert | PlacementFallback;

// -- Pure helpers --------------------------------------------------------------

function templateDuration(template: LineTemplate[]): number {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const tpl of template) {
    if (tpl.words?.length) {
      for (const w of tpl.words) {
        if (w.relativeBegin < start) start = w.relativeBegin;
        if (w.relativeEnd > end) end = w.relativeEnd;
      }
    }
    if (tpl.backgroundWords?.length) {
      for (const w of tpl.backgroundWords) {
        if (w.relativeBegin < start) start = w.relativeBegin;
        if (w.relativeEnd > end) end = w.relativeEnd;
      }
    }
    if (tpl.relativeBegin !== undefined && tpl.relativeBegin < start) start = tpl.relativeBegin;
    if (tpl.relativeEnd !== undefined && tpl.relativeEnd > end) end = tpl.relativeEnd;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function lineTimeRange(line: LyricLine): { begin: number; end: number } | null {
  return instanceBounds([line]);
}

interface DecideInput {
  lines: ReadonlyArray<LyricLine>;
  groupId: string;
  template: LineTemplate[];
  playheadTime: number;
}

// Decide where an Add-Instance-At-Playhead action should land.
//
// Resolution order (mirrors paste-as-instance):
//   1. **Fill**: if there are template.length consecutive empty fillable rows
//      starting at the natural target row (first row after the last timed line
//      ending at or before the playhead, or row 0 if no such line), fill them
//      in place. Empty fillable = no groupId AND no words.
//   2. **Insert**: if the playhead falls in a clean time gap large enough to
//      fit the template duration, insert new rows there.
//   3. **Fallback**: playhead is inside an existing line, the gap is too
//      small, or the playhead is past the last timed line. Caller should
//      route into the paste-preview clipboard flow.
//
// Untimed lines (no words, no begin/end) are skipped when computing time
// neighbors but are valid fill candidates if `isEmptyFillable`.
function decideAddInstancePlacement({ lines, groupId, template, playheadTime }: DecideInput): Placement {
  const duration = templateDuration(template);

  // Build a list of timed-line entries with their original list index, sorted by time
  const timed: Array<{ index: number; begin: number; end: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const range = lineTimeRange(lines[i]);
    if (!range) continue;
    timed.push({ index: i, begin: range.begin, end: range.end });
  }
  timed.sort((a, b) => a.begin - b.begin);

  // Find the natural fill anchor: first row after the last timed line ending
  // at or before the playhead. If no timed line precedes the playhead, anchor = 0.
  let prevTimedListIndex = -1;
  for (const t of timed) {
    if (t.end <= playheadTime) prevTimedListIndex = Math.max(prevTimedListIndex, t.index);
  }
  const fillAnchor = prevTimedListIndex + 1;

  // 1. Try the fill path first (same primary behavior as paste-as-instance).
  if (template.length > 0 && fillAnchor + template.length <= lines.length) {
    const fill = fillEmptyLinesWithInstance({
      lines: lines as LyricLine[],
      groupId,
      template,
      startIndex: fillAnchor,
      instanceStart: playheadTime,
    });
    if (fill.ok && fill.updatedLines && fill.instanceIdx !== undefined) {
      return { kind: "fill", updatedLines: fill.updatedLines, instanceIdx: fill.instanceIdx };
    }
  }

  // Empty project (no timed lines) and no fill path: insert at start.
  if (timed.length === 0) {
    return { kind: "insert", instanceStart: playheadTime, insertAtIndex: 0 };
  }

  // 2. Try insert in a clean time gap.
  for (const t of timed) {
    if (playheadTime >= t.begin && playheadTime <= t.end) {
      return { kind: "fallback", reason: "playhead-inside-line" };
    }
  }
  const lastTimed = timed[timed.length - 1];
  if (playheadTime > lastTimed.end) {
    return { kind: "fallback", reason: "past-last-line" };
  }

  let prev: { index: number; begin: number; end: number } | null = null;
  let next: { index: number; begin: number; end: number } | null = null;
  for (const t of timed) {
    if (t.end <= playheadTime) prev = t;
    if (t.begin >= playheadTime && next === null) {
      next = t;
      break;
    }
  }

  const gapEnd = next ? next.begin : Number.POSITIVE_INFINITY;
  const fitsInGap = playheadTime + duration <= gapEnd;
  if (!fitsInGap) {
    return { kind: "fallback", reason: "gap-too-small" };
  }

  const insertAtIndex = prev !== null ? prev.index + 1 : 0;
  return { kind: "insert", instanceStart: playheadTime, insertAtIndex };
}

// -- Exports ------------------------------------------------------------------

export { decideAddInstancePlacement, templateDuration };
