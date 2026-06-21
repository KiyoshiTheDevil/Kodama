import { belongsToInstance } from "@/domain/instance/predicates";
import { type LyricLine, reconcileLine } from "@/domain/line/model";
import type { LinkGroup } from "@/domain/group/template";
import { commitHistory } from "@/stores/project/history-helpers";
import type { GroupActions, GroupsState, ProjectStore } from "@/stores/project/types";
import { GROUP_COLORS, pickNextGroupColor } from "@/utils/group-colors";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createGroupsInitialState(): GroupsState {
  return {
    groups: [],
  };
}

// -- Slice --------------------------------------------------------------------

const createGroupsSlice: StateCreator<ProjectStore, [], [], GroupsState & GroupActions> = (set) => ({
  ...createGroupsInitialState(),

  setGroups: (groups) => set({ groups: Array.isArray(groups) ? groups : [], isDirty: true, isDirtySinceHistory: true }),

  addGroup: (group) => set((state) => commitHistory(state, { groups: [...state.groups, group] })),

  addGroupWithLines: (group, lines) =>
    set((state) => commitHistory(state, { groups: [...state.groups, group], lines })),

  groupRepeatingSections: (starts, length, options = {}) =>
    set((state) => {
      if (starts.length < 2 || length < 1) return state;

      const covered = new Set<number>();
      for (const start of starts) {
        for (let p = start; p < start + length; p++) {
          if (p < 0 || p >= state.lines.length) return state;
          if (state.lines[p].groupId !== undefined) return state;
          if (covered.has(p)) return state;
          covered.add(p);
        }
      }

      const usedGroupIds = new Set(state.groups.map((g) => g.id));
      let n = 1;
      while (usedGroupIds.has(`g${n}`)) n++;
      const groupId = `g${n}`;

      const usedColors = state.groups.map((g) => g.color);
      const color = options.color ?? pickNextGroupColor(usedColors.length > 0 ? usedColors : GROUP_COLORS.slice(0, 0));
      const label = options.label ?? `Group ${state.groups.length + 1}`;

      const startToInstanceIdx = new Map<number, number>();
      const sortedStarts = starts.toSorted((a, b) => a - b);
      sortedStarts.forEach((s, i) => startToInstanceIdx.set(s, i));

      const updatedLines = state.lines.map((line, idx) => {
        for (const start of sortedStarts) {
          if (idx >= start && idx < start + length) {
            return {
              ...line,
              groupId,
              instanceIdx: startToInstanceIdx.get(start) ?? 0,
              templateLineIdx: idx - start,
            };
          }
        }
        return line;
      });

      const group: LinkGroup = { id: groupId, label, color, templateVersion: 1 };

      return commitHistory(state, { groups: [...state.groups, group], lines: updatedLines });
    }),

  updateGroup: (id, updates) =>
    set((state) =>
      commitHistory(state, {
        groups: state.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      }),
    ),

  removeGroup: (id) =>
    set((state) =>
      commitHistory(state, {
        groups: state.groups.filter((g) => g.id !== id),
        lines: state.lines.map((line) =>
          line.groupId === id
            ? {
                ...line,
                groupId: undefined,
                instanceIdx: undefined,
                templateLineIdx: undefined,
                detached: undefined,
              }
            : line,
        ),
      }),
    ),

  addInstance: (groupId, structure, instanceStart, insertAtIndex) =>
    set((state) => {
      const usedIndices = new Set(
        state.lines.flatMap((l) => (l.groupId === groupId && l.instanceIdx !== undefined ? [l.instanceIdx] : [])),
      );
      let instanceIdx = 0;
      while (usedIndices.has(instanceIdx)) instanceIdx++;

      const newLines: LyricLine[] = structure.map((tplLine, templateLineIdx) =>
        reconcileLine({
          id: crypto.randomUUID(),
          text: tplLine.text,
          agentId: tplLine.agentId,
          groupId,
          instanceIdx,
          templateLineIdx,
          ...(tplLine.relativeBegin !== undefined ? { begin: tplLine.relativeBegin + instanceStart } : {}),
          ...(tplLine.relativeEnd !== undefined ? { end: tplLine.relativeEnd + instanceStart } : {}),
          ...(tplLine.words
            ? {
                words: tplLine.words.map((w) => ({
                  text: w.text,
                  begin: w.relativeBegin + instanceStart,
                  end: w.relativeEnd + instanceStart,
                  ...(w.explicit ? { explicit: true as const } : {}),
                })),
              }
            : {}),
          ...(tplLine.backgroundText !== undefined ? { backgroundText: tplLine.backgroundText } : {}),
          ...(tplLine.backgroundWords
            ? {
                backgroundWords: tplLine.backgroundWords.map((w) => ({
                  text: w.text,
                  begin: w.relativeBegin + instanceStart,
                  end: w.relativeEnd + instanceStart,
                  ...(w.explicit ? { explicit: true as const } : {}),
                })),
              }
            : {}),
          ...(tplLine.backgroundTextSource !== undefined ? { backgroundTextSource: tplLine.backgroundTextSource } : {}),
        }),
      );

      const insertedLines =
        insertAtIndex === undefined || insertAtIndex >= state.lines.length || insertAtIndex < 0
          ? [...state.lines, ...newLines]
          : [...state.lines.slice(0, insertAtIndex), ...newLines, ...state.lines.slice(insertAtIndex)];

      return commitHistory(state, { lines: insertedLines });
    }),

  removeInstance: (groupId, instanceIdx) =>
    set((state) => {
      const detachedLines = state.lines.map((line) =>
        belongsToInstance(line, groupId, instanceIdx)
          ? {
              ...line,
              groupId: undefined,
              instanceIdx: undefined,
              templateLineIdx: undefined,
              detached: undefined,
            }
          : line,
      );

      const remainingInGroup = detachedLines.some((l) => l.groupId === groupId);
      const nextGroups = remainingInGroup ? state.groups : state.groups.filter((g) => g.id !== groupId);

      return commitHistory(state, { lines: detachedLines, groups: nextGroups });
    }),

  detachLine: (lineId) =>
    set((state) =>
      commitHistory(state, {
        lines: state.lines.map((line) =>
          line.id === lineId
            ? {
                ...line,
                groupId: undefined,
                instanceIdx: undefined,
                templateLineIdx: undefined,
                detached: undefined,
              }
            : line,
        ),
      }),
    ),

  shiftInstance: (groupId, instanceIdx, deltaSeconds) =>
    set((state) =>
      commitHistory(state, {
        lines: state.lines.map((line) => {
          if (line.groupId !== groupId || line.instanceIdx !== instanceIdx || line.detached) return line;
          return reconcileLine({
            ...line,
            begin: line.begin !== undefined ? line.begin + deltaSeconds : undefined,
            end: line.end !== undefined ? line.end + deltaSeconds : undefined,
            words: line.words?.map((w) => ({
              ...w,
              begin: w.begin + deltaSeconds,
              end: w.end + deltaSeconds,
            })),
            backgroundWords: line.backgroundWords?.map((w) => ({
              ...w,
              begin: w.begin + deltaSeconds,
              end: w.end + deltaSeconds,
            })),
          });
        }),
      }),
    ),
});

// -- Exports ------------------------------------------------------------------

export { createGroupsSlice, createGroupsInitialState };
