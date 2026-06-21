import { mergeWordsIntoTrack } from "@/domain/word/merge-track";
import type { WordTiming } from "@/domain/word/timing";
import { resolveOverlapsForward } from "@/utils/word-spaces";

// -- Functions ----------------------------------------------------------------

// Reorders a word track by pulling the dragged words out, shifting them by
// timeDelta, and re-inserting them via mergeWordsIntoTrack. Word and syllable
// boundaries are re-derived from the new positions rather than carried along
// with the stale trailing-space pattern, so a word that changes order with a
// neighbor cannot fuse into it.
function reorderWordTrack(
  track: WordTiming[],
  draggedIndices: ReadonlySet<number>,
  timeDelta: number,
  duration: number,
): WordTiming[] {
  const dragged: WordTiming[] = [];
  const rest: WordTiming[] = [];
  track.forEach((word, index) => {
    if (draggedIndices.has(index)) {
      const wordDuration = word.end - word.begin;
      const newBegin = Math.max(0, Math.min(duration - wordDuration, word.begin + timeDelta));
      dragged.push({ ...word, begin: newBegin, end: newBegin + wordDuration });
    } else {
      rest.push({ ...word });
    }
  });
  return resolveOverlapsForward(mergeWordsIntoTrack(rest, dragged), duration);
}

// -- Exports ------------------------------------------------------------------

export { reorderWordTrack };
