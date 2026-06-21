import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { textToLyricLines } from "@/utils/lyrics-text";
import {
  diffEditTextChange,
  findStructurallyImpactedInstances,
  type ImpactedInstance,
  propagateContentUpdates,
} from "@/views/edit/diff-edit-text";

// -- Types --------------------------------------------------------------------

type EditTextAction =
  | { kind: "ignore-modal-pending" }
  | { kind: "noop" }
  | { kind: "apply"; finalLines: LyricLine[] }
  | { kind: "needs-confirm"; lyricLines: LyricLine[]; impacted: ImpactedInstance[]; labels: string[] };

interface DecideOptions {
  text: string;
  defaultAgentId: string;
  lines: LyricLine[];
  groups: LinkGroup[];
  modalPending: boolean;
}

// -- Helpers ------------------------------------------------------------------

function uniqueImpactedLabels(impacted: ImpactedInstance[], groups: LinkGroup[]): string[] {
  const groupsById = new Map<string, LinkGroup>();
  for (const g of groups) groupsById.set(g.id, g);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of impacted) {
    const label = groupsById.get(i.groupId)?.label;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function decideEditTextAction({ text, defaultAgentId, lines, groups, modalPending }: DecideOptions): EditTextAction {
  if (modalPending) return { kind: "ignore-modal-pending" };

  const lyricLines = textToLyricLines(text, defaultAgentId, lines);
  const diff = diffEditTextChange(lines, lyricLines);

  if (diff.hasStructuralChange) {
    const impacted = findStructurallyImpactedInstances(lines, lyricLines);
    if (impacted.length > 0) {
      return {
        kind: "needs-confirm",
        lyricLines,
        impacted,
        labels: uniqueImpactedLabels(impacted, groups),
      };
    }
    return { kind: "apply", finalLines: lyricLines };
  }

  if (diff.contentUpdates.length === 0) return { kind: "noop" };
  const finalLines = propagateContentUpdates(lines, lyricLines, diff.contentUpdates);
  return { kind: "apply", finalLines };
}

// -- Exports ------------------------------------------------------------------

export { decideEditTextAction };
