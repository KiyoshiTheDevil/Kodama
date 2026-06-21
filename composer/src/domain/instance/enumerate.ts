import { belongsToInstance } from "@/domain/instance/predicates";
import type { LyricLine } from "@/domain/line/model";

// -- Functions ----------------------------------------------------------------

function linesOfInstance(lines: ReadonlyArray<LyricLine>, groupId: string, instanceIdx: number): LyricLine[] {
  return lines.filter((line) => belongsToInstance(line, groupId, instanceIdx));
}

// -- Exports ------------------------------------------------------------------

export { linesOfInstance };
