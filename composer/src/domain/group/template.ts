// -- Types --------------------------------------------------------------------

interface LinkGroup {
  id: string;
  label: string;
  color: string;
  templateVersion: number;
}

interface WordTemplate {
  text: string;
  relativeBegin: number;
  relativeEnd: number;
  explicit?: true;
}

interface LineTemplate {
  text: string;
  agentId: string;
  relativeBegin?: number;
  relativeEnd?: number;
  words?: WordTemplate[];
  backgroundText?: string;
  backgroundWords?: WordTemplate[];
  backgroundTextSource?: "extraction" | "manual";
}

// -- Exports ------------------------------------------------------------------

export type { LinkGroup, WordTemplate, LineTemplate };
