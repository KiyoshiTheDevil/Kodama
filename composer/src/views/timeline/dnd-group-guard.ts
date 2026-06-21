import type { LyricLine } from "@/domain/line/model";

// Pure helper: does moving a word from `source` to a target within `target`
// cross an instance boundary? Used by useTimelineDnd to refuse cross-instance
// drops with a toast.
//
// Rules:
// - Both lines standalone (no groupId on either): allowed
// - Source and target share the same group AND instanceIdx: allowed (within-instance reorder)
// - Any other combination: refused
function wouldDropCrossInstance(source: LyricLine, target: LyricLine): boolean {
  const sourceGrouped = source.groupId !== undefined;
  const targetGrouped = target.groupId !== undefined;
  if (!sourceGrouped && !targetGrouped) return false;
  if (sourceGrouped !== targetGrouped) return true;
  if (source.groupId !== target.groupId) return true;
  if (source.instanceIdx !== target.instanceIdx) return true;
  return false;
}

// -- Exports ------------------------------------------------------------------

export { wouldDropCrossInstance };
