import { selfKey } from "@/views/timeline/snap";

// -- Functions -----------------------------------------------------------------

function resizeGestureSelfIds(
  lineId: string,
  wordIndex: number,
  edge: "left" | "right",
  wordCount: number,
  trackType: "word" | "bg",
): Set<string> {
  const ids = new Set<string>([selfKey(lineId, wordIndex, trackType)]);
  const adjacent = edge === "left" ? wordIndex - 1 : wordIndex + 1;
  if (adjacent >= 0 && adjacent < wordCount) {
    ids.add(selfKey(lineId, adjacent, trackType));
  }
  return ids;
}

// -- Exports -------------------------------------------------------------------

export { resizeGestureSelfIds };
