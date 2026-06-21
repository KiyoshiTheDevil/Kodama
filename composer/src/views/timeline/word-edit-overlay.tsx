import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { getEffectiveLines } from "@/domain/line/effective-words";
import { FloatingPortal } from "@floating-ui/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// -- Types --------------------------------------------------------------------

interface WordEditOverlayProps {
  lineId: string;
  wordIndex: number;
  type: "word" | "bg";
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

// -- Component ----------------------------------------------------------------

const WordEditOverlay: React.FC<WordEditOverlayProps> = ({ lineId, wordIndex, type, scrollContainerRef }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const rawLines = useProjectStore((s) => s.lines);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const clearEditingWord = useTimelineStore((s) => s.clearEditingWord);

  const effectiveLines = useMemo(() => getEffectiveLines(rawLines), [rawLines]);
  const line = effectiveLines.find((l) => l.id === lineId);
  const wordsArray = type === "word" ? line?.words : line?.backgroundWords;
  const word = wordsArray?.[wordIndex];

  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !word) return;

    const key = `${lineId}-${type}-${wordIndex}`;

    const zoom = useTimelineStore.getState().zoom;
    const expectedLeft = word.begin * zoom;

    const findAndPosition = () => {
      const wordEl = container.querySelector(`[data-word-block][id="${CSS.escape(key)}"]`) as HTMLElement | null;
      if (!wordEl) return false;
      const elLeft = Number.parseFloat(wordEl.style.left || "0");
      if (Math.abs(elLeft - expectedLeft) > 1) return false;
      const rect = wordEl.getBoundingClientRect();
      setPos({ top: rect.top - 32, left: rect.left, width: Math.max(rect.width, 80) });
      return true;
    };

    if (findAndPosition()) return;

    const raf = requestAnimationFrame(() => {
      if (!findAndPosition()) clearEditingWord();
    });
    return () => cancelAnimationFrame(raf);
  }, [lineId, wordIndex, type, word, scrollContainerRef, clearEditingWord]);

  useEffect(() => {
    if (!pos) return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [pos]);

  const handleCommit = useCallback(
    (value: string) => {
      if (!line || !wordsArray || !word) return;
      const trimmed = value.trim();
      if (trimmed && trimmed !== word.text.trimEnd()) {
        const updatedWords = [...wordsArray];
        const hadTrailingSpace = word.text.endsWith(" ");
        updatedWords[wordIndex] = { ...word, text: hadTrailingSpace ? `${trimmed} ` : trimmed };
        updateLineWithHistory(
          lineId,
          type === "word" ? { words: updatedWords } : manualBackgroundWordEdit(updatedWords),
        );
      }
      clearEditingWord();
    },
    [line, wordsArray, word, wordIndex, type, lineId, updateLineWithHistory, clearEditingWord],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        handleCommit((e.target as HTMLInputElement).value);
      } else if (e.key === "Escape") {
        clearEditingWord();
      }
    },
    [handleCommit, clearEditingWord],
  );

  const commitWordEdit = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      handleCommit(e.target.value);
    },
    [handleCommit],
  );

  if (!word || !pos) return null;

  return (
    <FloatingPortal>
      <input
        ref={inputRef}
        type="text"
        aria-label="Edit word"
        defaultValue={word.text.trimEnd()}
        onKeyDown={handleKeyDown}
        onBlur={commitWordEdit}
        className="fixed z-100 px-2 py-1.5 text-sm text-composer-text bg-composer-bg border border-composer-border rounded-lg cursor-text focus:outline-none focus:border-composer-accent"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      />
    </FloatingPortal>
  );
};

// -- Exports ------------------------------------------------------------------

export { WordEditOverlay };
