import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import type { AgentActions, AgentsState, ProjectStore } from "@/stores/project/types";
import type { StateCreator } from "zustand";

// -- Initial State ------------------------------------------------------------

function createAgentsInitialState(): AgentsState {
  return {
    agents: DEFAULT_AGENTS,
  };
}

// -- Slice --------------------------------------------------------------------

const createAgentsSlice: StateCreator<ProjectStore, [], [], AgentsState & AgentActions> = (set) => ({
  ...createAgentsInitialState(),

  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent],
      isDirty: true,
    })),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      isDirty: true,
    })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      isDirty: true,
    })),

  setAgents: (agents) => set({ agents, isDirty: true }),
});

// -- Exports ------------------------------------------------------------------

export { createAgentsSlice, createAgentsInitialState };
