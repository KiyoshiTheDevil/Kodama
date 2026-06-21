import { createAgentsSlice } from "@/stores/project/agents-slice";
import { createDismissalsSlice } from "@/stores/project/dismissals-slice";
import { createGroupsSlice } from "@/stores/project/groups-slice";
import { createHistorySlice } from "@/stores/project/history-slice";
import { createLinesSlice } from "@/stores/project/lines-slice";
import { createMetadataSlice, createProjectInitialState } from "@/stores/project/metadata-slice";
import type { ProjectState, ProjectStore } from "@/stores/project/types";
import { createUiSlice } from "@/stores/project/ui-slice";
import { create } from "zustand";

// -- Initial State ------------------------------------------------------------

function createInitialState(): ProjectState {
  return createProjectInitialState();
}

const INITIAL_STATE: ProjectState = createInitialState();

// -- Store --------------------------------------------------------------------

const useProjectStore = create<ProjectStore>((set, get, api) => ({
  ...createMetadataSlice(set, get, api),
  ...createLinesSlice(set, get, api),
  ...createAgentsSlice(set, get, api),
  ...createGroupsSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createDismissalsSlice(set, get, api),
}));

export { useProjectStore, INITIAL_STATE };

export type { GranularityMode, SimpleTab } from "@/stores/project/types";
