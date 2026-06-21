import type { LyricLine } from "@/domain/line/model";
import { expandSelectionToGroupmates } from "@/domain/word/syllable-groups";
import type { WordSelection } from "@/domain/selection/model";

// -- Types ---------------------------------------------------------------------

interface ExplicitTarget {
  lineId: string;
  field: "words" | "backgroundWords";
  wordIndex: number;
}

interface ExplicitToggleResolution {
  targets: ExplicitTarget[];
  value: boolean;
}

// -- Functions -----------------------------------------------------------------

function resolveExplicitSelectionToggle(lines: LyricLine[], selection: WordSelection[]): ExplicitToggleResolution {
  const linesById = new Map(lines.map((l) => [l.id, l]));
  const groups = new Map<string, { lineId: string; field: "words" | "backgroundWords"; indices: number[] }>();

  for (const w of selection) {
    const field: "words" | "backgroundWords" = w.type === "word" ? "words" : "backgroundWords";
    const wordsArr = linesById.get(w.lineId)?.[field];
    if (!wordsArr || w.wordIndex < 0 || w.wordIndex >= wordsArr.length) continue;
    const key = `${w.lineId}:${field}`;
    const existing = groups.get(key);
    if (existing) existing.indices.push(w.wordIndex);
    else groups.set(key, { lineId: w.lineId, field, indices: [w.wordIndex] });
  }

  const targets: ExplicitTarget[] = [];
  let allMarked = true;

  for (const group of groups.values()) {
    const wordsArr = linesById.get(group.lineId)?.[group.field];
    if (!wordsArr) continue;
    const expanded = expandSelectionToGroupmates(wordsArr, group.indices).filter((i) => i >= 0 && i < wordsArr.length);
    for (const idx of expanded) {
      targets.push({ lineId: group.lineId, field: group.field, wordIndex: idx });
      if (wordsArr[idx].explicit !== true) allMarked = false;
    }
  }

  return { targets, value: !allMarked };
}

// -- Exports -------------------------------------------------------------------

export { resolveExplicitSelectionToggle };
