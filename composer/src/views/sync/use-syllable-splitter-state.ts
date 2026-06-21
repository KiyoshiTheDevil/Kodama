import type { WordTiming } from "@/domain/word/timing";
import { useConfirm } from "@/stores/confirm-store";
import { useProjectStore } from "@/stores/project";
import { buildApplyToAllConfirmOptions } from "@/utils/apply-to-all-confirm-options";
import { findIdenticalWords } from "@/utils/identical-word-matcher";
import { splitWordIntoSyllables } from "@/utils/single-word-syllable-split";
import { useCallback, useMemo, useState } from "react";

// -- Types --------------------------------------------------------------------

interface UseSyllableSplitterStateParams {
  lineId: string;
  type: "word" | "bg";
  word: WordTiming;
  wordIndex: number;
  onSplit: (wordIndex: number, newWords: WordTiming[]) => void;
}

interface UseSyllableSplitterStateResult {
  splitPoints: number[];
  applyToAll: boolean;
  caseInsensitive: boolean;
  identicalCount: number;
  toggleSplit: (index: number) => void;
  setApplyToAll: (next: boolean) => void;
  setCaseInsensitive: (next: boolean) => void;
  confirmSplit: (close: () => void) => Promise<void>;
  cancelSplit: (close: () => void) => void;
}

// -- Hook ---------------------------------------------------------------------

function useSyllableSplitterState({
  lineId,
  type,
  word,
  wordIndex,
  onSplit,
}: UseSyllableSplitterStateParams): UseSyllableSplitterStateResult {
  const initialDefaults = useProjectStore.getState().syllableSplitDefaults;
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [applyToAll, setApplyToAll] = useState(initialDefaults.applyToAll);
  const [caseInsensitive, setCaseInsensitive] = useState(initialDefaults.caseInsensitive);

  const lines = useProjectStore((s) => s.lines);
  const confirm = useConfirm();

  const identicalCount = useMemo(
    () =>
      findIdenticalWords(lines, { lineId, wordIndex, type }, { caseInsensitive, excludeSource: true, splitPoints })
        .length,
    [lines, lineId, wordIndex, type, caseInsensitive, splitPoints],
  );

  const toggleSplit = useCallback((index: number) => {
    setSplitPoints((prev) => (prev.includes(index) ? prev.filter((p) => p !== index) : [...prev, index]));
  }, []);

  const splitSingleWord = useCallback(() => {
    const newWords = splitWordIntoSyllables({ word, splitPoints, reuseGroupId: true });
    onSplit(wordIndex, newWords);
  }, [word, splitPoints, wordIndex, onSplit]);

  const confirmSplit = useCallback(
    async (close: () => void) => {
      const store = useProjectStore.getState();
      store.setSyllableSplitDefaults({ applyToAll, caseInsensitive });

      if (applyToAll && identicalCount > 0) {
        const sourceText = word.text.trimEnd();
        const ok = await confirm(buildApplyToAllConfirmOptions({ identicalCount, sourceText }));
        if (!ok) return;
        useProjectStore.getState().splitSyllablesAcrossIdenticalWordsWithHistory({
          source: { lineId, wordIndex, type },
          splitPoints,
          caseInsensitive,
        });
        setSplitPoints([]);
        close();
        return;
      }

      splitSingleWord();
      setSplitPoints([]);
      close();
    },
    [
      applyToAll,
      caseInsensitive,
      identicalCount,
      word.text,
      confirm,
      lineId,
      wordIndex,
      type,
      splitPoints,
      splitSingleWord,
    ],
  );

  const cancelSplit = useCallback((close: () => void) => {
    setSplitPoints([]);
    close();
  }, []);

  return {
    splitPoints,
    applyToAll,
    caseInsensitive,
    identicalCount,
    toggleSplit,
    setApplyToAll,
    setCaseInsensitive,
    confirmSplit,
    cancelSplit,
  };
}

// -- Exports ------------------------------------------------------------------

export { useSyllableSplitterState };
