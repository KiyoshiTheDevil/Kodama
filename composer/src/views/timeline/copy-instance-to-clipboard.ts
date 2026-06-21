import { belongsToInstance } from "@/domain/instance/predicates";
import type { LyricLine } from "@/domain/line/model";
import type { ClipboardData, ClipboardEntry } from "@/views/timeline/selection-types";
import { useTimelineStore } from "@/views/timeline/timeline-store";

// Builds a ClipboardData payload covering every word and bg word of the
// (groupId, instanceIdx) instance, then sets it as the active clipboard and
// opens the paste-preview ghost so the user can place it manually.
//
// Used by Cmd+D and "Add instance at playhead" when the playhead has no room
// for the new instance: instead of silently appending at end-of-list, we copy
// the source instance and let the user place it via the existing paste-preview
// flow.
function copyInstanceToClipboardAndPreview(lines: LyricLine[], groupId: string, instanceIdx: number): boolean {
  const instanceLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (belongsToInstance(l, groupId, instanceIdx)) instanceLineIndices.push(i);
  }
  if (instanceLineIndices.length === 0) return false;

  const minLineIndex = instanceLineIndices[0];
  const entries: ClipboardEntry[] = [];

  for (const lineIdx of instanceLineIndices) {
    const line = lines[lineIdx];
    if (line.words?.length) {
      for (const word of line.words) {
        entries.push({ word: { ...word }, lineOffset: lineIdx - minLineIndex, trackType: "word" });
      }
    }
    if (line.backgroundWords?.length) {
      for (const word of line.backgroundWords) {
        entries.push({ word: { ...word }, lineOffset: lineIdx - minLineIndex, trackType: "bg" });
      }
    }
  }

  if (entries.length === 0) return false;
  entries.sort((a, b) => a.lineOffset - b.lineOffset || a.word.begin - b.word.begin);

  const clipboard: ClipboardData = { entries, sourceInstance: { groupId, instanceIdx } };
  useTimelineStore.getState().setClipboard(clipboard);
  useTimelineStore.getState().setPasteMode({ status: "preview", clipboard });
  return true;
}

// -- Exports ------------------------------------------------------------------

export { copyInstanceToClipboardAndPreview };
