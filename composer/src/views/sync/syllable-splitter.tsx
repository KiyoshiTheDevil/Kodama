import type { WordTiming } from "@/domain/word/timing";
import { Button } from "@/ui/button";
import { Popover } from "@/ui/popover";
import { SplitModeContent } from "@/views/sync/split-mode-content";
import { useSyllableSplitterState } from "@/views/sync/use-syllable-splitter-state";
import { IconScissors } from "@tabler/icons-react";

// -- Interfaces ---------------------------------------------------------------

interface SyllableSplitterProps {
  lineId: string;
  type: "word" | "bg";
  word: WordTiming;
  wordIndex: number;
  onSplit: (wordIndex: number, newWords: WordTiming[]) => void;
}

// -- Components ---------------------------------------------------------------

const SyllableSplitter: React.FC<SyllableSplitterProps> = ({ lineId, type, word, wordIndex, onSplit }) => {
  const {
    splitPoints,
    applyToAll,
    caseInsensitive,
    identicalCount,
    toggleSplit,
    setApplyToAll,
    setCaseInsensitive,
    confirmSplit,
    cancelSplit,
  } = useSyllableSplitterState({ lineId, type, word, wordIndex, onSplit });

  const trimmedLength = word.text.trimEnd().length;
  if (trimmedLength < 2) {
    return null;
  }

  return (
    <Popover
      trigger={
        <Button
          size="sm"
          variant="ghost"
          title="Split into syllables"
          className="px-1.5 py-0.5 h-auto align-middle rounded-sm"
        >
          <IconScissors className="size-3" />
        </Button>
      }
    >
      {(close) => (
        <div className="p-5">
          <h3 className="mb-4 text-lg font-medium">Split "{word.text.trimEnd()}"</h3>
          <SplitModeContent
            text={word.text.trimEnd()}
            splitPoints={splitPoints}
            onToggleSplit={toggleSplit}
            onConfirm={() => confirmSplit(close)}
            onCancel={() => cancelSplit(close)}
            applyToAll={applyToAll}
            onApplyToAllChange={setApplyToAll}
            caseInsensitive={caseInsensitive}
            onCaseInsensitiveChange={setCaseInsensitive}
            identicalCount={identicalCount}
            sourceText={word.text.trimEnd()}
            showApplyControls={true}
          />
        </div>
      )}
    </Popover>
  );
};

// -- Exports ------------------------------------------------------------------

export { SyllableSplitter };
