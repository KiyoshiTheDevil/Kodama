import { useDivergenceStore } from "@/stores/divergence-store";
import { useProjectStore } from "@/stores/project";
import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { showGroupActionToast } from "@/utils/group-toast";
import { wouldDivergenceCauseRetiming } from "@/utils/word-diff";

// Wraps a word-array write so that linked-line word-count changes prompt the
// user (Apply / Detach / Cancel) when at least one sibling would have its
// per-word timing rewritten by the propagation. Falls through to a direct
// updateLineWithHistory write for:
//   - non-linked lines
//   - count-unchanged edits (no structural change)
//   - linked lines where every sibling already has timing identical to source
//     (the propagation would be a no-op against unchanged-word timings)
async function handleWordChangeWithDivergenceCheck(
  lineId: string,
  newWords: WordTiming[],
  field: "words" | "backgroundWords" = "words",
  extraUpdates: Partial<LyricLine> = {},
): Promise<void> {
  const lines = useProjectStore.getState().lines;
  const target = lines.find((l) => l.id === lineId);
  if (!target) return;

  const sourceBefore = target[field];
  const oldCount = sourceBefore?.length ?? 0;
  const isLinked = target.groupId !== undefined && target.templateLineIdx !== undefined && !target.detached;
  const countChanged = isLinked && newWords.length !== oldCount;

  if (!countChanged) {
    useProjectStore.getState().updateLineWithHistory(lineId, { ...extraUpdates, [field]: newWords });
    return;
  }

  if (!wouldDivergenceCauseRetiming(lines, lineId, newWords, field)) {
    useProjectStore.getState().applyWordCountChange(lineId, newWords, field, "apply", extraUpdates);
    return;
  }

  const groupId = target.groupId as string;
  const templateLineIdx = target.templateLineIdx as number;
  const affectedSiblingCount = lines.filter(
    (l) => l.id !== lineId && l.groupId === groupId && l.templateLineIdx === templateLineIdx && !l.detached && l[field],
  ).length;
  const groupLabel = useProjectStore.getState().groups.find((g) => g.id === groupId)?.label;

  const resolution = await useDivergenceStore.getState().open({ affectedSiblingCount, groupLabel });
  useProjectStore.getState().applyWordCountChange(lineId, newWords, field, resolution, extraUpdates);
  if (resolution === "apply") showGroupActionToast("Word structure synced across instances");
  else if (resolution === "detach") showGroupActionToast("Line detached from group");
}

// -- Exports ------------------------------------------------------------------

export { handleWordChangeWithDivergenceCheck };
