import type { WordSelection } from "@/domain/selection/model";

// -- Types --------------------------------------------------------------------

interface SelectionRun {
  lineId: string;
  type: "word" | "bg";
  indices: number[];
}

// -- Contiguous run -----------------------------------------------------------

// Returns the merge-ready run when the selection is two or more words on a
// single line and track with consecutive word indices; null otherwise. Indices
// are returned in ascending order.
function contiguousSelectionRun(selections: WordSelection[]): SelectionRun | null {
  if (selections.length < 2) return null;
  const first = selections[0];
  if (!selections.every((w) => w.lineId === first.lineId && w.type === first.type)) return null;

  const sorted = selections.toSorted((a, b) => a.wordIndex - b.wordIndex);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].wordIndex !== sorted[i - 1].wordIndex + 1) return null;
  }
  return { lineId: first.lineId, type: first.type, indices: sorted.map((w) => w.wordIndex) };
}

// -- Exports ------------------------------------------------------------------

export { contiguousSelectionRun };
