import { createAgentsInitialState } from "@/stores/project/agents-slice";
import { createDismissalsInitialState } from "@/stores/project/dismissals-slice";
import { createGroupsInitialState } from "@/stores/project/groups-slice";
import { createHistoryInitialState } from "@/stores/project/history-slice";
import { createLinesInitialState } from "@/stores/project/lines-slice";
import type { MetadataActions, MetadataState, ProjectState, ProjectStore } from "@/stores/project/types";
import { createUiInitialState } from "@/stores/project/ui-slice";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createMetadataInitialState(): MetadataState {
  return {
    metadata: {
      title: "",
      artist: "",
      album: "",
      duration: 0,
    },
  };
}

function createProjectInitialState(): ProjectState {
  return {
    ...createMetadataInitialState(),
    ...createAgentsInitialState(),
    ...createLinesInitialState(),
    ...createGroupsInitialState(),
    ...createUiInitialState(),
    ...createDismissalsInitialState(),
    ...createHistoryInitialState(),
  };
}

// -- Slice --------------------------------------------------------------------

const createMetadataSlice: StateCreator<ProjectStore, [], [], MetadataState & MetadataActions> = (set) => ({
  ...createMetadataInitialState(),

  setMetadata: (metadata) =>
    set((state) => ({
      metadata: { ...state.metadata, ...metadata },
      isDirty: true,
    })),

  reset: () => set(createProjectInitialState()),
});

// -- Exports ------------------------------------------------------------------

export { createMetadataSlice, createProjectInitialState };
