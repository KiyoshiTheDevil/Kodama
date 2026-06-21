import { reconcileLine, type LyricLine } from "@/domain/line/model";
import { remapWordTextsPreservingTiming } from "@/domain/word/remap-text";

// The single chokepoint for re-deciding timing-staleness after a text edit:
// both the exact-match and position-match branches of textToLyricLines route
// through here so they cannot drift apart and clear timing on lines the user
// never touched.
function reconcileMatchedTiming(line: LyricLine, cleanedText: string): LyricLine {
  if (line.text === cleanedText) return line;

  if (line.words && line.words.length > 0) {
    const remapped = remapWordTextsPreservingTiming(line.words, cleanedText);
    if (remapped) {
      return reconcileLine({ ...line, text: cleanedText, words: remapped });
    }
  }

  return reconcileLine({ ...line, text: cleanedText, words: undefined, begin: undefined, end: undefined });
}

export { reconcileMatchedTiming };
