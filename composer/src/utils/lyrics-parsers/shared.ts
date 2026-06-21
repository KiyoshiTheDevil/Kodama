import type { Agent } from "@/domain/agent/model";
import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import type { ProjectMetadata } from "@/domain/project/metadata";

// -- Types --------------------------------------------------------------------

interface ParseResult {
  lines: LyricLine[];
  metadata: Partial<ProjectMetadata>;
  hasTimingData: boolean;
  agents?: Agent[];
  groups?: LinkGroup[];
}

type ParserFn = (content: string, fallbackDuration?: number) => ParseResult;

// -- Helpers ------------------------------------------------------------------

function generateLineId(): string {
  return crypto.randomUUID();
}

// -- Exports ------------------------------------------------------------------

export { generateLineId };
export type { ParseResult, ParserFn };
