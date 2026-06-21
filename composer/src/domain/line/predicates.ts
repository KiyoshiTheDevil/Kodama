import type { LineSyncedLine, LyricLine } from "@/domain/line/model";

// -- Predicates ---------------------------------------------------------------

function isLineSynced(line: LyricLine): line is LineSyncedLine {
  return !line.words?.length && line.begin !== undefined && line.end !== undefined;
}

function isWordSynced(line: LyricLine): boolean {
  return !!line.words?.length;
}

function hasAnyTiming(line: LyricLine): boolean {
  return isWordSynced(line) || isLineSynced(line) || !!line.backgroundWords?.length;
}

// -- Exports ------------------------------------------------------------------

export { hasAnyTiming, isLineSynced, isWordSynced };
