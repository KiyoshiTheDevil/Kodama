import { applyBackground } from "@/domain/line/background";
import type { BackgroundSource } from "@/domain/line/background";
import { isLinked } from "@/domain/instance/predicates";
import type { LyricLine } from "@/domain/line/model";
import { reconcileLine } from "@/domain/line/model";
import { isLineSynced, isWordSynced } from "@/domain/line/predicates";
import { reconstructLineText, wordContentSpans } from "@/domain/line/reconstruct-text";
import { remapWordTextsPreservingTiming } from "@/domain/word/remap-text";
import type { WordTiming } from "@/domain/word/timing";
import { bracketWordList, joinBracketedCarriedWords } from "@/utils/background-vocal-brackets";
import { getSplitCharacter } from "@/utils/split-character";
import { createInitialBgWords } from "@/utils/sync-helpers";

// -- Types --------------------------------------------------------------------

interface ParenGroup {
  inner: string;
  start: number;
  end: number;
}

type ParenScanStatus = "balanced" | "unbalanced" | "nested";

interface ParenScan {
  status: ParenScanStatus;
  groups: ParenGroup[];
}

type LineClassKind = "none" | "inline" | "standalone" | "skip";

interface LineClassification {
  kind: LineClassKind;
  groups: ParenGroup[];
  bgText: string;
  mainText: string;
}

interface ExtractOptions {
  mergeStandaloneLines: boolean;
  preserveBrackets: boolean;
}

// -- Scanner ------------------------------------------------------------------

function scanParenGroups(text: string): ParenScan {
  const groups: ParenGroup[] = [];
  let depth = 0;
  let openIndex = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
      if (depth > 1) return { status: "nested", groups: [] };
      openIndex = i;
    } else if (ch === ")") {
      depth--;
      if (depth < 0) return { status: "unbalanced", groups: [] };
      groups.push({ inner: text.slice(openIndex + 1, i), start: openIndex, end: i });
    }
  }
  if (depth !== 0) return { status: "unbalanced", groups: [] };
  return { status: "balanced", groups };
}

// -- Classification -----------------------------------------------------------

function stripGroups(text: string, groups: ParenGroup[]): string {
  let result = text;
  for (let i = groups.length - 1; i >= 0; i--) {
    result = result.slice(0, groups[i].start) + result.slice(groups[i].end + 1);
  }
  return result;
}

function collapseSpaces(text: string): string {
  return text.replace(/ {2,}/g, " ").trim();
}

function joinBackgroundText(
  existing: string | undefined,
  addition: string,
  preserveBrackets: boolean,
  trailingBracketFromSamePass: boolean,
): string {
  const base = existing?.trim() ?? "";
  if (!preserveBrackets) return base.length > 0 ? `${base} ${addition}` : addition;
  if (base.length === 0) return `(${addition})`;
  if (trailingBracketFromSamePass && base.endsWith(")")) return `${base.slice(0, -1)} ${addition})`;
  return `${base} (${addition})`;
}

function classifyLine(text: string): LineClassification {
  const scan = scanParenGroups(text);
  if (scan.status !== "balanced") return { kind: "skip", groups: [], bgText: "", mainText: text };
  if (scan.groups.length === 0) return { kind: "none", groups: [], bgText: "", mainText: text };
  const bgText = scan.groups
    .map((g) => g.inner.trim())
    .filter((s) => s.length > 0)
    .join(" ");
  if (bgText.length === 0) return { kind: "none", groups: scan.groups, bgText: "", mainText: text };
  const mainText = collapseSpaces(stripGroups(text, scan.groups));
  return { kind: mainText.length === 0 ? "standalone" : "inline", groups: scan.groups, bgText, mainText };
}

// -- Extraction ---------------------------------------------------------------

function extractInlineWordSynced(line: LyricLine, classified: LineClassification, options: ExtractOptions): LyricLine {
  const words = line.words;
  if (!words || words.length === 0) return line;
  if (line.backgroundWords && line.backgroundWords.length > 0) return line;
  const splitChar = getSplitCharacter();
  if (reconstructLineText(words, splitChar) !== line.text) return line;
  const spans = wordContentSpans(words, splitChar);
  const survivors: WordTiming[] = [];
  for (let i = 0; i < words.length; i++) {
    const span = spans[i];
    let insideCount = 0;
    for (const g of classified.groups) {
      const groupStart = g.start;
      const groupEnd = g.end + 1;
      const overlaps = span.start < groupEnd && span.end > groupStart;
      if (!overlaps) continue;
      const fullyInside = span.start >= groupStart && span.end <= groupEnd;
      if (!fullyInside) return line;
      insideCount++;
    }
    if (insideCount === 0) survivors.push(words[i]);
  }
  if (survivors.length === 0) return line;
  const trimmedSurvivors = survivors.map((word, i) =>
    i === survivors.length - 1 ? { ...word, text: word.text.replace(/ +$/, "") } : word,
  );
  const base = line.backgroundTextSource === "extraction" ? undefined : line.backgroundText;
  return applyBackground(
    reconcileLine({
      ...line,
      words: trimmedSurvivors,
      text: reconstructLineText(trimmedSurvivors, splitChar),
    }),
    {
      text: joinBackgroundText(base, classified.bgText, options.preserveBrackets, false),
      source: base ? "manual" : "extraction",
    },
  );
}

function extractInlineFromLine(line: LyricLine, options: ExtractOptions): LyricLine {
  const classified = classifyLine(line.text);
  if (classified.kind !== "inline") return line;
  if (isWordSynced(line)) return extractInlineWordSynced(line, classified, options);
  if (line.backgroundWords && line.backgroundWords.length > 0) return line;
  const base = line.backgroundTextSource === "extraction" ? undefined : line.backgroundText;
  return applyBackground(
    { ...line, text: classified.mainText },
    {
      text: joinBackgroundText(base, classified.bgText, options.preserveBrackets, false),
      source: base ? "manual" : "extraction",
    },
  );
}

// -- Whole-list transform -----------------------------------------------------

function carriedBackgroundWords(standalone: LyricLine, bgText: string, preserveBrackets: boolean): WordTiming[] | null {
  const words = standalone.words;
  let carry: WordTiming[] | null;
  if (words && words.length > 0) {
    carry = remapWordTextsPreservingTiming(words, bgText);
  } else if (isLineSynced(standalone)) {
    carry = createInitialBgWords(bgText, standalone.begin, standalone.end);
  } else {
    carry = null;
  }
  if (!preserveBrackets) return carry;
  if (!carry || carry.length === 0) return carry;
  return bracketWordList(carry);
}

function mergeStandaloneInto(
  prev: LyricLine,
  standalone: LyricLine,
  bgText: string,
  prevTrailingBracketFromSamePass: boolean,
  options: ExtractOptions,
): LyricLine | null {
  // On re-paste, prev's extraction-sourced background is stale output from a
  // prior pass, so the standalone line replaces it. Manual background is kept.
  // Extraction-sourced background produced earlier in this same pass (an
  // already-merged standalone) is fresh, so further standalones append to it.
  const prevIsExtraction = prev.backgroundTextSource === "extraction";
  const prevIsStaleExtraction = prevIsExtraction && !prevTrailingBracketFromSamePass;
  const baseText = prevIsStaleExtraction ? undefined : prev.backgroundText;
  const baseWords = prevIsStaleExtraction ? undefined : prev.backgroundWords;
  const carried = carriedBackgroundWords(standalone, bgText, options.preserveBrackets);

  // Source for a result that keeps the prev base: a surviving extraction base
  // is necessarily fresh same-pass output (stale extraction was dropped above),
  // so it stays extraction; manual or legacy-undefined stays manual.
  const keptBaseSource: BackgroundSource = prevIsExtraction ? "extraction" : "manual";

  if (carried && carried.length > 0) {
    if (baseWords && baseWords.length > 0) {
      const canSeamStrip = options.preserveBrackets && prevTrailingBracketFromSamePass;
      const combined = joinBracketedCarriedWords(baseWords, carried, canSeamStrip);
      return applyBackground(prev, {
        words: combined,
        text: reconstructLineText(combined, getSplitCharacter()),
        source: keptBaseSource,
      });
    }
    if (!baseText) {
      return applyBackground(prev, {
        words: carried,
        text: reconstructLineText(carried, getSplitCharacter()),
        source: "extraction",
      });
    }
    return applyBackground(prev, {
      text: joinBackgroundText(baseText, bgText, options.preserveBrackets, prevTrailingBracketFromSamePass),
      source: keptBaseSource,
    });
  }

  if (baseWords && baseWords.length > 0) return null;
  return applyBackground(prev, {
    text: joinBackgroundText(baseText, bgText, options.preserveBrackets, prevTrailingBracketFromSamePass),
    source: baseText ? keptBaseSource : "extraction",
  });
}

function extractBackgroundVocals(lines: LyricLine[], options: ExtractOptions): LyricLine[] {
  const result: LyricLine[] = [];
  const sameSessionWriteIndices = new Set<number>();
  for (const line of lines) {
    const classified = classifyLine(line.text);
    if (classified.kind === "inline") {
      const extracted = extractInlineFromLine(line, options);
      result.push(extracted);
      if (extracted !== line) sameSessionWriteIndices.add(result.length - 1);
      continue;
    }
    if (classified.kind === "standalone" && options.mergeStandaloneLines) {
      const prevIndex = result.length - 1;
      const prev = result[prevIndex];
      if (
        prev &&
        prev.text.trim().length > 0 &&
        classifyLine(prev.text).kind === "none" &&
        !isLinked(prev) &&
        !isLinked(line)
      ) {
        const merged = mergeStandaloneInto(
          prev,
          line,
          classified.bgText,
          sameSessionWriteIndices.has(prevIndex),
          options,
        );
        if (merged) {
          result[prevIndex] = merged;
          sameSessionWriteIndices.add(prevIndex);
          continue;
        }
      }
    }
    result.push(line);
  }
  return result;
}

function lineHasInlineParens(line: LyricLine): boolean {
  return classifyLine(line.text).kind === "inline";
}

// -- Exports ------------------------------------------------------------------

export { classifyLine, extractBackgroundVocals, extractInlineFromLine, lineHasInlineParens, scanParenGroups };
export type { ExtractOptions, LineClassification, LineClassKind, ParenGroup, ParenScan, ParenScanStatus };
