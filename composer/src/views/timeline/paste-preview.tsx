import { useAudioStore } from "@/stores/audio";
import { useConfirm } from "@/stores/confirm-store";
import { useModalStackStore } from "@/stores/modal-stack";
import { useProjectStore } from "@/stores/project";
import type { LineTemplate } from "@/domain/group/template";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import type { LyricLine } from "@/domain/line/model";
import { mergeWordsIntoTrack } from "@/domain/word/merge-track";
import type { WordTiming } from "@/domain/word/timing";
import { cn } from "@/utils/cn";
import { decidePasteInstanceAction } from "@/views/timeline/decide-paste-instance-action";
import { GROUP_HEADER_HEIGHT } from "@/views/timeline/group-header-row";
import { instanceToTemplate } from "@/views/timeline/group-ops";
import type { ClipboardData } from "@/views/timeline/selection-types";
import { findMatchingTemplate } from "@/views/timeline/structural-match";
import { GUTTER_WIDTH, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { computeRowLayout, type RowLayout } from "@/views/timeline/utils";
import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// -- Types ---------------------------------------------------------------------

interface PastePreviewProps {
  clipboard: ClipboardData;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

interface GhostWord {
  text: string;
  left: number;
  width: number;
  trackTop: number;
  trackHeight: number;
  overlaps: boolean;
  outOfBounds: boolean;
  isBg: boolean;
}

// -- Constants -----------------------------------------------------------------

const WAVEFORM_BORDER = 1;
const ROWS_START_Y = WAVEFORM_HEIGHT + WAVEFORM_BORDER;
const BG_DROP_ZONE_HEIGHT = 24;
const BG_BORDER = 1;

// -- Component -----------------------------------------------------------------

const PastePreview: React.FC<PastePreviewProps> = ({ clipboard, scrollContainerRef }) => {
  const [mousePos, setMousePos] = useState<{ clientX: number; clientY: number } | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ clientX: e.clientX, clientY: e.clientY });
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const commitPaste = useCallback(
    async (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const { zoom, rowHeights, defaultRowHeight, collapsedInstances } = useTimelineStore.getState();
      const lines = useProjectStore.getState().lines;
      const duration = useAudioStore.getState().duration;
      const layout = computeRowLayout({
        lines,
        rowHeights,
        defaultRowHeight,
        collapsedInstances,
        waveformHeight: ROWS_START_Y,
        bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
        groupHeaderHeight: GROUP_HEADER_HEIGHT,
      });

      const containerRect = container.getBoundingClientRect();
      const cursorTime = (e.clientX - containerRect.left - GUTTER_WIDTH + container.scrollLeft) / zoom;

      const cursorY = e.clientY - containerRect.top + container.scrollTop;
      const hoveredLineIndex = getLineIndexAtY(cursorY, lines, layout);

      const placeInstance = async (
        groupId: string,
        template: LineTemplate[],
        successMessage: string,
      ): Promise<boolean> => {
        if (template.length === 0) {
          toast.error("Could not derive instance template");
          return true;
        }
        const decision = decidePasteInstanceAction({
          lines,
          groupId,
          template,
          hoveredLineIndex,
          cursorTime,
        });
        if (decision.kind === "no-target") {
          toast.error(
            `Drop on ${template.length} empty line${template.length === 1 ? "" : "s"} to paste this instance`,
          );
          return true;
        }
        if (decision.kind === "fill") {
          useProjectStore.getState().setLinesWithHistory(decision.updatedLines);
          useTimelineStore.getState().setPasteMode({ status: "idle" });
          useTimelineStore.getState().clearSelection();
          toast.success(successMessage);
          return true;
        }
        const ok = await confirm({
          title: `Insert ${template.length} new row${template.length === 1 ? "" : "s"} here?`,
          description: `There ${template.length === 1 ? "isn't an empty row" : `aren't ${template.length} empty rows`} at this position. Inserting will shift every row below down by ${template.length}.`,
          confirmLabel: "Insert and paste",
          cancelLabel: "Cancel",
          variant: "destructive",
        });
        if (!ok) {
          useTimelineStore.getState().setPasteMode({ status: "idle" });
          return true;
        }
        useProjectStore.getState().addInstance(groupId, template, decision.instanceStart, decision.insertAt);
        useTimelineStore.getState().setPasteMode({ status: "idle" });
        useTimelineStore.getState().clearSelection();
        toast.success(successMessage);
        return true;
      };

      if (clipboard.sourceInstance) {
        const { groupId, instanceIdx } = clipboard.sourceInstance;
        const template = instanceToTemplate(lines, groupId, instanceIdx);
        await placeInstance(groupId, template, "Linked instance added");
        return;
      }

      if (clipboard.candidateLines && clipboard.candidateLines.length > 0) {
        const match = findMatchingTemplate(clipboard.candidateLines, lines);
        if (match) {
          const group = useProjectStore.getState().groups.find((g) => g.id === match.groupId);
          const groupLabel = group?.label ?? "group";
          const instanceCount = countInstances(lines, match.groupId);
          const ok = await confirm({
            title: `Link as another ${groupLabel}?`,
            description: `These ${clipboard.candidateLines.length} lines look like a ${groupLabel} (matches ${instanceCount} instance${instanceCount === 1 ? "" : "s"}). Link as another instance, or paste as plain words?`,
            confirmLabel: "Link as instance",
            cancelLabel: "Paste as words",
          });
          if (ok) {
            const template = instanceToTemplate(lines, match.groupId, match.instanceIdx);
            await placeInstance(match.groupId, template, `Linked as another ${groupLabel}`);
            return;
          }
        }
      }

      const targetLineIndex = hoveredLineIndex;
      if (targetLineIndex < 0) return;

      const firstEntry = clipboard.entries[0];
      const timeDelta = cursorTime - firstEntry.word.begin;

      const hasOverlap = checkOverlaps(clipboard, targetLineIndex, timeDelta, lines, duration);
      if (hasOverlap) return;

      const updates: Array<{ id: string; updates: Partial<LyricLine> }> = [];

      const grouped = new Map<number, typeof clipboard.entries>();
      for (const entry of clipboard.entries) {
        const lineIdx = targetLineIndex + entry.lineOffset;
        if (lineIdx < 0 || lineIdx >= lines.length) return;
        const arr = grouped.get(lineIdx) ?? [];
        arr.push(entry);
        grouped.set(lineIdx, arr);
      }

      for (const [lineIdx, entries] of grouped) {
        const line = lines[lineIdx];
        const newWords: WordTiming[] = [];
        const newBgWords: WordTiming[] = [];

        for (const entry of entries) {
          const newBegin = Math.max(0, entry.word.begin + timeDelta);
          const newEnd = Math.min(duration, entry.word.end + timeDelta);
          const newWord = { ...entry.word, begin: newBegin, end: newEnd };

          if (entry.trackType === "word") newWords.push(newWord);
          else newBgWords.push(newWord);
        }

        const lineUpdates: Partial<LyricLine> = {};

        if (newWords.length > 0) {
          lineUpdates.words = mergeWordsIntoTrack(line.words ?? [], newWords);
        }
        if (newBgWords.length > 0) {
          Object.assign(
            lineUpdates,
            manualBackgroundWordEdit(mergeWordsIntoTrack(line.backgroundWords ?? [], newBgWords)),
          );
        }

        updates.push({ id: line.id, updates: lineUpdates });
      }

      if (updates.length > 0) {
        useProjectStore.getState().updateLinesWithHistory(updates);
        useTimelineStore.getState().setPasteMode({ status: "idle" });
        useTimelineStore.getState().clearSelection();
      }
    },
    [clipboard, scrollContainerRef, confirm],
  );

  const modalCount = useModalStackStore((s) => s.count);

  // Reactive subscriptions BEFORE the early returns so the layout memo can run
  // every render. Mousemove updates mousePos but does not invalidate the layout
  // memo dependencies, so the layout stays stable across cursor moves.
  const zoom = useTimelineStore((s) => s.zoom);
  const rowHeights = useTimelineStore((s) => s.rowHeights);
  const defaultRowHeight = useTimelineStore((s) => s.defaultRowHeight);
  const collapsedInstances = useTimelineStore((s) => s.collapsedInstances);
  const lines = useProjectStore((s) => s.lines);
  const duration = useAudioStore((s) => s.duration);

  const layout = useMemo(
    () =>
      computeRowLayout({
        lines,
        rowHeights,
        defaultRowHeight,
        collapsedInstances,
        waveformHeight: ROWS_START_Y,
        bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
        groupHeaderHeight: GROUP_HEADER_HEIGHT,
      }),
    [lines, rowHeights, defaultRowHeight, collapsedInstances],
  );

  const container = scrollContainerRef.current;
  if (!container || !mousePos || modalCount > 0) return null;

  const containerRect = container.getBoundingClientRect();
  const cursorTime = (mousePos.clientX - containerRect.left - GUTTER_WIDTH + container.scrollLeft) / zoom;
  const cursorY = mousePos.clientY - containerRect.top + container.scrollTop;
  const isInstancePaste = !!clipboard.sourceInstance;
  const hoveredLineIndex = getLineIndexAtY(cursorY, lines, layout);
  const targetLineIndex =
    hoveredLineIndex >= 0 ? hoveredLineIndex : isInstancePaste ? Math.max(0, lines.length - 1) : -1;

  if (targetLineIndex < 0) return null;

  const firstEntry = clipboard.entries[0];
  const timeDelta = cursorTime - firstEntry.word.begin;

  const hasOverlap = isInstancePaste ? false : checkOverlaps(clipboard, targetLineIndex, timeDelta, lines, duration);

  const ghosts = computeGhosts(clipboard, targetLineIndex, timeDelta, lines, zoom, duration, layout, defaultRowHeight);

  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label="Place pasted content here"
      className={cn("absolute inset-0 z-55", hasOverlap ? "cursor-not-allowed" : "cursor-copy")}
      onClick={commitPaste}
      onKeyDown={() => {}}
    >
      {ghosts.map((ghost) => (
        <div
          key={`${ghost.left}-${ghost.trackTop}-${ghost.text}-${ghost.isBg ? "bg" : "w"}`}
          className={cn(
            "absolute flex items-center justify-center text-xs text-white truncate rounded-xl border pointer-events-none",
            ghost.overlaps || ghost.outOfBounds
              ? "bg-red-500/30 border-red-500/60"
              : "bg-composer-accent/30 border-composer-accent/60",
            ghost.isBg && "opacity-70",
          )}
          style={{
            left: ghost.left - scrollLeft,
            top: ghost.trackTop - scrollTop + 4,
            width: ghost.width,
            height: ghost.trackHeight - 8,
          }}
        >
          <span className="px-1 truncate opacity-70">{ghost.text}</span>
        </div>
      ))}
    </div>
  );
};

// -- Helpers -------------------------------------------------------------------

function countInstances(lines: LyricLine[], groupId: string): number {
  const seen = new Set<number>();
  for (const line of lines) {
    if (line.groupId === groupId && line.instanceIdx !== undefined) seen.add(line.instanceIdx);
  }
  return seen.size;
}

function getLineIndexAtY(y: number, lines: LyricLine[], layout: RowLayout): number {
  for (let i = 0; i < lines.length; i++) {
    const pos = layout.lineTops.get(lines[i].id);
    if (!pos) continue;
    if (y >= pos.top && y < pos.top + pos.height) return i;
  }
  return -1;
}

function checkOverlaps(
  clipboard: ClipboardData,
  targetLineIndex: number,
  timeDelta: number,
  lines: LyricLine[],
  duration: number,
): boolean {
  for (const entry of clipboard.entries) {
    const lineIdx = targetLineIndex + entry.lineOffset;
    if (lineIdx < 0 || lineIdx >= lines.length) return true;

    const newBegin = Math.max(0, entry.word.begin + timeDelta);
    const newEnd = Math.min(duration, entry.word.end + timeDelta);
    if (newEnd <= newBegin) return true;

    const line = lines[lineIdx];
    const wordsArray = entry.trackType === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) continue;

    for (const existing of wordsArray) {
      if (newBegin < existing.end && newEnd > existing.begin) return true;
    }
  }
  return false;
}

function computeGhosts(
  clipboard: ClipboardData,
  targetLineIndex: number,
  timeDelta: number,
  lines: LyricLine[],
  zoom: number,
  duration: number,
  layout: RowLayout,
  defaultRowHeight: number,
): GhostWord[] {
  const ghosts: GhostWord[] = [];

  let layoutEnd = 0;
  for (const pos of layout.lineTops.values()) layoutEnd = Math.max(layoutEnd, pos.top + pos.height);
  for (const pos of layout.headerTops.values()) layoutEnd = Math.max(layoutEnd, pos.top + pos.height);

  for (const entry of clipboard.entries) {
    const lineIdx = targetLineIndex + entry.lineOffset;
    const inRange = lineIdx >= 0 && lineIdx < lines.length;
    const targetLine = inRange ? lines[lineIdx] : null;
    const targetPos = targetLine ? layout.lineTops.get(targetLine.id) : null;
    const outOfBounds = !targetLine || !targetPos;
    const isBg = entry.trackType === "bg";

    const newBegin = Math.max(0, entry.word.begin + timeDelta);
    const newEnd = Math.min(duration, entry.word.end + timeDelta);

    const left = GUTTER_WIDTH + newBegin * zoom;
    const width = Math.max((newEnd - newBegin) * zoom, 4);

    let overlaps = outOfBounds;
    if (targetLine && !outOfBounds) {
      const wordsArray = isBg ? targetLine.backgroundWords : targetLine.words;
      if (wordsArray) {
        for (const existing of wordsArray) {
          if (newBegin < existing.end && newEnd > existing.begin) {
            overlaps = true;
            break;
          }
        }
      }
    }

    let trackTop: number;
    let trackHeight: number;

    if (!targetPos || !targetLine) {
      trackTop = layoutEnd;
      trackHeight = defaultRowHeight;
    } else {
      const hasBg = !!(targetLine.backgroundWords && targetLine.backgroundWords.length > 0);
      const bgHeight = hasBg ? (targetPos.height - 1) / 2 : BG_DROP_ZONE_HEIGHT;
      const mainHeight = targetPos.height - 1 - bgHeight;
      if (isBg) {
        trackTop = targetPos.top + mainHeight + BG_BORDER;
        trackHeight = bgHeight;
      } else {
        trackTop = targetPos.top;
        trackHeight = mainHeight;
      }
    }

    ghosts.push({
      text: entry.word.text,
      left,
      width,
      trackTop,
      trackHeight,
      overlaps,
      outOfBounds,
      isBg,
    });
  }

  return ghosts;
}

// -- Exports -------------------------------------------------------------------

export { PastePreview };
