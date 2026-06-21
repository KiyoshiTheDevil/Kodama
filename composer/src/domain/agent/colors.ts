import type { Agent } from "@/domain/agent/model";

// -- Constants ----------------------------------------------------------------

const AGENT_PRESETS: Agent[] = [
  { id: "v1", type: "person", name: "Lead" },
  { id: "v1000", type: "group", name: "Harmony" },
  { id: "v2000", type: "other", name: "Chorus" },
];

const AGENT_COLORS: Record<string, string> = {
  v1: "#60a5fa", // blue
  v2: "#4ade80", // green
  v3: "#fb923c", // orange
  v4: "#22d3d1", // cyan
  v5: "#facc15", // yellow
  v6: "#fb7185", // rose
  v7: "#2dd4bf", // teal
  v8: "#fbbf24", // amber
  v9: "#818cf8", // indigo
  v10: "#34d399", // emerald
  v11: "#f87171", // red
  v12: "#38bdf8", // sky
  v13: "#a3e635", // lime
  v14: "#e879f9", // fuchsia
  v15: "#a78bfa", // violet
  v1000: "#f472b6", // pink
  v2000: "#c4b5fd", // purple light
};

const DEFAULT_AGENTS: Agent[] = [AGENT_PRESETS[0]];

// -- Functions ----------------------------------------------------------------

function getAgentColor(agentId: string): string {
  return AGENT_COLORS[agentId] ?? "#9ca3af"; // gray fallback
}

// -- Exports ------------------------------------------------------------------

export { AGENT_PRESETS, DEFAULT_AGENTS, getAgentColor };
