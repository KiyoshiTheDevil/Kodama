import { commitPendingEdit } from "@/stores/project/history-helpers";
import type { HistoryActions, HistoryState, ProjectStore } from "@/stores/project/types";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createHistoryInitialState(): HistoryState {
  return {
    isDirty: false,
    history: [],
    historyIndex: -1,
    isDirtySinceHistory: false,
  };
}

// -- Slice --------------------------------------------------------------------

const createHistorySlice: StateCreator<ProjectStore, [], [], HistoryState & HistoryActions> = (set, get) => ({
  ...createHistoryInitialState(),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),

  undo: () =>
    set((state) => {
      // historyIndex points to current state, so we need > 0 to have something to undo to
      if (state.historyIndex <= 0) return state;
      const entry = state.history[state.historyIndex - 1];
      return {
        lines: structuredClone(entry.lines),
        groups: structuredClone(entry.groups),
        historyIndex: state.historyIndex - 1,
        isDirty: true,
        isDirtySinceHistory: false,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state;
      const entry = state.history[state.historyIndex + 1];
      return {
        lines: structuredClone(entry.lines),
        groups: structuredClone(entry.groups),
        historyIndex: state.historyIndex + 1,
        isDirty: true,
        isDirtySinceHistory: false,
      };
    }),

  commitPendingLineEdit: (baseline, baselineWasDirty) =>
    set((state) => commitPendingEdit(state, baseline, baselineWasDirty)),

  canUndo: () => get().historyIndex > 0,

  canRedo: () => get().historyIndex < get().history.length - 1,

  clearHistory: () => set({ history: [], historyIndex: -1 }),
});

// -- Exports ------------------------------------------------------------------

export { createHistorySlice, createHistoryInitialState };
