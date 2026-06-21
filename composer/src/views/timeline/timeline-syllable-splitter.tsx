import type { WordTiming } from "@/domain/word/timing";
import { useProjectStore } from "@/stores/project";
import { Modal } from "@/ui/modal";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { SplitModeContent } from "@/views/sync/split-mode-content";
import {
  type SplitterTarget,
  useTimelineSyllableSplitterState,
} from "@/views/timeline/use-timeline-syllable-splitter-state";
import { useCallback, useEffect, useState } from "react";

// -- Types --------------------------------------------------------------------

type SplitMode = "syllable" | "word";

// -- Component ----------------------------------------------------------------

const TimelineSyllableSplitter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [target, setTarget] = useState<SplitterTarget | null>(null);

  useEffect(() => {
    const openSplitModal = (mode: SplitMode) => {
      const { selectedWords } = useTimelineStore.getState();
      if (selectedWords.length !== 1) return;

      const sel = selectedWords[0];
      const lines = useProjectStore.getState().lines;
      const line = lines.find((l) => l.id === sel.lineId);
      if (!line) return;

      const wordsArray = sel.type === "word" ? line.words : line.backgroundWords;
      const word: WordTiming | undefined = wordsArray?.[sel.wordIndex];
      if (!word || word.text.trimEnd().length < 2) return;

      setTarget({ lineId: sel.lineId, wordIndex: sel.wordIndex, type: sel.type, word, mode });
      setSplitPoints([]);
      setIsOpen(true);
    };

    const handleSplitSyllable = () => openSplitModal("syllable");
    const handleSplitWord = () => openSplitModal("word");

    window.addEventListener("timeline:split-syllable", handleSplitSyllable);
    window.addEventListener("timeline:split-word", handleSplitWord);
    return () => {
      window.removeEventListener("timeline:split-syllable", handleSplitSyllable);
      window.removeEventListener("timeline:split-word", handleSplitWord);
    };
  }, []);

  const handleToggleSplit = useCallback((index: number) => {
    setSplitPoints((prev) => (prev.includes(index) ? prev.filter((p) => p !== index) : [...prev, index]));
  }, []);

  const resetSplitPoints = useCallback(() => {
    setSplitPoints([]);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setTarget(null);
    setSplitPoints([]);
  }, []);

  const { applyToAll, setApplyToAll, caseInsensitive, setCaseInsensitive, identicalCount, sourceText, confirmSplit } =
    useTimelineSyllableSplitterState({ target, splitPoints, resetSplitPoints, closeModal });

  if (!target) return null;

  const trimmedText = target.word.text.trimEnd();
  const title = target.mode === "word" ? `Split "${trimmedText}" into words` : `Split "${trimmedText}"`;

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={title}>
      <SplitModeContent
        text={trimmedText}
        splitPoints={splitPoints}
        onToggleSplit={handleToggleSplit}
        onConfirm={confirmSplit}
        onCancel={closeModal}
        applyToAll={applyToAll}
        onApplyToAllChange={setApplyToAll}
        caseInsensitive={caseInsensitive}
        onCaseInsensitiveChange={setCaseInsensitive}
        identicalCount={identicalCount}
        sourceText={sourceText}
        showApplyControls={target.mode === "syllable"}
      />
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { TimelineSyllableSplitter };
