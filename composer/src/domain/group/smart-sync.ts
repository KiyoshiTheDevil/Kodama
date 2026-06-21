import type { WordTiming } from "@/domain/word/timing";
import { applySiblingWords } from "@/utils/word-diff";

// -- Smart-sync propagation ---------------------------------------------------

// Propagates a source line's word change onto one linked sibling.
//
// Fast path: when the word count is unchanged this is a pure text rename, so
// only sibling word texts update and timing stays exact (skips the LCS diff).
// Structural change: defers to the smart-sync diff, which preserves sibling
// timing for words that did not structurally change.
//
// Returns undefined when there is nothing to propagate.
function propagateWordChanges(
  sourceAfter: WordTiming[] | undefined,
  sourceBefore: WordTiming[] | undefined,
  siblingWords: WordTiming[] | undefined,
): WordTiming[] | undefined {
  if (!sourceAfter || !siblingWords) return undefined;

  if (sourceBefore && sourceAfter.length === sourceBefore.length) {
    if (sourceAfter.length !== siblingWords.length) return undefined;
    let changed = false;
    const next = siblingWords.map((w, i) => {
      if (w.text === sourceAfter[i].text) return w;
      changed = true;
      return { ...w, text: sourceAfter[i].text };
    });
    return changed ? next : undefined;
  }

  const result = applySiblingWords(sourceAfter, sourceBefore, siblingWords);
  return result ?? undefined;
}

// -- Exports ------------------------------------------------------------------

export { propagateWordChanges };
