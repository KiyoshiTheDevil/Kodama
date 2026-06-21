import type { LyricLine } from "@/domain/line/model";
import { withDerivedText } from "@/domain/line/reconstruct-text";
import type { LinkGroup } from "@/domain/group/template";
import type { ProjectState } from "@/stores/project/types";
import { getSplitCharacter } from "@/utils/split-character";

// -- Constants ----------------------------------------------------------------

const MAX_HISTORY_SIZE = 100;

// -- History Helper -----------------------------------------------------------

function commitHistory(
  state: ProjectState,
  changes: { lines?: LyricLine[]; groups?: LinkGroup[] },
  options: { deriveText?: boolean } = {},
) {
  const splitChar = getSplitCharacter();
  const deriveText = options.deriveText ?? true;
  const nextLines = changes.lines
    ? deriveText
      ? changes.lines.map((line) => withDerivedText(line, splitChar))
      : changes.lines
    : state.lines;
  const nextGroups = changes.groups ?? state.groups;

  const newHistory = state.history.slice(0, state.historyIndex + 1);
  if (newHistory.length === 0 || state.isDirtySinceHistory) {
    newHistory.push({
      lines: structuredClone(state.lines),
      groups: structuredClone(state.groups),
      timestamp: Date.now(),
    });
  }
  newHistory.push({
    lines: structuredClone(nextLines),
    groups: structuredClone(nextGroups),
    timestamp: Date.now(),
  });
  if (newHistory.length > MAX_HISTORY_SIZE) newHistory.shift();
  return {
    lines: nextLines,
    groups: nextGroups,
    isDirty: true,
    isDirtySinceHistory: false,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

function commitPendingEdit(state: ProjectState, baseline: LyricLine[], baselineWasDirty = false) {
  if (!state.isDirtySinceHistory) return {};
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  // Seed the pre-run baseline when a non-history mutation dirtied the store
  // before the run, otherwise undo would skip straight past it.
  if (newHistory.length === 0 || baselineWasDirty) {
    newHistory.push({
      lines: structuredClone(baseline),
      groups: structuredClone(state.groups),
      timestamp: Date.now(),
    });
  }
  newHistory.push({
    lines: structuredClone(state.lines),
    groups: structuredClone(state.groups),
    timestamp: Date.now(),
  });
  if (newHistory.length > MAX_HISTORY_SIZE) newHistory.shift();
  return {
    isDirty: true,
    isDirtySinceHistory: false,
    history: newHistory,
    historyIndex: newHistory.length - 1,
  };
}

// -- Exports ------------------------------------------------------------------

export { commitHistory, commitPendingEdit, MAX_HISTORY_SIZE };
