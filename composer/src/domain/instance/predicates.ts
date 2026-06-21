import type { LyricLine } from "@/domain/line/model";

// -- Types --------------------------------------------------------------------

type LinkedLine = LyricLine & { groupId: string; instanceIdx: number };

// -- Predicates ---------------------------------------------------------------

function isLinked(line: LyricLine): line is LinkedLine {
  return line.groupId !== undefined && line.instanceIdx !== undefined;
}

function belongsToInstance(line: LyricLine, groupId: string, instanceIdx: number): boolean {
  return line.groupId === groupId && line.instanceIdx === instanceIdx;
}

// -- Exports ------------------------------------------------------------------

export { belongsToInstance, isLinked };
