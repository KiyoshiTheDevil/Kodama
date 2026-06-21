import { sameWordSelection } from "@/domain/selection/identity";
import type { WordSelection } from "@/domain/selection/model";

// -- Set operations -----------------------------------------------------------

function toggleWordSelection(selections: WordSelection[], selection: WordSelection): WordSelection[] {
  if (selections.some((w) => sameWordSelection(w, selection))) {
    return selections.filter((w) => !sameWordSelection(w, selection));
  }
  return [...selections, selection];
}

// Union of two selection lists, deduped by identity. Existing entries keep
// their position; incoming entries are appended only when not already present.
function mergeWordSelections(existing: WordSelection[], incoming: WordSelection[]): WordSelection[] {
  const merged = [...existing];
  for (const selection of incoming) {
    if (!merged.some((w) => sameWordSelection(w, selection))) merged.push(selection);
  }
  return merged;
}

// -- Exports ------------------------------------------------------------------

export { mergeWordSelections, toggleWordSelection };
