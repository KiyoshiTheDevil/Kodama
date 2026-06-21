import type { Agent } from "@/domain/agent/model";
import type { ConfirmOptions } from "@/stores/confirm-store";
import { useProjectStore } from "@/stores/project";
import { extractBackgroundVocals } from "@/utils/background-vocal-extraction";
import type { ParseResult } from "@/utils/lyrics-parsers/shared";
import { distributeLinesTiming } from "@/views/timeline/utils";

// -- Types --------------------------------------------------------------------

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface ImportSourceInfo {
  label: string;
  filename: string;
}

interface ImportParsedLyricsContext {
  confirm: ConfirmFn;
  agents: Agent[];
  audioDuration: number;
  applyBackgroundExtraction: boolean;
  backgroundExtractionMergeStandalone: boolean;
  backgroundExtractionPreserveBrackets: boolean;
  source: ImportSourceInfo;
  onResult?: (parsed: ParseResult, source: ImportSourceInfo) => void;
}

// -- Helpers ------------------------------------------------------------------

async function confirmReplaceIfNeeded(confirm: ConfirmFn): Promise<boolean> {
  const existingLineCount = useProjectStore.getState().lines.length;
  if (existingLineCount === 0) return true;
  return confirm({
    title: "Replace existing lyrics?",
    description: `This will replace your ${existingLineCount} existing line${existingLineCount === 1 ? "" : "s"}. This cannot be undone.`,
    confirmLabel: "Replace",
    variant: "destructive",
    settingsKey: "confirmReplaceLyrics",
  });
}

function reconcileAgents(existing: Agent[], incoming: Agent[] | undefined): void {
  if (!incoming || incoming.length === 0) return;
  const store = useProjectStore.getState();
  const agentsById = new Map(existing.map((a) => [a.id, a] as const));
  for (const agent of incoming) {
    if (agentsById.has(agent.id)) {
      store.updateAgent(agent.id, { name: agent.name, type: agent.type });
    } else {
      store.addAgent(agent);
    }
  }
}

// -- Action -------------------------------------------------------------------

async function importParsedLyrics(parsed: ParseResult, ctx: ImportParsedLyricsContext): Promise<boolean> {
  if (parsed.lines.length === 0) return false;

  const accepted = await confirmReplaceIfNeeded(ctx.confirm);
  if (!accepted) return false;

  let workingLines = ctx.applyBackgroundExtraction
    ? extractBackgroundVocals(parsed.lines, {
        mergeStandaloneLines: ctx.backgroundExtractionMergeStandalone,
        preserveBrackets: ctx.backgroundExtractionPreserveBrackets,
      })
    : parsed.lines;

  if (!parsed.hasTimingData && ctx.audioDuration > 0) {
    workingLines = distributeLinesTiming(workingLines, ctx.audioDuration);
  }

  const store = useProjectStore.getState();
  store.setLines(workingLines);
  store.setGroups(parsed.groups ?? []);

  if (Object.keys(parsed.metadata).length > 0) {
    store.setMetadata(parsed.metadata);
  }

  reconcileAgents(ctx.agents, parsed.agents);

  ctx.onResult?.(parsed, ctx.source);

  return true;
}

// -- Exports ------------------------------------------------------------------

export { importParsedLyrics };
export type { ConfirmFn, ImportParsedLyricsContext, ImportSourceInfo };
