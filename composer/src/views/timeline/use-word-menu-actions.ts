import { CLEARED_BACKGROUND, manualBackgroundWordEdit } from "@/domain/line/background";
import { mergeWordsIntoTrack } from "@/domain/word/merge-track";
import { absorbDeletedSyllablesIntoNeighbors } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { mergeWordText } from "@/utils/word-merge";
import { findInsertionSlot } from "@/utils/word-spaces";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import type { useContextMenuTargets } from "@/views/timeline/use-context-menu-targets";
import { useCallback } from "react";

// -- Interfaces ---------------------------------------------------------------

type ContextMenuTargets = ReturnType<typeof useContextMenuTargets>;

// -- Hook ---------------------------------------------------------------------

function useWordMenuActions(targets: ContextMenuTargets, clearContextMenu: () => void) {
  const { lines, explicitToggleContext, mergeInfo, groupedWordInfo } = targets;
  const contextMenu = useTimelineStore((s) => s.contextMenu);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const toggleWordExplicit = useProjectStore((s) => s.toggleWordExplicit);
  const duration = useAudioStore((s) => s.duration);

  const handleEditWord = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "word") return;
    const { lineId, wordIndex, type } = contextMenu.target;
    useTimelineStore.getState().setEditingWord({ lineId, wordIndex, type });
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handleSplitSyllables = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "word") return;
    const { lineId, wordIndex, type } = contextMenu.target;
    useTimelineStore.getState().setEditingWord(null);
    // Store target info and open syllable splitter via editingWord with a flag
    // For now, use the keyboard shortcut approach - set selection and close menu
    const lineIndex = contextMenu.target.lineIndex;
    useTimelineStore.getState().setSelectedWords([{ lineId, lineIndex, wordIndex, type }]);
    clearContextMenu();
    // Dispatch a custom event so the syllable splitter can pick it up
    window.dispatchEvent(new CustomEvent("timeline:split-syllable"));
  }, [contextMenu, clearContextMenu]);

  const handleSplitWord = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "word") return;
    const { lineId, wordIndex, type } = contextMenu.target;
    useTimelineStore.getState().setEditingWord(null);
    const lineIndex = contextMenu.target.lineIndex;
    useTimelineStore.getState().setSelectedWords([{ lineId, lineIndex, wordIndex, type }]);
    clearContextMenu();
    window.dispatchEvent(new CustomEvent("timeline:split-word"));
  }, [contextMenu, clearContextMenu]);

  const handleToggleExplicit = useCallback(() => {
    if (!explicitToggleContext) return;
    const { lineId, field, indices } = explicitToggleContext;
    toggleWordExplicit(lineId, field, indices);
    clearContextMenu();
  }, [explicitToggleContext, toggleWordExplicit, clearContextMenu]);

  const handleDeleteWord = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "word") return;
    const { lineId, wordIndex, type } = contextMenu.target;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    const wordsArray = type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) return;

    const absorbed = absorbDeletedSyllablesIntoNeighbors(wordsArray, [wordIndex]);
    const remaining = absorbed.filter((_, i) => i !== wordIndex);
    if (type === "word") {
      updateLineWithHistory(lineId, { words: remaining });
    } else {
      updateLineWithHistory(lineId, remaining.length > 0 ? manualBackgroundWordEdit(remaining) : CLEARED_BACKGROUND);
    }
    clearContextMenu();
  }, [contextMenu, lines, updateLineWithHistory, clearContextMenu]);

  const handleAddWordHere = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "track") return;
    const { lineId, time, type } = contextMenu.target;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    const wordDuration = useSettingsStore.getState().defaultWordDuration;
    const existingWords = type === "word" ? line.words : line.backgroundWords;
    const slot = findInsertionSlot(existingWords ?? [], time, wordDuration, duration);
    if (!slot) {
      clearContextMenu();
      return;
    }

    const newWord: WordTiming = { text: "... ", begin: slot.begin, end: slot.end };
    const words = mergeWordsIntoTrack(existingWords ?? [], [newWord]);
    const newIndex = words.findIndex((w) => w.begin === newWord.begin);

    if (type === "word") {
      updateLineWithHistory(lineId, { words });
    } else {
      updateLineWithHistory(lineId, manualBackgroundWordEdit(words));
    }
    useTimelineStore.getState().setEditingWord({ lineId, wordIndex: newIndex, type });
    clearContextMenu();
  }, [contextMenu, lines, duration, updateLineWithHistory, clearContextMenu]);

  const handleMergeSyllables = useCallback(() => {
    if (!groupedWordInfo) return;
    useProjectStore
      .getState()
      .mergeSyllableGroupIntoWord(groupedWordInfo.lineId, groupedWordInfo.field, [groupedWordInfo.wordIndex]);
    clearContextMenu();
  }, [groupedWordInfo, clearContextMenu]);

  const handleSnapSyllables = useCallback(() => {
    if (!groupedWordInfo) return;
    useProjectStore.getState().snapSyllablesFlush(groupedWordInfo.lineId, groupedWordInfo.field);
    clearContextMenu();
  }, [groupedWordInfo, clearContextMenu]);

  const handleMergeWords = useCallback(() => {
    if (!mergeInfo) return;
    const { indices, lineId, type } = mergeInfo;
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;

    const wordsArray = type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) return;

    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const mergedText = mergeWordText(indices.map((idx) => wordsArray[idx].text));
    const merged: WordTiming = {
      text: mergedText,
      begin: wordsArray[firstIdx].begin,
      end: wordsArray[lastIdx].end,
    };

    const updatedWords = [...wordsArray.slice(0, firstIdx), merged, ...wordsArray.slice(lastIdx + 1)];

    updateLineWithHistory(lineId, type === "word" ? { words: updatedWords } : manualBackgroundWordEdit(updatedWords));

    useTimelineStore.getState().clearSelection();
    clearContextMenu();
  }, [mergeInfo, lines, updateLineWithHistory, clearContextMenu]);

  return {
    handleEditWord,
    handleSplitSyllables,
    handleSplitWord,
    handleToggleExplicit,
    handleDeleteWord,
    handleAddWordHere,
    handleMergeSyllables,
    handleSnapSyllables,
    handleMergeWords,
  };
}

// -- Exports ------------------------------------------------------------------

export { useWordMenuActions };
