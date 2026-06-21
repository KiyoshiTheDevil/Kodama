import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";

// -- Text reconstruction ------------------------------------------------------

// Rebuilds a line's text from its word array. Word texts carry their trailing
// space when a real space follows; two adjacent words with no space between
// them are syllables of one token, so the split character is reinserted at that
// joint. The result tokenizes 1:1 back to the same word count.
function reconstructLineText(words: WordTiming[], splitChar: string): string {
  let result = "";
  for (let i = 0; i < words.length; i++) {
    result += words[i].text;
    if (i < words.length - 1 && !words[i].text.endsWith(" ")) {
      result += splitChar;
    }
  }
  return result;
}

// -- Word content spans -------------------------------------------------------

interface WordContentSpan {
  start: number;
  end: number;
}

// Maps each word to the half-open char range [start, end) of its non-whitespace
// content within reconstructLineText's output. Mirrors that function's
// splitChar-insertion logic, so the two must evolve together.
function wordContentSpans(words: WordTiming[], splitChar: string): WordContentSpan[] {
  const spans: WordContentSpan[] = [];
  let cursor = 0;
  for (let i = 0; i < words.length; i++) {
    const text = words[i].text;
    const leading = text.length - text.trimStart().length;
    const trailing = text.length - text.trimEnd().length;
    spans.push({ start: cursor + leading, end: cursor + text.length - trailing });
    cursor += text.length;
    if (i < words.length - 1 && !text.endsWith(" ")) cursor += splitChar.length;
  }
  return spans;
}

// text/backgroundText are derived from words/backgroundWords whenever those
// arrays are present: a line with words has no independent text. A line with no
// words keeps text as its primary, editable field. Returns the same reference
// when nothing changes, so untouched lines stay reference-stable.
function withDerivedText(line: LyricLine, splitChar: string): LyricLine {
  const text = line.words && line.words.length > 0 ? reconstructLineText(line.words, splitChar) : line.text;
  const backgroundText =
    line.backgroundWords && line.backgroundWords.length > 0
      ? reconstructLineText(line.backgroundWords, splitChar)
      : line.backgroundText;
  if (text === line.text && backgroundText === line.backgroundText) return line;
  return { ...line, text, backgroundText };
}

// -- Exports ------------------------------------------------------------------

export { reconstructLineText, withDerivedText, wordContentSpans };
export type { WordContentSpan };
