import type { WordTiming } from "@/domain/word/timing";
import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";

// Maps the new typed text onto an existing words array by tokenising the same
// way the sync pipeline does (whitespace + split character). Returns null when
// the syllable count differs, so callers know to clear timing rather than
// silently shift word boundaries.
function remapWordTextsPreservingTiming(oldWords: WordTiming[], newText: string): WordTiming[] | null {
  const { parts, trailingSpace } = splitIntoWordsWithMeta(newText);
  if (parts.length !== oldWords.length) return null;
  return oldWords.map((oldWord, i) => ({ ...oldWord, text: parts[i] + (trailingSpace[i] ? " " : "") }));
}

export { remapWordTextsPreservingTiming };
