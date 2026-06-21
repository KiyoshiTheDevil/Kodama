import { extractLinkedFields, getLinkScope, isLinkedSibling } from "@/domain/group/linking";
import { propagateWordChanges } from "@/domain/group/smart-sync";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { type LooseLine, reconcileLine } from "@/domain/line/model";
import { withDerivedText } from "@/domain/line/reconstruct-text";
import { closeIntraGroupGaps, expandSelectionToGroupmates } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { commitHistory } from "@/stores/project/history-helpers";
import {
  applyMarkWordsExplicit,
  applyMergeSyllableGroup,
  applyMoveFromBg,
  applyMoveToBg,
} from "@/stores/project/lines-slice-helpers";
import { applySyllableSplitToLines } from "@/stores/project/syllable-split-helpers";
import type { LineActions, LinesState, ProjectStore } from "@/stores/project/types";
import { getSplitCharacter } from "@/utils/split-character";
import { applySiblingWords } from "@/utils/word-diff";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createLinesInitialState(): LinesState {
  return {
    lines: [],
  };
}

// -- Slice --------------------------------------------------------------------

const createLinesSlice: StateCreator<ProjectStore, [], [], LinesState & LineActions> = (set, get) => ({
  ...createLinesInitialState(),

  setLines: (lines) => set({ lines, isDirty: true, isDirtySinceHistory: true }),

  setLinesWithHistory: (lines, groups) => set((state) => commitHistory(state, groups ? { lines, groups } : { lines })),

  updateLine: (id, updates, options = {}) =>
    set((state) => {
      const splitChar = getSplitCharacter();
      const deriveText = options.deriveText ?? true;
      return {
        lines: state.lines.map((line) => {
          if (line.id !== id) return line;
          const reconciled = reconcileLine({ ...line, ...updates });
          return deriveText ? withDerivedText(reconciled, splitChar) : reconciled;
        }),
        isDirty: true,
        isDirtySinceHistory: true,
      };
    }),

  updateLineWithHistory: (id, updates, options = {}) =>
    set((state) => {
      const { propagateToSiblings = true, ...historyOptions } = options;
      const target = state.lines.find((l) => l.id === id);
      const linkScope = propagateToSiblings && target ? getLinkScope(target) : null;
      const linkedUpdates = linkScope ? extractLinkedFields(updates) : null;
      const sourceWordsBefore = target?.words;
      const sourceWordsAfter = updates.words;
      const sourceBgWordsBefore = target?.backgroundWords;
      const sourceBgWordsAfter = updates.backgroundWords;

      const newLines = state.lines.map((line) => {
        if (line.id === id) {
          return reconcileLine({ ...line, ...updates });
        }
        if (isLinkedSibling(line, linkScope)) {
          const siblingUpdates: Partial<LooseLine> = { ...(linkedUpdates ?? {}) };
          const propagatedWords = propagateWordChanges(sourceWordsAfter, sourceWordsBefore, line.words);
          if (propagatedWords) siblingUpdates.words = propagatedWords;
          const propagatedBg = propagateWordChanges(sourceBgWordsAfter, sourceBgWordsBefore, line.backgroundWords);
          if (propagatedBg) siblingUpdates.backgroundWords = propagatedBg;
          if (Object.keys(siblingUpdates).length > 0) {
            return reconcileLine({ ...line, ...siblingUpdates });
          }
        }
        return line;
      });

      return commitHistory(state, { lines: newLines }, historyOptions);
    }),

  updateLinesWithHistory: (updates, options = {}) =>
    set((state) => {
      const { propagateToSiblings = true, ...historyOptions } = options;
      const newLines = [...state.lines];
      const indexById = new Map<string, number>();
      for (let i = 0; i < newLines.length; i++) indexById.set(newLines[i].id, i);

      for (const { id, updates: lineUpdates } of updates) {
        const targetIdx = indexById.get(id);
        const target = targetIdx !== undefined ? newLines[targetIdx] : undefined;
        const linkScope = propagateToSiblings && target ? getLinkScope(target) : null;
        const sourceWordsBefore = target?.words;
        const sourceWordsAfter = lineUpdates.words;
        const sourceBgBefore = target?.backgroundWords;
        const sourceBgAfter = lineUpdates.backgroundWords;
        const linkedUpdates = linkScope ? extractLinkedFields(lineUpdates) : null;

        if (targetIdx !== undefined && target) {
          newLines[targetIdx] = reconcileLine({ ...target, ...lineUpdates });
        }

        if (linkScope) {
          for (let i = 0; i < newLines.length; i++) {
            const line = newLines[i];
            if (line.id === id) continue;
            if (!isLinkedSibling(line, linkScope)) continue;
            const siblingUpdates: Partial<LooseLine> = { ...(linkedUpdates ?? {}) };
            const propagatedWords = propagateWordChanges(sourceWordsAfter, sourceWordsBefore, line.words);
            if (propagatedWords) siblingUpdates.words = propagatedWords;
            const propagatedBg = propagateWordChanges(sourceBgAfter, sourceBgBefore, line.backgroundWords);
            if (propagatedBg) siblingUpdates.backgroundWords = propagatedBg;
            if (Object.keys(siblingUpdates).length > 0) newLines[i] = reconcileLine({ ...line, ...siblingUpdates });
          }
        }
      }

      return commitHistory(state, { lines: newLines }, historyOptions);
    }),

  moveWordToBg: (lineId, wordIndices, timeDelta, duration) =>
    set((state) => {
      const sourceLine = state.lines.find((l) => l.id === lineId);
      if (!sourceLine?.words || wordIndices.length === 0) return state;
      const sourceWordCount = sourceLine.words.length;
      const linkScope = getLinkScope(sourceLine);

      let mutated = false;
      const newLines = state.lines.map((line) => {
        const isSource = line.id === lineId;
        const isSibling = !isSource && isLinkedSibling(line, linkScope) && line.words?.length === sourceWordCount;
        if (!isSource && !isSibling) return line;
        const expanded = expandSelectionToGroupmates(line.words ?? [], wordIndices);
        const updated = applyMoveToBg(line, expanded, timeDelta, duration);
        if (!updated) return line;
        mutated = true;
        return updated;
      });

      if (!mutated) return state;
      return commitHistory(state, { lines: newLines });
    }),

  moveWordFromBg: (lineId, wordIndices, timeDelta, duration) =>
    set((state) => {
      const sourceLine = state.lines.find((l) => l.id === lineId);
      if (!sourceLine?.backgroundWords || wordIndices.length === 0) return state;
      const sourceBgCount = sourceLine.backgroundWords.length;
      const linkScope = getLinkScope(sourceLine);

      let mutated = false;
      const newLines = state.lines.map((line) => {
        const isSource = line.id === lineId;
        const isSibling =
          !isSource && isLinkedSibling(line, linkScope) && line.backgroundWords?.length === sourceBgCount;
        if (!isSource && !isSibling) return line;
        const expanded = expandSelectionToGroupmates(line.backgroundWords ?? [], wordIndices);
        const updated = applyMoveFromBg(line, expanded, timeDelta, duration);
        if (!updated) return line;
        mutated = true;
        return updated;
      });

      if (!mutated) return state;
      return commitHistory(state, { lines: newLines });
    }),

  applyWordCountChange: (lineId, newWords, field, resolution, extraUpdates = {}) =>
    set((state) => {
      if (resolution === "cancel") return state;
      const target = state.lines.find((l) => l.id === lineId);
      if (!target) return state;

      const sourceBefore = target[field];
      const linkScope = getLinkScope(target);

      if (resolution === "detach") {
        return commitHistory(state, {
          lines: state.lines.map((line) => {
            if (line.id !== lineId) return line;
            return reconcileLine({
              ...line,
              ...extraUpdates,
              [field]: newWords,
              groupId: undefined,
              instanceIdx: undefined,
              templateLineIdx: undefined,
              detached: undefined,
            });
          }),
        });
      }

      const linkedExtras = linkScope ? extractLinkedFields(extraUpdates) : null;

      const newLines = state.lines.map((line) => {
        if (line.id === lineId) {
          return reconcileLine({ ...line, ...extraUpdates, [field]: newWords });
        }
        if (isLinkedSibling(line, linkScope)) {
          const propagated = applySiblingWords(newWords, sourceBefore, line[field]);
          const siblingUpdates: Partial<LooseLine> = { ...(linkedExtras ?? {}) };
          if (propagated) siblingUpdates[field] = propagated;
          if (Object.keys(siblingUpdates).length > 0) return reconcileLine({ ...line, ...siblingUpdates });
        }
        return line;
      });

      return commitHistory(state, { lines: newLines });
    }),

  toggleWordExplicit: (lineId, field, wordIndices) => {
    if (wordIndices.length === 0) return;
    const state = get();
    const target = state.lines.find((l) => l.id === lineId);
    if (!target) return;
    const currentWords = target[field];
    if (!currentWords || currentWords.length === 0) return;

    const filtered = wordIndices.filter((i) => i >= 0 && i < currentWords.length);
    const expanded = expandSelectionToGroupmates(currentWords, filtered).filter((i) => i < currentWords.length);
    const indexSet = new Set(expanded);
    if (indexSet.size === 0) return;

    const allMarked = Array.from(indexSet).every((i) => currentWords[i].explicit === true);
    const nextExplicit = !allMarked;

    const newWords: WordTiming[] = currentWords.map((word, i) => {
      if (!indexSet.has(i)) return word;
      if (nextExplicit) return { ...word, explicit: true };
      const { explicit: _explicit, ...rest } = word;
      return rest;
    });

    const extraUpdates = field === "backgroundWords" ? manualBackgroundWordEdit(newWords) : {};
    get().applyWordCountChange(lineId, newWords, field, "apply", extraUpdates);
  },

  mergeSyllableGroupIntoWord: (lineId, field, wordIndices) =>
    set((state) => {
      const newLines = applyMergeSyllableGroup(state.lines, lineId, field, wordIndices);
      if (!newLines) return state;
      return commitHistory(state, { lines: newLines });
    }),

  snapSyllablesFlush: (lineId, field) =>
    set((state) => {
      const target = state.lines.find((l) => l.id === lineId);
      if (!target) return state;
      const lineWords = target[field];
      if (!lineWords) return state;
      const snapped = closeIntraGroupGaps(lineWords);
      if (snapped === lineWords) return state;
      const lineUpdate = field === "backgroundWords" ? manualBackgroundWordEdit(snapped) : { [field]: snapped };
      const newLines = state.lines.map((l) => (l.id === lineId ? reconcileLine({ ...l, ...lineUpdate }) : l));
      return commitHistory(state, { lines: newLines });
    }),

  markWordsExplicit: (targets, value) =>
    set((state) => {
      const newLines = applyMarkWordsExplicit(state.lines, targets, value);
      if (!newLines) return state;
      return commitHistory(state, { lines: newLines });
    }),

  splitSyllablesAcrossIdenticalWordsWithHistory: ({ source, splitPoints, caseInsensitive }) =>
    set((state) => {
      if (splitPoints.length === 0) return state;
      const newLines = applySyllableSplitToLines(state.lines, source, splitPoints, caseInsensitive);
      if (newLines === state.lines) return state;
      return commitHistory(state, { lines: newLines });
    }),
});

// -- Exports ------------------------------------------------------------------

export { createLinesSlice, createLinesInitialState };
