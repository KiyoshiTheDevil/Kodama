// -- Types --------------------------------------------------------------------

type AgentType = "person" | "character" | "group" | "organization" | "other";

interface Agent {
  id: string;
  type: AgentType;
  name?: string;
}

// -- Exports ------------------------------------------------------------------

export type { Agent, AgentType };
