import type { LyricLine } from "@/domain/line/model";

// -- Types --------------------------------------------------------------------

// Identifies the set of sibling lines linked across instances of a group:
// the same logical line (templateLineIdx) within one group.
interface LinkScope {
  groupId: string;
  templateLineIdx: number;
}

// -- Scope resolution ---------------------------------------------------------

function getLinkScope(line: LyricLine): LinkScope | null {
  if (line.groupId === undefined || line.templateLineIdx === undefined || line.detached) return null;
  return { groupId: line.groupId, templateLineIdx: line.templateLineIdx };
}

function isLinkedSibling(line: LyricLine, scope: LinkScope | null): boolean {
  if (!scope) return false;
  return line.groupId === scope.groupId && line.templateLineIdx === scope.templateLineIdx && !line.detached;
}

// -- Field propagation --------------------------------------------------------

// The subset of a line update that mirrors onto linked siblings: shared content
// fields, plus explicit clears of timing arrays (a defined timing value is
// instance-specific and never propagates).
function extractLinkedFields(updates: Partial<LyricLine>): Partial<LyricLine> {
  const linked: Partial<LyricLine> = {};
  if ("text" in updates) linked.text = updates.text;
  if ("agentId" in updates) linked.agentId = updates.agentId;
  if ("backgroundText" in updates) linked.backgroundText = updates.backgroundText;
  if ("backgroundTextSource" in updates) linked.backgroundTextSource = updates.backgroundTextSource;
  if ("words" in updates && updates.words === undefined) linked.words = undefined;
  if ("begin" in updates && updates.begin === undefined) linked.begin = undefined;
  if ("end" in updates && updates.end === undefined) linked.end = undefined;
  if ("backgroundWords" in updates && updates.backgroundWords === undefined) linked.backgroundWords = undefined;
  return linked;
}

// -- Exports ------------------------------------------------------------------

export { extractLinkedFields, getLinkScope, isLinkedSibling };
