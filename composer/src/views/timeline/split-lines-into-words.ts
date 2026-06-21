import type { LyricLine } from "@/domain/line/model";
import { isLineSynced } from "@/domain/line/predicates";
import type { WordSelection } from "@/domain/selection/model";
import { useProjectStore } from "@/stores/project";
import { convertLineToWord } from "@/utils/sync-helpers";
import { useTimelineStore } from "@/views/timeline/timeline-store";

// -- Types --------------------------------------------------------------------

interface LineWordsUpdate {
  id: string;
  updates: Partial<LyricLine>;
}

// -- Pure computation ----------------------------------------------------------

function computeSplitIntoWordsUpdates(targetLineIds: Iterable<string>, rawLines: LyricLine[]): LineWordsUpdate[] {
  const rawLinesById = new Map<string, LyricLine>();
  for (const line of rawLines) rawLinesById.set(line.id, line);

  const updates: LineWordsUpdate[] = [];
  for (const id of targetLineIds) {
    const realLine = rawLinesById.get(id);
    if (!realLine || !isLineSynced(realLine)) continue;
    const converted = convertLineToWord(realLine);
    if (converted.words) {
      updates.push({ id, updates: { words: converted.words, begin: undefined, end: undefined } });
    }
  }
  return updates;
}

function computeSplitSelections(updates: LineWordsUpdate[], effectiveLines: LyricLine[]): WordSelection[] {
  const lineIndexById = new Map<string, number>();
  for (let i = 0; i < effectiveLines.length; i++) lineIndexById.set(effectiveLines[i].id, i);

  const selections: WordSelection[] = [];
  for (const update of updates) {
    const lineIndex = lineIndexById.get(update.id);
    if (lineIndex === undefined || !update.updates.words) continue;
    for (let wi = 0; wi < update.updates.words.length; wi++) {
      selections.push({ lineId: update.id, lineIndex, wordIndex: wi, type: "word" });
    }
  }
  return selections;
}

// -- Store-mutating operation --------------------------------------------------

function splitLinesIntoWords(targetLineIds: Iterable<string>, effectiveLines: LyricLine[]): void {
  const projectState = useProjectStore.getState();
  const updates = computeSplitIntoWordsUpdates(targetLineIds, projectState.lines);

  if (updates.length === 1) {
    projectState.updateLineWithHistory(updates[0].id, updates[0].updates);
  } else if (updates.length > 1) {
    projectState.updateLinesWithHistory(updates);
  }

  const newSelections = computeSplitSelections(updates, effectiveLines);
  if (newSelections.length > 0) {
    useTimelineStore.getState().setSelectedWords(newSelections);
  }
}

// -- Exports -------------------------------------------------------------------

export { computeSplitIntoWordsUpdates, computeSplitSelections, splitLinesIntoWords };
