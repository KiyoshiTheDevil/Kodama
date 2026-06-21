import { isWordSelected } from "@/domain/selection/identity";
import { FileDropZone } from "@/audio/file-drop-zone";
import { cn } from "@/utils/cn";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { getAgentColor } from "@/domain/agent/colors";
import type { LyricLine } from "@/domain/line/model";
import { selfKey } from "@/views/timeline/snap";
import { useSnapBypass } from "@/views/timeline/use-snap-bypass";
import { useTimelineSnap } from "@/views/timeline/use-timeline-snap";
import { ExplicitSuggestionsBanner } from "@/views/timeline/explicit-suggestions-banner";
import { GroupingSuggestionsBanner } from "@/views/timeline/grouping-suggestions-banner";
import { useImportModal } from "@/stores/import-modal-store";
import { EmptyTimelineImport } from "@/views/timeline/empty-timeline-import";
import { MarqueeSelection } from "@/views/timeline/marquee-selection";
import { PastePreview } from "@/views/timeline/paste-preview";
import { TimelineContextMenu } from "@/views/timeline/timeline-context-menu";
import { TimelineSyllableSplitter } from "@/views/timeline/timeline-syllable-splitter";
import { WordEditOverlay } from "@/views/timeline/word-edit-overlay";
import { TimelineHeader } from "@/views/timeline/timeline-header";
import { TimelineInfoPanel } from "@/views/timeline/timeline-info-panel";
import { SnapGuideline } from "@/views/timeline/snap-guideline";
import { TimelinePlayhead } from "@/views/timeline/timeline-playhead";
import { TimelinePreviewSidebar } from "@/views/timeline/timeline-preview-sidebar";
import { TimelineRows } from "@/views/timeline/timeline-rows";
import { useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { TimelineWaveform } from "@/views/timeline/timeline-waveform";
import { useMarquee } from "@/views/timeline/use-marquee";
import {
  expandSelectionToGroupmates,
  getSyllablePositions,
  type SyllablePosition,
} from "@/domain/word/syllable-groups";
import { useTimelineDnd } from "@/views/timeline/use-timeline-dnd";
import { useTimelineKeyboard } from "@/views/timeline/use-timeline-keyboard";
import { useTimelinePan } from "@/views/timeline/use-timeline-pan";
import { useTimelineWheel } from "@/views/timeline/use-timeline-wheel";
import { mainBounds } from "@/domain/line/bounds";
import { getEffectiveLines } from "@/domain/line/effective-words";
import { computeRowLayout, distributeLinesTiming } from "@/views/timeline/utils";
import { GROUP_HEADER_HEIGHT } from "@/views/timeline/group-header-row";
import { IconMusic } from "@tabler/icons-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useOverlayScrollbars } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";
import { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";

// -- Components ----------------------------------------------------------------

interface DragGhostCell {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  syllablePosition: SyllablePosition;
}

const GHOST_SYLLABLE_RADIUS: Record<SyllablePosition, string> = {
  none: "rounded-xl",
  first: "rounded-l-xl rounded-r-none",
  middle: "rounded-none",
  last: "rounded-r-xl rounded-l-none",
};

const DragGhost: React.FC<{
  cells: DragGhostCell[];
  anchorWidth: number;
  anchorHeight: number;
  color: string;
  isSnapped: boolean;
}> = ({ cells, anchorWidth, anchorHeight, color, isSnapped }) => (
  <div className="relative" style={{ width: anchorWidth, height: anchorHeight }}>
    {cells.map((cell) => (
      <div
        key={`${cell.left}-${cell.top}`}
        data-word-block
        data-syllable-position={cell.syllablePosition}
        className={cn(
          "absolute flex items-center justify-center text-xs text-white truncate border pointer-events-none",
          GHOST_SYLLABLE_RADIUS[cell.syllablePosition],
          isSnapped && "is-snapped",
        )}
        style={{
          left: cell.left,
          top: cell.top,
          width: cell.width,
          height: cell.height,
          backgroundColor: `${color}50`,
          borderColor: `${color}90`,
          ...(cell.syllablePosition === "first" || cell.syllablePosition === "middle"
            ? { borderRightStyle: "dashed" }
            : {}),
          ...(cell.syllablePosition === "middle" || cell.syllablePosition === "last" ? { borderLeftWidth: 0 } : {}),
        }}
      >
        <span className="px-1 truncate">{cell.text}</span>
      </div>
    ))}
  </div>
);

function makeDragOverlapCheck(
  data: { lineId: string; wordIndex: number; trackType: "word" | "bg"; begin: number; end: number },
  lines: LyricLine[],
) {
  const line = lines.find((l) => l.id === data.lineId);
  if (!line) return () => true;
  const wordsArr = data.trackType === "word" ? (line.words ?? []) : (line.backgroundWords ?? []);
  return (shift: number) => {
    const newBegin = data.begin + shift;
    const newEnd = data.end + shift;
    return !wordsArr.some((w, i) => {
      if (i === data.wordIndex) return false;
      return newBegin < w.end && newEnd > w.begin;
    });
  };
}

const TimelinePanel: React.FC = () => {
  const source = useAudioStore((s) => s.source);
  const duration = useAudioStore((s) => s.duration);
  const lines = useProjectStore((s) => s.lines);
  const setLines = useProjectStore((s) => s.setLines);
  const zoom = useTimelineStore((s) => s.zoom);
  const setScrollLeft = useTimelineStore((s) => s.setScrollLeft);
  const previewSidebarOpen = useTimelineStore((s) => s.previewSidebarOpen);
  const pasteMode = useTimelineStore((s) => s.pasteMode);
  const editingWord = useTimelineStore((s) => s.editingWord);
  const ghostSnapped = useTimelineStore((s) => s.snappedBlockId !== null);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(400);
  const openImportModal = useImportModal();

  const effectiveLines = useMemo(() => getEffectiveLines(lines), [lines]);

  const [initOverlayScrollbars] = useOverlayScrollbars({
    defer: true,
    options: {
      scrollbars: {
        theme: "os-theme-light",
        autoHide: "scroll",
        autoHideDelay: 800,
      },
    },
  });

  useEffect(() => {
    const target = contentRef.current;
    const viewport = scrollContainerRef.current;
    if (!target || !viewport) return;
    initOverlayScrollbars({ target, elements: { viewport } });
  }, [initOverlayScrollbars]);

  const { handlePanMouseDown } = useTimelinePan(scrollContainerRef);
  const { sensors, activeDrag, handleDragStart, handleDragEnd, handleDragCancel } = useTimelineDnd(effectiveLines);
  const { dragSnapModifier, beginGesture, endGesture } = useTimelineSnap();
  const lastDragPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const getLastDragPointer = useCallback(() => lastDragPointerRef.current, []);
  useSnapBypass({ active: activeDrag !== null, getLastPointer: getLastDragPointer });

  useEffect(() => {
    if (!activeDrag) return;
    const onMove = (e: PointerEvent) => {
      lastDragPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [activeDrag]);

  const { marqueeRect, handleMarqueeMouseDown } = useMarquee(scrollContainerRef);
  const openLyricsModal = useCallback(() => openImportModal(), [openImportModal]);
  useTimelineKeyboard(scrollContainerRef, effectiveLines, duration, openLyricsModal);
  useTimelineWheel(scrollContainerRef, !!source && lines.length > 0);

  const lastDistributedDurationRef = useRef<number | null>(null);

  useEffect(() => {
    if (duration <= 0 || lines.length === 0) return;
    if (lastDistributedDurationRef.current === duration) return;

    const hasAnyTiming = lines.some((l) => mainBounds(l) !== null);

    if (!hasAnyTiming) {
      const distributed = distributeLinesTiming(lines, duration);
      setLines(distributed);
    }
    lastDistributedDurationRef.current = duration;
  }, [duration, lines, setLines]);

  useEffect(() => {
    const { selectedWords } = useTimelineStore.getState();
    if (selectedWords.length === 0) return;
    const valid = selectedWords.filter((sel) => {
      const line = effectiveLines[sel.lineIndex];
      if (!line || line.id !== sel.lineId) return false;
      const words = sel.type === "word" ? line.words : line.backgroundWords;
      return !!words?.[sel.wordIndex];
    });
    if (valid.length < selectedWords.length) {
      useTimelineStore.getState().setSelectedWords(valid);
    }
  }, [effectiveLines]);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0].contentRect.height);
    });
    // react-doctor-disable-next-line react-doctor/no-initialize-state
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollLeft(e.currentTarget.scrollLeft);
    },
    [setScrollLeft],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      handlePanMouseDown(e);
      if (e.button === 0 && pasteMode.status !== "preview") {
        handleMarqueeMouseDown(e);
      }
    },
    [handlePanMouseDown, handleMarqueeMouseDown, pasteMode],
  );

  const handleAudioDrop = useCallback((file: File) => {
    useAudioStore.getState().setSource({ type: "file", file });
  }, []);

  const dragColor = activeDrag
    ? getAgentColor(effectiveLines.find((l) => l.id === activeDrag.lineId)?.agentId ?? "")
    : "#888";

  const dragCells = useMemo(() => {
    if (!activeDrag) return null;
    const { selectedWords, rowHeights, defaultRowHeight, collapsedInstances } = useTimelineStore.getState();
    const inSelection = isWordSelected(selectedWords, activeDrag.lineId, activeDrag.wordIndex, activeDrag.trackType);

    const BG_DROP_ZONE_HEIGHT = 24;

    const layout = computeRowLayout({
      lines: effectiveLines,
      rowHeights,
      defaultRowHeight,
      collapsedInstances,
      waveformHeight: WAVEFORM_HEIGHT,
      bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
      groupHeaderHeight: GROUP_HEADER_HEIGHT,
    });

    const rowTops: Record<string, number> = {};
    const rowMainHeights: Record<string, number> = {};
    const rowBgTops: Record<string, number> = {};
    const rowBgHeights: Record<string, number> = {};
    for (const line of effectiveLines) {
      const pos = layout.lineTops.get(line.id);
      if (!pos) continue;
      const mainH = rowHeights[line.id] ?? defaultRowHeight;
      const hasBg = line.backgroundWords && line.backgroundWords.length > 0;
      const bgH = hasBg ? mainH : BG_DROP_ZONE_HEIGHT;
      rowTops[line.id] = pos.top;
      rowMainHeights[line.id] = mainH;
      rowBgTops[line.id] = pos.top + mainH;
      rowBgHeights[line.id] = bgH;
    }

    const anchorLeft = activeDrag.begin * zoom;
    const anchorTop = activeDrag.trackType === "bg" ? rowBgTops[activeDrag.lineId] : rowTops[activeDrag.lineId];
    const anchorHeight =
      activeDrag.trackType === "bg" ? rowBgHeights[activeDrag.lineId] : rowMainHeights[activeDrag.lineId];

    const baseSelections =
      inSelection && selectedWords.length > 1
        ? selectedWords
        : [
            {
              lineId: activeDrag.lineId,
              lineIndex: activeDrag.lineIndex,
              wordIndex: activeDrag.wordIndex,
              type: activeDrag.trackType,
            },
          ];

    const lineById = new Map(effectiveLines.map((l) => [l.id, l]));

    const wordsToShow: typeof baseSelections = [];
    const seen = new Set<string>();
    for (const sel of baseSelections) {
      const line = lineById.get(sel.lineId);
      const wordsArray = sel.type === "word" ? line?.words : line?.backgroundWords;
      if (!line || !wordsArray) continue;
      const indices = expandSelectionToGroupmates(wordsArray, [sel.wordIndex]);
      for (const idx of indices) {
        const key = `${sel.lineId}:${sel.type}:${idx}`;
        if (seen.has(key)) continue;
        seen.add(key);
        wordsToShow.push({ lineId: sel.lineId, lineIndex: sel.lineIndex, wordIndex: idx, type: sel.type });
      }
    }

    if (wordsToShow.length <= 1) {
      const w = Math.max((activeDrag.end - activeDrag.begin) * zoom, 4);
      return {
        cells: [
          {
            text: activeDrag.text,
            left: 0,
            top: 0,
            width: w,
            height: anchorHeight - 8,
            syllablePosition: "none" as SyllablePosition,
          },
        ],
        anchorWidth: w,
        anchorHeight: anchorHeight - 8,
      };
    }

    const positionsByLineTrack = new Map<string, SyllablePosition[]>();
    const positionFor = (lineId: string, type: "word" | "bg", idx: number): SyllablePosition => {
      const key = `${lineId}:${type}`;
      let positions = positionsByLineTrack.get(key);
      if (!positions) {
        const line = lineById.get(lineId);
        const wordsArray = type === "word" ? line?.words : line?.backgroundWords;
        positions = wordsArray ? getSyllablePositions(wordsArray) : [];
        positionsByLineTrack.set(key, positions);
      }
      return positions[idx] ?? "none";
    };

    const cells = wordsToShow.map((sel) => {
      const line = lineById.get(sel.lineId);
      const wordsArray = sel.type === "word" ? line?.words : line?.backgroundWords;
      const word = wordsArray?.[sel.wordIndex];
      if (!word || !line)
        return { text: "", left: 0, top: 0, width: 0, height: 0, syllablePosition: "none" as SyllablePosition };

      const cellLeft = word.begin * zoom - anchorLeft;
      const cellTop = (sel.type === "bg" ? rowBgTops[line.id] : rowTops[line.id]) - anchorTop;
      const cellWidth = Math.max((word.end - word.begin) * zoom, 4);
      const cellHeight = (sel.type === "bg" ? rowBgHeights[line.id] : rowMainHeights[line.id]) - 8;

      return {
        text: word.text.trimEnd(),
        left: cellLeft,
        top: cellTop,
        syllablePosition: positionFor(sel.lineId, sel.type, sel.wordIndex),
        width: cellWidth,
        height: cellHeight,
      };
    });

    const anchorW = Math.max((activeDrag.end - activeDrag.begin) * zoom, 4);
    return { cells, anchorWidth: anchorW, anchorHeight: anchorHeight - 8 };
  }, [activeDrag, zoom, effectiveLines]);

  if (!source) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden select-none">
        <TimelineHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <FileDropZone accept="audio/*" onFileDrop={handleAudioDrop}>
            <IconMusic className="size-12 mb-4 opacity-50 text-composer-text" stroke={1.5} />
            <p className="text-composer-text-secondary">Drop audio file here</p>
            <p className="mt-1 text-sm text-composer-text-muted">or click to browse</p>
            <p className="mt-4 text-xs text-composer-text-muted">Supports MP3, WAV, M4A, OGG, FLAC</p>
          </FileDropZone>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden select-none">
        <TimelineHeader onImportLyrics={openLyricsModal} />
        <EmptyTimelineImport openLyricsModal={openLyricsModal} />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      modifiers={[dragSnapModifier]}
      onDragStart={(e) => {
        handleDragStart(e);
        const data = e.active.data.current as
          | {
              lineId: string;
              wordIndex: number;
              trackType: "word" | "bg";
              begin: number;
              end: number;
              snap?: { edgesAtStart: number[] };
            }
          | undefined;
        if (!data?.snap) return;
        const { selectedWords } = useTimelineStore.getState();
        const lines = useProjectStore.getState().lines;
        const isLeaderInSelection = isWordSelected(selectedWords, data.lineId, data.wordIndex, data.trackType);
        const draggedSet =
          isLeaderInSelection && selectedWords.length > 0
            ? selectedWords
            : [{ lineId: data.lineId, lineIndex: 0, wordIndex: data.wordIndex, type: data.trackType }];
        const selfIds = new Set(draggedSet.map((s) => selfKey(s.lineId, s.wordIndex, s.type)));
        const leaderKey = selfKey(data.lineId, data.wordIndex, data.trackType);
        beginGesture({
          selfIds,
          leaderKey,
          overlapCheck: makeDragOverlapCheck(data, lines),
        });
      }}
      onDragEnd={(e) => {
        endGesture();
        handleDragEnd(e);
      }}
      onDragCancel={() => {
        endGesture();
        handleDragCancel();
      }}
    >
      <div data-tour="timeline-panel" className="flex flex-col flex-1 overflow-hidden select-none">
        <TimelineHeader onImportLyrics={openLyricsModal} />
        <GroupingSuggestionsBanner />
        <ExplicitSuggestionsBanner />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div
              ref={contentRef}
              data-timeline-scroll-host
              className="relative flex-1 flex flex-col overflow-hidden isolate"
            >
              <div
                ref={scrollContainerRef}
                role="application"
                aria-label="Timeline"
                data-scroll-container
                className="flex-1 overflow-auto overscroll-none static! z-[unset]"
                onScroll={handleScroll}
                onMouseDown={handleMouseDown}
                onAuxClick={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
              >
                <div className="absolute grid place-items-center text-xs text-composer-text-muted top-0 left-0 z-100 w-12 h-20.25 border-b border-r-2 border-composer-border bg-composer-bg shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24">
                    <title>Music Icon</title>
                    <path
                      fill="currentColor"
                      d="M10 21q-1.65 0-2.825-1.175T6 17t1.175-2.825T10 13q.575 0 1.063.138t.937.412V4q0-.425.288-.712T13 3h4q.425 0 .713.288T18 4v2q0 .425-.288.713T17 7h-3v10q0 1.65-1.175 2.825T10 21"
                    />
                  </svg>
                </div>
                <TimelineWaveform />

                <TimelineRows scrollContainerRef={scrollContainerRef} />
              </div>

              <TimelinePlayhead containerHeight={contentHeight} scrollContainerRef={scrollContainerRef} />

              <SnapGuideline />

              {marqueeRect && <MarqueeSelection rect={marqueeRect} scrollContainerRef={scrollContainerRef} />}

              {pasteMode.status === "preview" && (
                <PastePreview clipboard={pasteMode.clipboard} scrollContainerRef={scrollContainerRef} />
              )}

              {editingWord && (
                <WordEditOverlay
                  lineId={editingWord.lineId}
                  wordIndex={editingWord.wordIndex}
                  type={editingWord.type}
                  scrollContainerRef={scrollContainerRef}
                />
              )}
            </div>

            <TimelineInfoPanel />
          </div>

          <Activity mode={previewSidebarOpen ? "visible" : "hidden"}>
            <TimelinePreviewSidebar />
          </Activity>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag && dragCells && (
          <DragGhost
            cells={dragCells.cells}
            anchorWidth={dragCells.anchorWidth}
            anchorHeight={dragCells.anchorHeight}
            color={dragColor}
            isSnapped={ghostSnapped}
          />
        )}
      </DragOverlay>

      <TimelineContextMenu />
      <TimelineSyllableSplitter />
    </DndContext>
  );
};

// -- Exports -------------------------------------------------------------------

export { TimelinePanel };
