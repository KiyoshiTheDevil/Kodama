import type { LyricLine } from "@/domain/line/model";
import { createInitialBgWords, splitIntoWordsWithMeta, type SyncState } from "@/utils/sync-helpers";

// -- Types --------------------------------------------------------------------

interface PreparedSyncWord {
  line: LyricLine;
  lineWords: string[];
  trailingSpace: boolean[];
  textWithSpace: string;
}

type SetSyncState = React.Dispatch<React.SetStateAction<SyncState>>;

// -- Functions ----------------------------------------------------------------

function prepareSyncWord(
  lines: LyricLine[],
  lineIndex: number,
  wordIndex: number,
  isComplete: boolean,
): PreparedSyncWord | null {
  if (lines.length === 0 || isComplete) return null;
  const line = lines[lineIndex];
  if (!line) return null;
  const { parts: lineWords, trailingSpace } = splitIntoWordsWithMeta(line.text);
  const wordText = lineWords[wordIndex];
  if (!wordText) return null;
  const textWithSpace = trailingSpace[wordIndex] ? `${wordText} ` : wordText;
  return { line, lineWords, trailingSpace, textWithSpace };
}

function withBgSeedIfNeeded<T extends Partial<LyricLine>>(updates: T, line: LyricLine, bgBegin: number): T {
  if (line.backgroundText && !line.backgroundWords?.length) {
    updates.backgroundWords = createInitialBgWords(line.backgroundText, bgBegin);
  }
  return updates;
}

function buildInitialWordUpdates(
  line: LyricLine,
  textWithSpace: string,
  begin: number,
  end: number,
): Partial<LyricLine> {
  return withBgSeedIfNeeded({ words: [{ text: textWithSpace, begin, end }] }, line, begin);
}

function advanceSyncPosition(
  setSyncState: SetSyncState,
  lineIndex: number,
  wordIndex: number,
  totalWords: number,
): void {
  const nextWordIndex = wordIndex + 1;
  if (nextWordIndex >= totalWords) {
    setSyncState((prev) => ({ ...prev, position: { lineIndex: lineIndex + 1, wordIndex: 0 } }));
  } else {
    setSyncState((prev) => ({ ...prev, position: { ...prev.position, wordIndex: nextWordIndex } }));
  }
}

function triggerPulse(setShowPulse: (show: boolean) => void): void {
  setShowPulse(true);
  setTimeout(() => setShowPulse(false), 100);
}

// -- Exports ------------------------------------------------------------------

export { prepareSyncWord, withBgSeedIfNeeded, buildInitialWordUpdates, advanceSyncPosition, triggerPulse };
export type { PreparedSyncWord, SetSyncState };
