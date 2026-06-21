import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { getAgentColor } from "@/domain/agent/colors";
import { backgroundFields } from "@/domain/line/background";
import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/utils/cn";
import { stripSplitCharacter } from "@/utils/split-character";
import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";
import { findInsertionSlot } from "@/utils/word-spaces";
import { GutterAgentPicker } from "@/views/timeline/gutter-agent-picker";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { WordTrack } from "@/views/timeline/word-track";
import { useDroppable } from "@dnd-kit/core";
import { IconPlus } from "@tabler/icons-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

// -- Types ---------------------------------------------------------------------

interface LineRowProps {
  line: LyricLine;
  lineIndex: number;
  duration: number;
  onUpdateWord: (
    wordIndex: number,
    updates: Partial<WordTiming>,
    adjacentIndex?: number,
    adjacentUpdates?: Partial<WordTiming>,
  ) => void;
  onUpdateBgWord: (
    wordIndex: number,
    updates: Partial<WordTiming>,
    adjacentIndex?: number,
    adjacentUpdates?: Partial<WordTiming>,
  ) => void;
}

// -- Constants -----------------------------------------------------------------

const BG_DROP_ZONE_HEIGHT = 24;

// -- AddWordsButton ------------------------------------------------------------

const SyncLineButton: React.FC<{ lineId: string; wordCount: number }> = ({ lineId, wordCount }) => {
  const selectLineWords = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const currentTime = useAudioStore.getState().currentTime;
      const wordDuration = useSettingsStore.getState().defaultWordDuration;
      const lineDuration = Math.max(wordCount, 1) * wordDuration;

      useProjectStore.getState().updateLineWithHistory(lineId, {
        begin: currentTime,
        end: currentTime + lineDuration,
      });
    },
    [lineId, wordCount],
  );

  return (
    <button
      type="button"
      onClick={selectLineWords}
      className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-composer-text-muted hover:text-composer-text hover:bg-composer-button cursor-pointer transition-colors not-italic"
    >
      <IconPlus size={12} />
      Place
    </button>
  );
};

// -- Component -----------------------------------------------------------------

const LineRow: React.FC<LineRowProps> = ({ line, lineIndex, duration, onUpdateWord, onUpdateBgWord }) => {
  const color = getAgentColor(line.agentId);
  const groups = useProjectStore((s) => s.groups);
  const groupColor = line.groupId ? groups.find((g) => g.id === line.groupId)?.color : undefined;
  const displayText = stripSplitCharacter(line.text);
  const hasBgWords = line.backgroundWords && line.backgroundWords.length > 0;
  const hasMainWords = line.words && line.words.length > 0;

  const rowHeight = useTimelineStore((s) => s.rowHeights[line.id] ?? s.defaultRowHeight);
  const defaultRowHeight = useTimelineStore((s) => s.defaultRowHeight);
  const setRowHeight = useTimelineStore((s) => s.setRowHeight);
  const zoom = useTimelineStore((s) => s.zoom);
  const dragShiftPx = useTimelineStore((s) =>
    s.draggedGroupShift &&
    line.groupId !== undefined &&
    line.instanceIdx !== undefined &&
    s.draggedGroupShift.groupId === line.groupId &&
    s.draggedGroupShift.instanceIdx === line.instanceIdx
      ? s.draggedGroupShift.offsetPx
      : 0,
  );

  const [isResizing, setIsResizing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // react-doctor-disable-next-line react-doctor/exhaustive-deps
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const { setNodeRef: setBgDropRef, isOver: isOverBg } = useDroppable({
    id: `bg-drop-${line.id}`,
    data: { lineId: line.id, lineIndex },
  });

  const { setNodeRef: setMainDropRef, isOver: isOverMain } = useDroppable({
    id: `main-drop-${line.id}`,
    data: { lineId: line.id, lineIndex },
  });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsResizing(true);
      const startY = e.clientY;
      const startHeight = rowHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startY;
        setRowHeight(line.id, startHeight + delta);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        cleanupRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      cleanupRef.current = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [line.id, rowHeight, setRowHeight],
  );

  return (
    <div className="relative flex">
      <div
        className="shrink-0 flex items-center justify-center text-xs text-composer-text-muted border-r-2 shadow-[inset_0_-1px_0_0_var(--color-composer-border),10px_0_15px_-3px_rgb(0_0_0/0.1),4px_0_6px_-4px_rgb(0_0_0/0.1)] bg-composer-bg w-12 sticky left-0 z-60"
        style={{ borderRightColor: color }}
      >
        <GutterAgentPicker lineId={line.id} lineIndex={lineIndex} agentId={line.agentId} />
      </div>

      <div className={cn("flex-1 border-b border-composer-border relative", hasMainWords && "overflow-hidden")}>
        <div
          className="absolute inset-0"
          style={{ transform: dragShiftPx !== 0 ? `translateX(${dragShiftPx}px)` : undefined }}
        >
          {groupColor && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none z-0"
              style={{ background: groupColor, opacity: 0.06 }}
            />
          )}
        </div>
        <div
          ref={setMainDropRef}
          className={cn(
            "transition-colors relative",
            !hasMainWords && "opacity-50",
            isOverMain && "bg-composer-accent/10",
          )}
          style={{ transform: dragShiftPx !== 0 ? `translateX(${dragShiftPx}px)` : undefined }}
        >
          {hasMainWords ? (
            <WordTrack
              lineId={line.id}
              lineIndex={lineIndex}
              words={line.words!}
              color={color}
              trackType="word"
              duration={duration}
              height={rowHeight}
              onUpdateWord={onUpdateWord}
            />
          ) : (
            <div
              className="relative cursor-pointer"
              style={{ width: duration * zoom, height: rowHeight }}
              onDoubleClick={(e) => {
                const zoomPx = useTimelineStore.getState().zoom;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const time = (e.clientX - rect.left) / zoomPx;
                const audioDuration = useAudioStore.getState().duration;
                const wordDuration = useSettingsStore.getState().defaultWordDuration;
                const slot = findInsertionSlot([], time, wordDuration, audioDuration);
                if (!slot) return;
                const newWord: WordTiming = {
                  text: displayText.slice(0, 60) || "...",
                  begin: slot.begin,
                  end: slot.end,
                };
                useProjectStore.getState().updateLineWithHistory(line.id, {
                  words: [newWord],
                  text: newWord.text,
                });
                useTimelineStore.getState().setEditingWord({ lineId: line.id, wordIndex: 0, type: "word" });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const zoomPx = useTimelineStore.getState().zoom;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const time = (e.clientX - rect.left) / zoomPx;
                useTimelineStore.getState().setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  target: { kind: "track", lineId: line.id, lineIndex, time, type: "word" },
                });
              }}
            >
              <div
                className="sticky left-[48px] z-10 inline-flex items-center gap-2 px-3 text-xs text-composer-text-muted italic bg-composer-bg/80 backdrop-blur-sm"
                style={{ height: rowHeight, maxWidth: "calc(100% - 48px)" }}
              >
                <span className="truncate pr-0.5">
                  {displayText.slice(0, 60)}
                  {displayText.length > 60 ? "..." : ""}
                </span>
                {displayText.length > 0 && (
                  <SyncLineButton lineId={line.id} wordCount={splitIntoWordsWithMeta(line.text).parts.length} />
                )}
              </div>
            </div>
          )}
        </div>

        {hasBgWords ? (
          <div
            ref={setBgDropRef}
            className={cn(
              "relative opacity-70 transition-colors border-t border-composer-border/50",
              isOverBg ? "bg-composer-accent/10" : "bg-composer-bg-elevated/25",
            )}
            style={{ transform: dragShiftPx !== 0 ? `translateX(${dragShiftPx}px)` : undefined }}
          >
            <WordTrack
              lineId={line.id}
              lineIndex={lineIndex}
              words={line.backgroundWords!}
              color={color}
              trackType="bg"
              duration={duration}
              height={rowHeight}
              onUpdateWord={onUpdateBgWord}
            />
          </div>
        ) : (
          <div
            ref={setBgDropRef}
            className={cn(
              "flex items-center px-2 text-xs font-mono truncate transition-colors border-t border-composer-border/30 cursor-pointer",
              isOverBg
                ? "bg-composer-accent/20 text-composer-text"
                : "text-composer-text-muted/50 bg-composer-bg-elevated/25",
            )}
            style={{ height: BG_DROP_ZONE_HEIGHT }}
            onDoubleClick={(e) => {
              const zoom = useTimelineStore.getState().zoom;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const time = (e.clientX - rect.left) / zoom;
              const audioDuration = useAudioStore.getState().duration;
              const wordDuration = useSettingsStore.getState().defaultWordDuration;
              const slot = findInsertionSlot([], time, wordDuration, audioDuration);
              if (!slot) return;
              const newWord: WordTiming = { text: "...", begin: slot.begin, end: slot.end };
              useProjectStore
                .getState()
                .updateLineWithHistory(
                  line.id,
                  backgroundFields({ text: newWord.text, words: [newWord], source: "manual" }),
                );
              useTimelineStore.getState().setEditingWord({ lineId: line.id, wordIndex: 0, type: "bg" });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const zoom = useTimelineStore.getState().zoom;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const time = (e.clientX - rect.left) / zoom;
              useTimelineStore.getState().setContextMenu({
                x: e.clientX,
                y: e.clientY,
                target: { kind: "track", lineId: line.id, lineIndex, time, type: "bg" },
              });
            }}
          >
            {line.backgroundText
              ? `${line.backgroundText.slice(0, 40)}${line.backgroundText.length > 40 ? "..." : ""}`
              : "BG"}
          </div>
        )}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-hidden="true"
        className={cn(
          "absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-composer-accent/30 transition-colors z-10",
          isResizing && "bg-composer-accent/50",
        )}
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setRowHeight(line.id, defaultRowHeight)}
      />
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

const MemoizedLineRow = memo(LineRow);
export { MemoizedLineRow as LineRow };
