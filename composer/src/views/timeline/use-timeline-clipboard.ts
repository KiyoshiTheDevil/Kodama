import { useProjectStore } from "@/stores/project";
import type { LyricLine } from "@/domain/line/model";
import { applyWordDeletion } from "@/views/timeline/apply-word-deletion";
import { buildCandidateLines } from "@/views/timeline/build-candidate-lines";
import type { ClipboardData, ClipboardEntry } from "@/views/timeline/selection-types";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { getWordsInInstance } from "@/views/timeline/utils";
import { useCallback } from "react";
import { toast } from "sonner";

// -- Hook ---------------------------------------------------------------------

function useTimelineClipboard(lines: LyricLine[]) {
  const handleCopy = useCallback(() => {
    const { selectedWords } = useTimelineStore.getState();
    if (selectedWords.length === 0) return;

    const minLineIndex = Math.min(...selectedWords.map((w) => w.lineIndex));
    const entries: ClipboardEntry[] = [];

    for (const sel of selectedWords) {
      const line = lines[sel.lineIndex];
      if (!line) continue;
      const wordsArray = sel.type === "word" ? line.words : line.backgroundWords;
      const word = wordsArray?.[sel.wordIndex];
      if (!word) continue;

      entries.push({
        word: { ...word },
        lineOffset: sel.lineIndex - minLineIndex,
        trackType: sel.type,
      });
    }

    if (entries.length === 0) return;

    entries.sort((a, b) => a.lineOffset - b.lineOffset || a.word.begin - b.word.begin);

    const clipboard: ClipboardData = { entries };
    const sourceInstance = detectFullInstance(lines, selectedWords);
    if (sourceInstance) {
      clipboard.sourceInstance = sourceInstance;
    } else {
      const candidateLines = buildCandidateLines(lines, selectedWords);
      if (candidateLines) clipboard.candidateLines = candidateLines;
    }

    useTimelineStore.getState().setClipboard(clipboard);
    toast(
      sourceInstance
        ? `Copied linked instance (${entries.length} word${entries.length > 1 ? "s" : ""})`
        : `Copied ${entries.length} word${entries.length > 1 ? "s" : ""}`,
    );
  }, [lines]);

  const handleDelete = useCallback(() => {
    const { selectedWords } = useTimelineStore.getState();
    if (selectedWords.length === 0) return;

    const rawLines = useProjectStore.getState().lines;
    const newLines = applyWordDeletion(rawLines, selectedWords);
    if (newLines === rawLines) return;

    useProjectStore.getState().setLinesWithHistory(newLines);
    useTimelineStore.getState().clearSelection();
  }, []);

  const handleCut = useCallback(() => {
    handleCopy();
    handleDelete();
  }, [handleCopy, handleDelete]);

  const handlePaste = useCallback(() => {
    const { clipboard, pasteMode } = useTimelineStore.getState();
    if (!clipboard || clipboard.entries.length === 0) return;

    if (pasteMode.status === "preview") {
      useTimelineStore.getState().setPasteMode({ status: "idle" });
    } else {
      useTimelineStore.getState().setPasteMode({ status: "preview", clipboard });
    }
  }, []);

  return { handleCopy, handleDelete, handleCut, handlePaste };
}

// -- Helpers ------------------------------------------------------------------

function detectFullInstance(
  lines: LyricLine[],
  selectedWords: ReadonlyArray<{ lineId: string; wordIndex: number; type: "word" | "bg" }>,
): { groupId: string; instanceIdx: number } | undefined {
  const linesById = new Map<string, LyricLine>();
  for (const l of lines) linesById.set(l.id, l);
  const firstLine = linesById.get(selectedWords[0].lineId);
  if (!firstLine?.groupId || firstLine.instanceIdx === undefined) return undefined;
  const { groupId, instanceIdx } = firstLine;

  for (const sel of selectedWords) {
    const line = linesById.get(sel.lineId);
    if (!line || line.groupId !== groupId || line.instanceIdx !== instanceIdx) return undefined;
  }

  const expected = getWordsInInstance(lines, groupId, instanceIdx);
  if (expected.length !== selectedWords.length) return undefined;

  const selectedKeys = new Set(selectedWords.map((s) => `${s.lineId}:${s.type}:${s.wordIndex}`));
  for (const ref of expected) {
    if (!selectedKeys.has(`${ref.lineId}:${ref.type}:${ref.wordIndex}`)) return undefined;
  }

  return { groupId, instanceIdx };
}

// -- Exports ------------------------------------------------------------------

export { useTimelineClipboard };
