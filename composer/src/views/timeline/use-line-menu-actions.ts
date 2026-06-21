import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { showGroupActionToast } from "@/utils/group-toast";
import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";
import { splitLinesIntoWords } from "@/views/timeline/split-lines-into-words";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import type { useContextMenuTargets } from "@/views/timeline/use-context-menu-targets";
import { useCallback } from "react";

// -- Interfaces ---------------------------------------------------------------

type ContextMenuTargets = ReturnType<typeof useContextMenuTargets>;

// -- Hook ---------------------------------------------------------------------

function useLineMenuActions(targets: ContextMenuTargets, clearContextMenu: () => void) {
  const { lines, gutterLineGroupInfo } = targets;
  const contextMenu = useTimelineStore((s) => s.contextMenu);
  const selectedWords = useTimelineStore((s) => s.selectedWords);
  const rawLines = useProjectStore((s) => s.lines);
  const agents = useProjectStore((s) => s.agents);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const setLinesWithHistory = useProjectStore((s) => s.setLinesWithHistory);

  const handlePlaceLineHere = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "track") return;
    const { lineId, time } = contextMenu.target;
    const line = rawLines.find((l) => l.id === lineId);
    if (!line) return;
    const wordDuration = useSettingsStore.getState().defaultWordDuration;
    const wordCount = splitIntoWordsWithMeta(line.text).parts.length;
    const lineDuration = Math.max(wordCount, 1) * wordDuration;
    updateLineWithHistory(lineId, {
      begin: time,
      end: time + lineDuration,
    });
    clearContextMenu();
  }, [contextMenu, rawLines, updateLineWithHistory, clearContextMenu]);

  const handleAddLine = useCallback(
    (position: "above" | "below") => {
      if (!contextMenu || contextMenu.target.kind !== "gutter") return;
      // Operate on raw lines, not effective lines. getEffectiveLines synthesises
      // single-word arrays for line-synced rows; if we wrote those back via
      // setLinesWithHistory, every line-synced row would silently flip to
      // word-synced (and TTML granularity would change on save).
      const lineId = contextMenu.target.lineId;
      const targetIndex = rawLines.findIndex((l) => l.id === lineId);
      if (targetIndex === -1) return;
      const defaultAgentId = agents?.[0]?.id ?? "v1";
      const newLine = { id: crypto.randomUUID(), text: "", agentId: defaultAgentId };
      const newLines = [...rawLines];
      const insertIndex = position === "above" ? targetIndex : targetIndex + 1;
      newLines.splice(insertIndex, 0, newLine);
      setLinesWithHistory(newLines);
      clearContextMenu();
    },
    [contextMenu, rawLines, agents, setLinesWithHistory, clearContextMenu],
  );

  const handleDeleteLine = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "gutter") return;
    const lineId = contextMenu.target.lineId;
    const newLines = rawLines.filter((l) => l.id !== lineId);
    setLinesWithHistory(newLines);
    clearContextMenu();
  }, [contextMenu, rawLines, setLinesWithHistory, clearContextMenu]);

  const handleDetachLine = useCallback(() => {
    if (!gutterLineGroupInfo) return;
    useProjectStore.getState().detachLine(gutterLineGroupInfo.lineId);
    showGroupActionToast("Line detached");
    clearContextMenu();
  }, [gutterLineGroupInfo, clearContextMenu]);

  const handleAssignAgent = useCallback(
    (agentId: string) => {
      if (!contextMenu || contextMenu.target.kind !== "gutter") return;
      const { lineId } = contextMenu.target;
      updateLineWithHistory(lineId, { agentId });
      clearContextMenu();
    },
    [contextMenu, updateLineWithHistory, clearContextMenu],
  );

  const handleSplitIntoWords = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "word") return;
    const { lineId } = contextMenu.target;

    const selectedLineIds = new Set(selectedWords.map((w) => w.lineId));
    const targetIds = selectedLineIds.has(lineId) && selectedLineIds.size > 0 ? [...selectedLineIds] : [lineId];

    splitLinesIntoWords(targetIds, lines);
    clearContextMenu();
  }, [contextMenu, selectedWords, lines, clearContextMenu]);

  return {
    handlePlaceLineHere,
    handleAddLine,
    handleDeleteLine,
    handleDetachLine,
    handleAssignAgent,
    handleSplitIntoWords,
  };
}

// -- Exports ------------------------------------------------------------------

export { useLineMenuActions };
