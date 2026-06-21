import { useAudioStore } from "@/stores/audio";
import {
  DEFAULT_SYLLABLE_SPLIT_DEFAULTS,
  type ProjectStore,
  type UiActions,
  type UiState,
} from "@/stores/project/types";
import { useSettingsStore } from "@/stores/settings";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createUiInitialState(): UiState {
  return {
    granularity: useSettingsStore.getState().defaultGranularity,
    editorMode: "simple",
    activeTab: "import",
    syllableSplitDefaults: DEFAULT_SYLLABLE_SPLIT_DEFAULTS,
    primingStripped: false,
  };
}

// -- Slice --------------------------------------------------------------------

const createUiSlice: StateCreator<ProjectStore, [], [], UiState & UiActions> = (set) => ({
  ...createUiInitialState(),

  setGranularity: (granularity) => set({ granularity, isDirty: true }),

  setEditorMode: (editorMode) => set({ editorMode }),

  setActiveTab: (activeTab) => {
    if (activeTab === "export") {
      useAudioStore.getState().setIsPlaying(false);
    }
    set({ activeTab });
  },

  setSyllableSplitDefaults: (syllableSplitDefaults) => set({ syllableSplitDefaults, isDirty: true }),

  setPrimingStripped: (primingStripped) => set({ primingStripped, isDirty: true }),
});

// -- Exports ------------------------------------------------------------------

export { createUiSlice, createUiInitialState };
