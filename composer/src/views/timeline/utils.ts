import { instanceBounds } from "@/domain/instance/bounds";
import { isLinked } from "@/domain/instance/predicates";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { getEffectiveLines } from "@/domain/line/effective-words";
import { isLineSynced, isWordSynced } from "@/domain/line/predicates";
import type { LyricLine } from "@/domain/line/model";
import type { WordSelection } from "@/domain/selection/model";
import type { WordTiming } from "@/domain/word/timing";
import { formatTime as formatTimeBase } from "@/utils/format-time";
import { expandSelectionToGroupmates } from "@/domain/word/syllable-groups";
import { distributeWordsInLine } from "@/utils/sync-helpers";
import { findWordsAtTime } from "@/views/timeline/word-at-playhead";

// -- Functions -----------------------------------------------------------------

// Distributed lines are word-synced: the per-line span lives in `words`, not in
// line-level begin/end. Emitting both would produce an invalid both-state line.
function distributeLinesTiming<T extends { id: string; text: string }>(
  lines: T[],
  duration: number,
): (T & { words: WordTiming[] })[] {
  if (lines.length === 0) return [];

  const lineDuration = duration / lines.length;

  return lines.map((line, index) => {
    const begin = index * lineDuration;
    const end = (index + 1) * lineDuration;
    return {
      ...line,
      words: distributeWordsInLine(line.text, begin, end),
    };
  });
}

const formatTime = (seconds: number) => formatTimeBase(seconds, 2);

function findWordAtTime(lines: LyricLine[], time: number): WordSelection | null {
  return findWordsAtTime(lines, time)[0] ?? null;
}

interface GroupHeaderRow {
  kind: "group-header";
  groupId: string;
  instanceIdx: number;
  lineCount: number;
  instanceStart: number;
  instanceEnd: number;
  firstLineId: string;
}

interface LineEffectiveRow {
  kind: "line";
  line: LyricLine;
  lineIndex: number;
}

type EffectiveRow = GroupHeaderRow | LineEffectiveRow;

function getEffectiveRows(lines: LyricLine[]): EffectiveRow[] {
  const effective = getEffectiveLines(lines);
  const rows: EffectiveRow[] = [];
  let bufferStart = 0;
  let currentKey: string | null = null;

  const flushBuffer = (endExclusive: number) => {
    if (bufferStart >= endExclusive) return;
    const slice = effective.slice(bufferStart, endExclusive);
    const first = slice[0];

    if (isLinked(first)) {
      const bounds = instanceBounds(slice);
      if (bounds) {
        rows.push({
          kind: "group-header",
          groupId: first.groupId,
          instanceIdx: first.instanceIdx,
          lineCount: slice.length,
          instanceStart: bounds.begin,
          instanceEnd: bounds.end,
          firstLineId: first.id,
        });
      }
    }
    for (let i = 0; i < slice.length; i++) {
      rows.push({ kind: "line", line: slice[i], lineIndex: bufferStart + i });
    }
  };

  for (let i = 0; i < effective.length; i++) {
    const line = effective[i];
    const key = isLinked(line) ? `${line.groupId}:${line.instanceIdx}` : null;
    if (key !== currentKey) {
      flushBuffer(i);
      bufferStart = i;
      currentKey = key;
    }
  }
  flushBuffer(effective.length);

  return rows;
}

interface WordSelectionRef {
  lineId: string;
  lineIndex: number;
  wordIndex: number;
  type: "word" | "bg";
}

function getWordsInInstance(lines: LyricLine[], groupId: string, instanceIdx: number): WordSelectionRef[] {
  const out: WordSelectionRef[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.groupId !== groupId || line.instanceIdx !== instanceIdx) continue;
    if (line.words?.length) {
      for (let wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
        out.push({ lineId: line.id, lineIndex, wordIndex, type: "word" });
      }
    }
    if (line.backgroundWords?.length) {
      for (let wordIndex = 0; wordIndex < line.backgroundWords.length; wordIndex++) {
        out.push({ lineId: line.id, lineIndex, wordIndex, type: "bg" });
      }
    }
  }
  return out;
}

interface RowLayoutInput {
  lines: LyricLine[];
  rowHeights: Record<string, number>;
  defaultRowHeight: number;
  collapsedInstances: Record<string, boolean>;
  waveformHeight: number;
  bgDropZoneHeight: number;
  groupHeaderHeight: number;
}

interface RowPosition {
  top: number;
  height: number;
}

interface RowLayout {
  lineTops: Map<string, RowPosition>;
  headerTops: Map<string, RowPosition>;
}

function computeRowLayout({
  lines,
  rowHeights,
  defaultRowHeight,
  collapsedInstances,
  waveformHeight,
  bgDropZoneHeight,
  groupHeaderHeight,
}: RowLayoutInput): RowLayout {
  const lineTops = new Map<string, RowPosition>();
  const headerTops = new Map<string, RowPosition>();
  let rowTop = waveformHeight;
  let lastInstanceKey: string | null = null;

  for (const line of lines) {
    const inst = isLinked(line) ? `${line.groupId}:${line.instanceIdx}` : null;

    if (inst !== lastInstanceKey && inst !== null) {
      headerTops.set(inst, { top: rowTop, height: groupHeaderHeight });
      rowTop += groupHeaderHeight;
    }
    lastInstanceKey = inst;

    const isCollapsed = inst !== null && collapsedInstances[inst];
    if (isCollapsed) continue;

    const mainHeight = rowHeights[line.id] ?? defaultRowHeight;
    const hasBg = line.backgroundWords && line.backgroundWords.length > 0;
    const rowHeight = mainHeight + (hasBg ? mainHeight : bgDropZoneHeight) + 1;
    lineTops.set(line.id, { top: rowTop, height: rowHeight });
    rowTop += rowHeight;
  }

  return { lineTops, headerTops };
}

// -- Nudge helpers -------------------------------------------------------------

interface NudgeSelection {
  lineId: string;
  type: "word" | "bg";
  wordIndex: number;
}

interface NudgeUpdate {
  id: string;
  updates: Partial<LyricLine>;
}

interface NudgeResult {
  appliedDelta: number;
  updates: NudgeUpdate[];
}

interface PartitionedSelections {
  wordSynced: NudgeSelection[];
  lineSynced: NudgeSelection[];
}

function partitionNudgeSelections(
  rawLines: LyricLine[],
  selections: ReadonlyArray<NudgeSelection>,
): PartitionedSelections {
  const linesById = new Map<string, LyricLine>();
  for (const l of rawLines) linesById.set(l.id, l);
  const wordSyncedSeen = new Set<string>();
  const wordSynced: NudgeSelection[] = [];
  const lineSynced: NudgeSelection[] = [];
  const seenLineSyncedIds = new Set<string>();

  const pushWordSynced = (sel: NudgeSelection, line: LyricLine) => {
    const wordsArray = sel.type === "bg" ? line.backgroundWords : line.words;
    if (!wordsArray) return;
    const expanded = expandSelectionToGroupmates(wordsArray, [sel.wordIndex]);
    for (const idx of expanded) {
      const key = `${sel.lineId}:${sel.type}:${idx}`;
      if (wordSyncedSeen.has(key)) continue;
      wordSyncedSeen.add(key);
      wordSynced.push({ lineId: sel.lineId, type: sel.type, wordIndex: idx });
    }
  };

  for (const sel of selections) {
    const line = linesById.get(sel.lineId);
    if (!line) continue;
    if (sel.type === "bg") {
      pushWordSynced(sel, line);
      continue;
    }
    if (isWordSynced(line)) {
      pushWordSynced(sel, line);
    } else if (isLineSynced(line)) {
      if (seenLineSyncedIds.has(sel.lineId)) continue;
      seenLineSyncedIds.add(sel.lineId);
      lineSynced.push(sel);
    }
  }
  return { wordSynced, lineSynced };
}

// Runs both nudgeSelectedWords and shiftLineSyncedRows under a single shared
// clamp so that mixed instances (some line-synced rows + some word-synced rows
// in the same selection) move uniformly. Without this, the two helpers would
// each compute their own clamp and could apply different deltas, producing
// asymmetric instance shifts that stretch the group banner.
function shiftSelectionsTogether(
  rawLines: LyricLine[],
  partitioned: PartitionedSelections,
  requestedDelta: number,
  duration: number,
): NudgeResult {
  if (requestedDelta === 0) return { appliedDelta: 0, updates: [] };
  const wordHasSelection = partitioned.wordSynced.length > 0;
  const lineHasSelection = partitioned.lineSynced.length > 0;
  if (!wordHasSelection && !lineHasSelection) return { appliedDelta: 0, updates: [] };
  const direction = requestedDelta < 0 ? -1 : 1;

  const wordProbe = nudgeSelectedWords(rawLines, partitioned.wordSynced, requestedDelta, duration);
  const lineProbe = shiftLineSyncedRows(rawLines, partitioned.lineSynced, requestedDelta, duration);
  const wordMag = wordHasSelection ? Math.abs(wordProbe.appliedDelta) : Number.POSITIVE_INFINITY;
  const lineMag = lineHasSelection ? Math.abs(lineProbe.appliedDelta) : Number.POSITIVE_INFINITY;
  const unifiedMag = Math.min(wordMag, lineMag, Math.abs(requestedDelta));
  if (unifiedMag === 0) return { appliedDelta: 0, updates: [] };

  const unifiedDelta = direction * unifiedMag;

  const wordFinal =
    !wordHasSelection || Math.abs(wordProbe.appliedDelta) === unifiedMag
      ? wordProbe
      : nudgeSelectedWords(rawLines, partitioned.wordSynced, unifiedDelta, duration);
  const lineFinal =
    !lineHasSelection || Math.abs(lineProbe.appliedDelta) === unifiedMag
      ? lineProbe
      : shiftLineSyncedRows(rawLines, partitioned.lineSynced, unifiedDelta, duration);

  return { appliedDelta: unifiedDelta, updates: [...wordFinal.updates, ...lineFinal.updates] };
}

function shiftLineSyncedRows(
  rawLines: LyricLine[],
  selections: ReadonlyArray<NudgeSelection>,
  requestedDelta: number,
  duration: number,
): NudgeResult {
  if (selections.length === 0 || requestedDelta === 0) {
    return { appliedDelta: 0, updates: [] };
  }
  const direction = requestedDelta < 0 ? -1 : 1;
  let allowedMagnitude = Math.abs(requestedDelta);
  const targets: LyricLine[] = [];
  const linesById = new Map<string, LyricLine>();
  for (const l of rawLines) linesById.set(l.id, l);
  for (const sel of selections) {
    const line = linesById.get(sel.lineId);
    if (!line || line.begin === undefined || line.end === undefined) continue;
    targets.push(line);
    const headroom = direction < 0 ? line.begin : duration - line.end;
    if (headroom < allowedMagnitude) allowedMagnitude = headroom;
    if (allowedMagnitude <= 0) return { appliedDelta: 0, updates: [] };
  }
  if (targets.length === 0) return { appliedDelta: 0, updates: [] };
  const appliedDelta = direction * allowedMagnitude;
  const updates: NudgeUpdate[] = targets.map((line) => ({
    id: line.id,
    updates: { begin: (line.begin as number) + appliedDelta, end: (line.end as number) + appliedDelta },
  }));
  return { appliedDelta, updates };
}

function nudgeSelectedWords(
  lines: LyricLine[],
  selections: ReadonlyArray<NudgeSelection>,
  requestedDelta: number,
  duration: number,
): NudgeResult {
  if (selections.length === 0 || requestedDelta === 0) {
    return { appliedDelta: 0, updates: [] };
  }

  type Group = { line: LyricLine; type: "word" | "bg"; indices: Set<number> };
  const groups = new Map<string, Group>();
  const linesById = new Map<string, LyricLine>();
  for (const l of lines) linesById.set(l.id, l);
  for (const sel of selections) {
    const line = linesById.get(sel.lineId);
    if (!line) continue;
    const wordsArray = sel.type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray || wordsArray[sel.wordIndex] === undefined) continue;
    const key = `${sel.lineId}:${sel.type}`;
    let group = groups.get(key);
    if (!group) {
      group = { line, type: sel.type, indices: new Set() };
      groups.set(key, group);
    }
    group.indices.add(sel.wordIndex);
  }

  if (groups.size === 0) return { appliedDelta: 0, updates: [] };

  const direction = requestedDelta < 0 ? -1 : 1;
  let allowedMagnitude = Math.abs(requestedDelta);

  for (const group of groups.values()) {
    const wordsArray = (group.type === "word" ? group.line.words : group.line.backgroundWords) as WordTiming[];
    for (const idx of group.indices) {
      const word = wordsArray[idx];
      let headroom: number;
      if (direction < 0) {
        let prevEnd = 0;
        for (let i = idx - 1; i >= 0; i--) {
          if (!group.indices.has(i)) {
            prevEnd = wordsArray[i].end;
            break;
          }
        }
        headroom = word.begin - prevEnd;
      } else {
        let nextBegin = duration;
        for (let i = idx + 1; i < wordsArray.length; i++) {
          if (!group.indices.has(i)) {
            nextBegin = wordsArray[i].begin;
            break;
          }
        }
        headroom = nextBegin - word.end;
      }
      if (headroom < allowedMagnitude) allowedMagnitude = headroom;
      if (allowedMagnitude <= 0) return { appliedDelta: 0, updates: [] };
    }
  }

  const appliedDelta = direction * allowedMagnitude;
  const updates: NudgeUpdate[] = [];
  for (const group of groups.values()) {
    const wordsArray = (group.type === "word" ? group.line.words : group.line.backgroundWords) as WordTiming[];
    const updatedWords = wordsArray.map((w, i) =>
      group.indices.has(i) ? { ...w, begin: w.begin + appliedDelta, end: w.end + appliedDelta } : w,
    );
    updates.push({
      id: group.line.id,
      updates: group.type === "word" ? { words: updatedWords } : manualBackgroundWordEdit(updatedWords),
    });
  }

  return { appliedDelta, updates };
}

// -- Exports -------------------------------------------------------------------

export {
  distributeWordsInLine,
  distributeLinesTiming,
  formatTime,
  findWordAtTime,
  getEffectiveRows,
  getWordsInInstance,
  computeRowLayout,
  nudgeSelectedWords,
  partitionNudgeSelections,
  shiftLineSyncedRows,
  shiftSelectionsTogether,
};
export type { EffectiveRow, GroupHeaderRow, RowLayout };
