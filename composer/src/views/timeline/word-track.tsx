import { isWordSelected } from "@/domain/selection/identity";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { useAudioStore } from "@/stores/audio";
import type { WordTiming } from "@/domain/word/timing";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { mergeWordsIntoTrack } from "@/domain/word/merge-track";
import { computeSyllableGroups, getSyllablePositions } from "@/domain/word/syllable-groups";
import { findInsertionSlot } from "@/utils/word-spaces";
import { resizeGestureSelfIds } from "@/views/timeline/resize-self-ids";
import { selfKey } from "@/views/timeline/snap";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useSnapBypass } from "@/views/timeline/use-snap-bypass";
import { useTimelineSnap } from "@/views/timeline/use-timeline-snap";
import { WordBlock } from "@/views/timeline/word-block";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// -- Types ---------------------------------------------------------------------

interface WordTrackProps {
  lineId: string;
  lineIndex: number;
  words: WordTiming[];
  color: string;
  trackType: "word" | "bg";
  duration: number;
  height: number;
  onUpdateWord: (
    index: number,
    updates: Partial<WordTiming>,
    adjacentIndex?: number,
    adjacentUpdates?: Partial<WordTiming>,
  ) => void;
}

interface DragState {
  wordIndex: number;
  edge: "left" | "right";
  begin: number;
  end: number;
  adjacentWordIndex?: number;
  adjacentBegin?: number;
  adjacentEnd?: number;
}

// -- Constants -----------------------------------------------------------------

const MIN_WORD_DURATION = 0.05;

// -- Component -----------------------------------------------------------------

const WordTrack: React.FC<WordTrackProps> = ({
  lineId,
  lineIndex,
  words,
  color,
  trackType,
  duration,
  height,
  onUpdateWord,
}) => {
  const zoom = useTimelineStore((s) => s.zoom);
  const selectedWords = useTimelineStore((s) => s.selectedWords);
  const setSelectedWords = useTimelineStore((s) => s.setSelectedWords);
  const toggleSelection = useTimelineStore((s) => s.toggleSelection);
  const rollingEditMode = useTimelineStore((s) => s.rollingEditMode);

  const showSyllableIndicators = useSettingsStore((s) => s.showSyllableIndicators);
  const syllablePositions = useMemo(() => getSyllablePositions(words), [words]);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredBoundary, setHoveredBoundary] = useState<number | null>(null);
  const [altPressed, setAltPressed] = useState(false);
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers
  const [resizing, setResizing] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const justResizedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const conjoinedRef = useRef<{ active: boolean; adjacentWordIndex: number | null }>({
    active: false,
    adjacentWordIndex: null,
  });

  const snap = useTimelineSnap();
  const getLastPointer = useCallback(() => lastPointerRef.current, []);
  useSnapBypass({ active: resizing, getLastPointer });

  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => setAltPressed(e.altKey);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKey);
    };
  }, []);

  const handleResizeStart = useCallback(
    (wordIndex: number, edge: "left" | "right", startX: number) => {
      const word = words[wordIndex];
      const initialState: DragState = { wordIndex, edge, begin: word.begin, end: word.end };
      dragStateRef.current = initialState;
      setDragState(initialState);

      const rollingEdit = useTimelineStore.getState().rollingEditMode;

      setResizing(true);
      lastPointerRef.current = { clientX: startX, clientY: 0 };
      conjoinedRef.current = { active: false, adjacentWordIndex: null };
      snap.beginGesture({
        selfIds: resizeGestureSelfIds(lineId, wordIndex, edge, words.length, trackType),
        leaderKey: selfKey(lineId, wordIndex, trackType),
        overlapCheck: (shift) => {
          const w = words[wordIndex];
          const newBegin = edge === "left" ? w.begin + shift : w.begin;
          const newEnd = edge === "right" ? w.end + shift : w.end;
          const adj = conjoinedRef.current.adjacentWordIndex;
          return !words.some((other, i) => {
            if (i === wordIndex) return false;
            if (conjoinedRef.current.active && i === adj) return false;
            return newBegin < other.end && newEnd > other.begin;
          });
        },
      });

      const isSyllableBoundary = (idx: number, side: "left" | "right"): boolean => {
        const pos = syllablePositions[idx];
        if (side === "right") return pos === "first" || pos === "middle";
        return pos === "middle" || pos === "last";
      };

      const boundaryHasGap = (idx: number, side: "left" | "right"): boolean => {
        if (side === "right") return idx < words.length - 1 && words[idx].end < words[idx + 1].begin;
        return idx > 0 && words[idx - 1].end < words[idx].begin;
      };

      const handleMouseMove = (e: PointerEvent) => {
        lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
        const originalWord = words[wordIndex];
        const rawDeltaPx = e.clientX - startX;
        const altHeld = e.altKey;
        const conjoinedByDefault =
          (rollingEdit || isSyllableBoundary(wordIndex, edge)) && !boundaryHasGap(wordIndex, edge);
        const conjoined = altHeld ? !conjoinedByDefault : conjoinedByDefault;

        const adjacentWordIndex =
          conjoined && edge === "left" && wordIndex > 0
            ? wordIndex - 1
            : conjoined && edge === "right" && wordIndex < words.length - 1
              ? wordIndex + 1
              : null;
        conjoinedRef.current = { active: conjoined && adjacentWordIndex !== null, adjacentWordIndex };

        const edgesAtStart = edge === "left" ? [originalWord.begin] : [originalWord.end];
        const snapShiftPx = snap.computeShiftPx(rawDeltaPx, edgesAtStart);
        const deltaTime = (rawDeltaPx + snapShiftPx) / zoom;

        let newState: DragState;

        if (edge === "left") {
          if (conjoined && wordIndex > 0) {
            const prevWord = words[wordIndex - 1];
            const newBoundary = originalWord.begin + deltaTime;
            const min = prevWord.begin + MIN_WORD_DURATION;
            const max = originalWord.end - MIN_WORD_DURATION;
            const clamped = Math.max(min, Math.min(max, Math.max(0, newBoundary)));
            newState = {
              wordIndex,
              edge,
              begin: clamped,
              end: originalWord.end,
              adjacentWordIndex: wordIndex - 1,
              adjacentBegin: prevWord.begin,
              adjacentEnd: clamped,
            };
          } else {
            const newBegin = originalWord.begin + deltaTime;
            const maxBegin = originalWord.end - MIN_WORD_DURATION;
            const prevEnd = wordIndex > 0 ? words[wordIndex - 1].end : 0;
            const clampedBegin = Math.max(prevEnd, Math.min(maxBegin, Math.max(0, newBegin)));
            newState = { wordIndex, edge, begin: clampedBegin, end: originalWord.end };
          }
        } else {
          if (conjoined && wordIndex < words.length - 1) {
            const nextWord = words[wordIndex + 1];
            const newBoundary = originalWord.end + deltaTime;
            const min = originalWord.begin + MIN_WORD_DURATION;
            const max = nextWord.end - MIN_WORD_DURATION;
            const clamped = Math.max(min, Math.min(max, Math.min(duration, newBoundary)));
            newState = {
              wordIndex,
              edge,
              begin: originalWord.begin,
              end: clamped,
              adjacentWordIndex: wordIndex + 1,
              adjacentBegin: clamped,
              adjacentEnd: nextWord.end,
            };
          } else {
            const newEnd = originalWord.end + deltaTime;
            const minEnd = originalWord.begin + MIN_WORD_DURATION;
            const nextBegin = wordIndex < words.length - 1 ? words[wordIndex + 1].begin : duration;
            const clampedEnd = Math.min(nextBegin, Math.max(minEnd, Math.min(duration, newEnd)));
            newState = { wordIndex, edge, begin: originalWord.begin, end: clampedEnd };
          }
        }

        dragStateRef.current = newState;
        setDragState(newState);
      };

      const handleMouseUp = () => {
        setResizing(false);
        snap.endGesture();

        const finalState = dragStateRef.current;
        dragStateRef.current = null;
        setDragState(null);
        justResizedRef.current = true;
        requestAnimationFrame(() => {
          justResizedRef.current = false;
        });

        if (finalState) {
          if (finalState.adjacentWordIndex !== undefined) {
            const mainUpdate = edge === "left" ? { begin: finalState.begin } : { end: finalState.end };
            const adjUpdate = edge === "left" ? { end: finalState.adjacentEnd! } : { begin: finalState.adjacentBegin! };
            onUpdateWord(wordIndex, mainUpdate, finalState.adjacentWordIndex, adjUpdate);
          } else if (edge === "left") {
            onUpdateWord(wordIndex, { begin: finalState.begin });
          } else {
            onUpdateWord(wordIndex, { end: finalState.end });
          }
        }

        cleanupRef.current = null;
        document.removeEventListener("pointermove", handleMouseMove);
        document.removeEventListener("pointerup", handleMouseUp);
      };

      cleanupRef.current = () => {
        setResizing(false);
        snap.endGesture();
        document.removeEventListener("pointermove", handleMouseMove);
        document.removeEventListener("pointerup", handleMouseUp);
      };

      document.addEventListener("pointermove", handleMouseMove);
      document.addEventListener("pointerup", handleMouseUp);
    },
    [words, zoom, duration, onUpdateWord, syllablePositions, snap, lineId, trackType],
  );

  const isBoundaryConjoined = (boundaryIndex: number): boolean => {
    if (boundaryIndex < 0 || boundaryIndex >= words.length - 1) return false;
    const pos = syllablePositions[boundaryIndex];
    const isSyllable = pos === "first" || pos === "middle";
    const hasGap = words[boundaryIndex].end < words[boundaryIndex + 1].begin;
    const conjoinedByDefault = (rollingEditMode || isSyllable) && !hasGap;
    return altPressed ? !conjoinedByDefault : conjoinedByDefault;
  };

  const hasSelection = selectedWords.length > 0;

  const getDisplay = (wordIndex: number) => {
    if (dragState) {
      if (dragState.wordIndex === wordIndex) {
        return { begin: dragState.begin, end: dragState.end };
      }
      if (dragState.adjacentWordIndex === wordIndex) {
        return { begin: dragState.adjacentBegin!, end: dragState.adjacentEnd! };
      }
    }
    const word = words[wordIndex];
    return { begin: word.begin, end: word.end };
  };

  const handleEdgeHover = useCallback((wordIndex: number, edge: "left" | "right", hovering: boolean) => {
    if (!hovering) {
      setHoveredBoundary(null);
      return;
    }
    // Boundary index = the gap between words[i] and words[i+1]
    // Right edge of word N → boundary N
    // Left edge of word N → boundary N-1
    setHoveredBoundary(edge === "right" ? wordIndex : wordIndex - 1);
  }, []);

  const handleTrackClick = () => {
    setSelectedWords([]);
  };

  const handleSelect = (wordIndex: number, e: React.MouseEvent) => {
    if (justResizedRef.current) return;
    if (e.shiftKey) {
      const pos = syllablePositions[wordIndex];
      if (pos !== "none") {
        const groups = computeSyllableGroups(words);
        const group = groups.find((g) => wordIndex >= g.startIndex && wordIndex <= g.endIndex);
        if (group) {
          const selections = Array.from({ length: group.endIndex - group.startIndex + 1 }, (_, i) => ({
            lineId,
            lineIndex,
            wordIndex: group.startIndex + i,
            type: trackType,
          }));
          setSelectedWords(selections);
          return;
        }
      }
    }

    const selection = { lineId, lineIndex, wordIndex, type: trackType };
    if (e.metaKey || e.ctrlKey) {
      toggleSelection(selection);
    } else {
      const alreadySelected = isWordSelected(selectedWords, lineId, wordIndex, trackType);
      if (alreadySelected && selectedWords.length === 1) {
        setSelectedWords([]);
      } else {
        setSelectedWords([selection]);
      }
    }
  };

  const handleWordDoubleClick = (wordIndex: number) => {
    useTimelineStore.getState().setEditingWord({ lineId, wordIndex, type: trackType });
  };

  const handleWordContextMenu = (wordIndex: number, e: React.MouseEvent) => {
    useTimelineStore.getState().setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: { kind: "word", lineId, lineIndex, wordIndex, type: trackType },
    });
  };

  const handleTrackDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-word-block]")) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const time = clickX / zoom;

    const audioDuration = useAudioStore.getState().duration;
    const wordDuration = useSettingsStore.getState().defaultWordDuration;
    const slot = findInsertionSlot(words, time, wordDuration, audioDuration);
    if (!slot) return;

    const newWord: WordTiming = { text: "... ", begin: slot.begin, end: slot.end };
    const newWords = mergeWordsIntoTrack(words, [newWord]);
    const newIndex = newWords.findIndex((w) => w.begin === newWord.begin);

    const updateLineWithHistory = useProjectStore.getState().updateLineWithHistory;
    if (trackType === "word") {
      updateLineWithHistory(lineId, { words: newWords });
    } else {
      updateLineWithHistory(lineId, manualBackgroundWordEdit(newWords));
    }

    useTimelineStore.getState().setEditingWord({ lineId, wordIndex: newIndex, type: trackType });
  };

  const handleTrackContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-word-block]")) return;
    e.preventDefault();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const time = clickX / zoom;

    useTimelineStore.getState().setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: { kind: "track", lineId, lineIndex, time, type: trackType },
    });
  };

  return (
    <div
      role="presentation"
      className="relative"
      style={{ height, width: duration * zoom }}
      onClick={handleTrackClick}
      onDoubleClick={handleTrackDoubleClick}
      onContextMenu={handleTrackContextMenu}
      onKeyDown={() => {}}
    >
      {words.map((word, wordIndex) => {
        const display = getDisplay(wordIndex);
        const wordKey = `${lineId}-${trackType}-${wordIndex}`;
        const syllablePosition = showSyllableIndicators ? syllablePositions[wordIndex] : "none";
        const gapBefore =
          (syllablePosition === "middle" || syllablePosition === "last") &&
          getDisplay(wordIndex - 1).end < display.begin;
        return (
          <WordBlock
            key={wordKey}
            id={wordKey}
            lineId={lineId}
            lineIndex={lineIndex}
            wordIndex={wordIndex}
            trackType={trackType}
            text={word.text}
            begin={display.begin}
            end={display.end}
            color={color}
            zoom={zoom}
            isDimmed={hasSelection && !isWordSelected(selectedWords, lineId, wordIndex, trackType)}
            isSelected={isWordSelected(selectedWords, lineId, wordIndex, trackType)}
            isExplicit={word.explicit === true}
            syllablePosition={syllablePosition}
            gapBefore={gapBefore}
            leftHighlighted={hoveredBoundary === wordIndex - 1 && isBoundaryConjoined(wordIndex - 1)}
            rightHighlighted={hoveredBoundary === wordIndex && isBoundaryConjoined(wordIndex)}
            leftConjoined={isBoundaryConjoined(wordIndex - 1)}
            rightConjoined={isBoundaryConjoined(wordIndex)}
            onClick={(e) => handleSelect(wordIndex, e)}
            onResizeStart={(edge, startX) => handleResizeStart(wordIndex, edge, startX)}
            onEdgeHover={(edge, hovering) => handleEdgeHover(wordIndex, edge, hovering)}
            onDoubleClick={() => handleWordDoubleClick(wordIndex)}
            onContextMenu={(e) => handleWordContextMenu(wordIndex, e)}
          />
        );
      })}
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

const MemoizedWordTrack = memo(WordTrack);
export { MemoizedWordTrack as WordTrack };
