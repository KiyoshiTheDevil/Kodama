import { instanceBounds } from "@/domain/instance/bounds";
import { linesOfInstance } from "@/domain/instance/enumerate";
import type { WordSelection } from "@/domain/selection/model";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { showGroupActionToast } from "@/utils/group-toast";
import { MOD_KEY } from "@/utils/platform";
import { copyInstanceToClipboardAndPreview } from "@/views/timeline/copy-instance-to-clipboard";
import { decideAddInstancePlacement } from "@/views/timeline/decide-add-instance-placement";
import { instanceToTemplate } from "@/views/timeline/group-ops";
import { scrollToInstanceHeader } from "@/views/timeline/scroll-helpers";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useCallback } from "react";
import { toast } from "sonner";

// -- Hook ---------------------------------------------------------------------

function useInstanceMenuActions(clearContextMenu: () => void) {
  const contextMenu = useTimelineStore((s) => s.contextMenu);

  const handleDetachInstance = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
    const { groupId, instanceIdx } = contextMenu.target;
    useProjectStore.getState().removeInstance(groupId, instanceIdx);
    showGroupActionToast("Instance detached");
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handleToggleCollapse = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
    const { groupId, instanceIdx } = contextMenu.target;
    useTimelineStore.getState().toggleInstanceCollapsed(`${groupId}:${instanceIdx}`);
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handleAddInstanceAtPlayhead = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
    const { groupId, instanceIdx } = contextMenu.target;
    const audioEl = useAudioStore.getState().audioElement;
    const playheadTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
    const projectLines = useProjectStore.getState().lines;
    const template = instanceToTemplate(projectLines, groupId, instanceIdx);
    if (template.length === 0) {
      toast.error("Could not derive instance template");
      return;
    }
    const placement = decideAddInstancePlacement({
      lines: projectLines,
      groupId,
      template,
      playheadTime,
    });
    if (placement.kind === "fill") {
      useProjectStore.getState().setLinesWithHistory(placement.updatedLines);
      toast.success("Linked instance placed in empty rows");
    } else if (placement.kind === "insert") {
      useProjectStore.getState().addInstance(groupId, template, placement.instanceStart, placement.insertAtIndex);
      toast.success("Linked instance added at playhead");
    } else {
      copyInstanceToClipboardAndPreview(projectLines, groupId, instanceIdx);
      toast(`No room at the playhead. ${MOD_KEY}+V to paste somewhere clear.`);
    }
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handleShiftToPlayhead = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
    const { groupId, instanceIdx } = contextMenu.target;
    const audioEl = useAudioStore.getState().audioElement;
    const playheadTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
    const projectLines = useProjectStore.getState().lines;
    const instanceLines = linesOfInstance(projectLines, groupId, instanceIdx);
    const bounds = instanceBounds(instanceLines);
    if (!bounds) return;
    const delta = playheadTime - bounds.begin;
    useProjectStore.getState().shiftInstance(groupId, instanceIdx, delta);
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handlePingSiblings = useCallback(() => {
    if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
    const { groupId } = contextMenu.target;
    useTimelineStore.getState().setPingingGroupId(groupId);
    window.setTimeout(() => {
      if (useTimelineStore.getState().pingingGroupId === groupId) {
        useTimelineStore.getState().setPingingGroupId(null);
      }
    }, 700);
    clearContextMenu();
  }, [contextMenu, clearContextMenu]);

  const handleJumpToInstanceOffset = useCallback(
    (direction: 1 | -1) => {
      if (!contextMenu || contextMenu.target.kind !== "group-banner") return;
      const { groupId, instanceIdx } = contextMenu.target;
      const projectLines = useProjectStore.getState().lines;
      const indices = new Set<number>();
      for (const l of projectLines) {
        if (l.groupId === groupId && l.instanceIdx !== undefined) indices.add(l.instanceIdx);
      }
      const sorted = Array.from(indices).sort((a, b) => a - b);
      if (sorted.length < 2) return;
      const here = sorted.indexOf(instanceIdx);
      const next = sorted[(here + direction + sorted.length) % sorted.length];
      const wordsInNext: WordSelection[] = [];
      for (let li = 0; li < projectLines.length; li++) {
        const line = projectLines[li];
        if (line.groupId !== groupId || line.instanceIdx !== next) continue;
        for (let wi = 0; wi < (line.words?.length ?? 0); wi++) {
          wordsInNext.push({ lineId: line.id, lineIndex: li, wordIndex: wi, type: "word" });
        }
        for (let wi = 0; wi < (line.backgroundWords?.length ?? 0); wi++) {
          wordsInNext.push({ lineId: line.id, lineIndex: li, wordIndex: wi, type: "bg" });
        }
      }
      useTimelineStore.getState().setSelectedWords(wordsInNext);
      scrollToInstanceHeader(groupId, next);
      clearContextMenu();
    },
    [contextMenu, clearContextMenu],
  );

  const handleJumpPrevInstance = useCallback(() => handleJumpToInstanceOffset(-1), [handleJumpToInstanceOffset]);
  const handleJumpNextInstance = useCallback(() => handleJumpToInstanceOffset(1), [handleJumpToInstanceOffset]);

  return {
    handleDetachInstance,
    handleToggleCollapse,
    handleAddInstanceAtPlayhead,
    handleShiftToPlayhead,
    handlePingSiblings,
    handleJumpPrevInstance,
    handleJumpNextInstance,
  };
}

// -- Exports ------------------------------------------------------------------

export { useInstanceMenuActions };
