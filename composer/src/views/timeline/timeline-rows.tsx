import { useAudioStore } from "@/stores/audio";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import type { LyricLine } from "@/domain/line/model";
import { useProjectStore } from "@/stores/project";
import type { WordTiming } from "@/domain/word/timing";
import { applyWordPatch } from "@/utils/word-patch";
import { GROUP_HEADER_HEIGHT, GroupHeaderRow } from "@/views/timeline/group-header-row";
import { LineRow } from "@/views/timeline/line-row";
import { DEFAULT_ROW_HEIGHT, GUTTER_WIDTH, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { isLinked } from "@/domain/instance/predicates";
import { isLineSynced } from "@/domain/line/predicates";
import { type EffectiveRow, getEffectiveRows } from "@/views/timeline/utils";
import { type RefObject, useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";

// -- Types ---------------------------------------------------------------------

interface TimelineRowsProps {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

// -- Constants -----------------------------------------------------------------

const BG_DROP_ZONE_HEIGHT = 24;

// -- Component -----------------------------------------------------------------

const TimelineRows: React.FC<TimelineRowsProps> = ({ scrollContainerRef }) => {
  const lines = useProjectStore((s) => s.lines);
  const groups = useProjectStore((s) => s.groups);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const duration = useAudioStore((s) => s.duration);
  const zoom = useTimelineStore((s) => s.zoom);
  const rowHeights = useTimelineStore((s) => s.rowHeights);
  const collapsedInstances = useTimelineStore((s) => s.collapsedInstances);

  const allRows = useMemo(() => getEffectiveRows(lines), [lines]);

  const visibleRows = useMemo(() => {
    const out: EffectiveRow[] = [];
    let hideUntilNextNonGroup = false;
    let activeKey: string | null = null;
    for (const row of allRows) {
      if (row.kind === "group-header") {
        const key = `${row.groupId}:${row.instanceIdx}`;
        const hidden = collapsedInstances[key] ?? false;
        out.push(row);
        hideUntilNextNonGroup = hidden;
        activeKey = key;
        continue;
      }
      if (hideUntilNextNonGroup) {
        const lineKey = isLinked(row.line) ? `${row.line.groupId}:${row.line.instanceIdx}` : null;
        if (lineKey === activeKey) continue;
        hideUntilNextNonGroup = false;
        activeKey = null;
      }
      out.push(row);
    }
    return out;
  }, [allRows, collapsedInstances]);

  const instanceCountsByGroupId = useMemo(() => {
    const seen = new Set<string>();
    const out: Record<string, number> = {};
    for (const line of lines) {
      if (!isLinked(line)) continue;
      const key = `${line.groupId}:${line.instanceIdx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out[line.groupId] = (out[line.groupId] ?? 0) + 1;
    }
    return out;
  }, [lines]);

  const groupsById = useMemo(() => new Map((groups ?? []).map((g) => [g.id, g])), [groups]);

  const handleUpdateWord = useCallback(
    (
      lineId: string,
      wordIndex: number,
      updates: Partial<WordTiming>,
      adjacentIndex?: number,
      adjacentUpdates?: Partial<WordTiming>,
    ) => {
      const realLine = lines.find((l) => l.id === lineId);
      if (!realLine) return;

      if (isLineSynced(realLine)) {
        const lineUpdates: Partial<LyricLine> = {};
        if (updates.begin !== undefined) lineUpdates.begin = updates.begin;
        if (updates.end !== undefined) lineUpdates.end = updates.end;
        updateLineWithHistory(lineId, lineUpdates, { propagateToSiblings: false });
        return;
      }

      if (!realLine.words) return;
      const updatedWords = applyWordPatch(
        realLine.words,
        wordIndex,
        updates,
        adjacentIndex !== undefined && adjacentUpdates ? { index: adjacentIndex, updates: adjacentUpdates } : undefined,
      );
      if (!updatedWords) return;
      updateLineWithHistory(lineId, { words: updatedWords }, { propagateToSiblings: false });
    },
    [lines, updateLineWithHistory],
  );

  const handleUpdateBgWord = useCallback(
    (
      lineId: string,
      wordIndex: number,
      updates: Partial<WordTiming>,
      adjacentIndex?: number,
      adjacentUpdates?: Partial<WordTiming>,
    ) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line?.backgroundWords) return;

      const updatedWords = applyWordPatch(
        line.backgroundWords,
        wordIndex,
        updates,
        adjacentIndex !== undefined && adjacentUpdates ? { index: adjacentIndex, updates: adjacentUpdates } : undefined,
      );
      if (!updatedWords) return;
      updateLineWithHistory(lineId, manualBackgroundWordEdit(updatedWords), { propagateToSiblings: false });
    },
    [lines, updateLineWithHistory],
  );

  const totalWidth = duration * zoom;

  const getRowHeight = useCallback(
    (index: number) => {
      const row = visibleRows[index];
      if (!row) return DEFAULT_ROW_HEIGHT + BG_DROP_ZONE_HEIGHT;
      if (row.kind === "group-header") return GROUP_HEADER_HEIGHT;
      const mainHeight = rowHeights[row.line.id] ?? DEFAULT_ROW_HEIGHT;
      const hasBgWords = row.line.backgroundWords && row.line.backgroundWords.length > 0;
      return mainHeight + (hasBgWords ? mainHeight : BG_DROP_ZONE_HEIGHT) + 1;
    },
    [visibleRows, rowHeights],
  );

  const totalHeight = useMemo(
    () => visibleRows.reduce((sum, _, i) => sum + getRowHeight(i), 0),
    [visibleRows, getRowHeight],
  );

  return (
    <div style={{ width: totalWidth + GUTTER_WIDTH, minWidth: "100%", height: totalHeight }}>
      <Virtuoso
        data={visibleRows}
        computeItemKey={(_, row) =>
          row.kind === "group-header" ? `header:${row.groupId}:${row.instanceIdx}` : row.line.id
        }
        itemContent={(_, row) => {
          if (row.kind === "group-header") {
            const group = groupsById.get(row.groupId);
            if (!group) return <div style={{ height: GROUP_HEADER_HEIGHT }} />;
            return (
              <GroupHeaderRow
                group={group}
                instanceIdx={row.instanceIdx}
                totalInstances={instanceCountsByGroupId[row.groupId] ?? 1}
                instanceStart={row.instanceStart}
                instanceEnd={row.instanceEnd}
              />
            );
          }
          const line = row.line;
          return (
            <LineRow
              line={line}
              lineIndex={row.lineIndex}
              duration={duration}
              onUpdateWord={(wordIndex, updates, adjacentIndex, adjacentUpdates) =>
                handleUpdateWord(line.id, wordIndex, updates, adjacentIndex, adjacentUpdates)
              }
              onUpdateBgWord={(wordIndex, updates, adjacentIndex, adjacentUpdates) =>
                handleUpdateBgWord(line.id, wordIndex, updates, adjacentIndex, adjacentUpdates)
              }
            />
          );
        }}
        style={{ height: "100%", width: "100%" }}
        customScrollParent={scrollContainerRef.current ?? undefined}
        overscan={200}
        defaultItemHeight={DEFAULT_ROW_HEIGHT + BG_DROP_ZONE_HEIGHT}
        increaseViewportBy={{ top: WAVEFORM_HEIGHT, bottom: 0 }}
      />
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

export { TimelineRows };
