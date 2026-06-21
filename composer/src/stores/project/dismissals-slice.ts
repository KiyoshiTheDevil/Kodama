import type { DismissalActions, DismissalsState, ProjectStore } from "@/stores/project/types";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createDismissalsInitialState(): DismissalsState {
  return {
    dismissedSuggestions: [],
    dismissedExplicitSuggestions: [],
  };
}

// -- Slice --------------------------------------------------------------------

const createDismissalsSlice: StateCreator<ProjectStore, [], [], DismissalsState & DismissalActions> = (set) => ({
  ...createDismissalsInitialState(),

  dismissSuggestion: (fingerprint) =>
    set((state) => {
      if (state.dismissedSuggestions.includes(fingerprint)) return state;
      return { dismissedSuggestions: [...state.dismissedSuggestions, fingerprint], isDirty: true };
    }),

  setDismissedSuggestions: (fingerprints) => set({ dismissedSuggestions: fingerprints }),

  clearDismissedSuggestions: () => set({ dismissedSuggestions: [], isDirty: true }),

  dismissExplicitSuggestion: (fingerprint) =>
    set((state) => {
      if (state.dismissedExplicitSuggestions.includes(fingerprint)) return state;
      return {
        dismissedExplicitSuggestions: [...state.dismissedExplicitSuggestions, fingerprint],
        isDirty: true,
      };
    }),

  setDismissedExplicitSuggestions: (fingerprints) => set({ dismissedExplicitSuggestions: fingerprints }),

  clearDismissedExplicitSuggestions: () => set({ dismissedExplicitSuggestions: [], isDirty: true }),
});

// -- Exports ------------------------------------------------------------------

export { createDismissalsSlice, createDismissalsInitialState };
