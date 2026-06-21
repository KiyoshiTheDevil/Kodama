import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";
import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";

// -- Types ---------------------------------------------------------------------

interface LinkedInstance {
  lineId: string;
  lineIndex: number;
  instanceIdx: number;
}

interface LinkedInfo {
  groupId: string;
  groupLabel: string;
  instanceCount: number;
  instances: LinkedInstance[];
}

interface ExplicitSuggestion {
  lineId: string;
  lineIndex: number;
  field: "words" | "backgroundWords";
  wordIndices: number[];
  word: string;
  fingerprint: string;
  linked?: LinkedInfo;
}

interface RawHit {
  line: LyricLine;
  lineIndex: number;
  field: "words" | "backgroundWords";
  wordIndices: number[];
  word: string;
}

// -- Matcher (singleton) -------------------------------------------------------

let cachedMatcher: RegExpMatcher | null = null;

function getMatcher(): RegExpMatcher {
  if (cachedMatcher) return cachedMatcher;
  cachedMatcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  });
  return cachedMatcher;
}

// -- Word-range mapping --------------------------------------------------------

interface WordRange {
  start: number;
  end: number;
  text: string;
  syllableIndices: number[];
}

function buildWordRanges(text: string): { canonical: string; ranges: WordRange[] } {
  const { parts, trailingSpace } = splitIntoWordsWithMeta(text);
  if (parts.length === 0) return { canonical: "", ranges: [] };

  const ranges: WordRange[] = [];
  const pieces: string[] = [];
  let offset = 0;
  let syllableBuffer: number[] = [];
  let textBuffer = "";

  for (let i = 0; i < parts.length; i++) {
    syllableBuffer.push(i);
    textBuffer += parts[i];
    const finishesWord = trailingSpace[i] || i === parts.length - 1;
    if (!finishesWord) continue;

    const start = offset;
    const end = start + textBuffer.length;
    pieces.push(textBuffer);
    ranges.push({ start, end, text: textBuffer, syllableIndices: syllableBuffer });

    if (i < parts.length - 1) {
      pieces.push(" ");
      offset = end + 1;
    } else {
      offset = end;
    }
    syllableBuffer = [];
    textBuffer = "";
  }

  return { canonical: pieces.join(""), ranges };
}

function rangeForOffset(ranges: WordRange[], startIndex: number): WordRange | null {
  for (const r of ranges) {
    if (startIndex >= r.start && startIndex < r.end) return r;
  }
  return null;
}

// -- Fingerprint ---------------------------------------------------------------

function normalizeWordKey(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function standaloneFingerprint(
  lineId: string,
  field: "words" | "backgroundWords",
  wordIndex: number,
  word: string,
): string {
  return `${lineId}:${field}:${wordIndex}:${normalizeWordKey(word)}`;
}

function linkedFingerprint(
  groupId: string,
  templateLineIdx: number,
  field: "words" | "backgroundWords",
  wordIndex: number,
  word: string,
): string {
  return `group:${groupId}:${templateLineIdx}:${field}:${wordIndex}:${normalizeWordKey(word)}`;
}

// -- Detection -----------------------------------------------------------------

function scanField(
  line: LyricLine,
  lineIndex: number,
  field: "words" | "backgroundWords",
  source: string,
  matcher: RegExpMatcher,
  alreadyMarked: Set<number>,
  out: RawHit[],
): void {
  const { canonical, ranges } = buildWordRanges(source);
  if (canonical.length === 0) return;
  const matches = matcher.getAllMatches(canonical, true);
  const seenStart = new Set<number>();
  for (const m of matches) {
    const range = rangeForOffset(ranges, m.startIndex);
    if (!range) continue;
    if (seenStart.has(range.start)) continue;
    const allMarked = range.syllableIndices.every((idx) => alreadyMarked.has(idx));
    if (allMarked) continue;
    seenStart.add(range.start);
    out.push({
      line,
      lineIndex,
      field,
      wordIndices: range.syllableIndices,
      word: range.text,
    });
  }
}

function alreadyMarkedSet(words: LyricLine["words"] | undefined): Set<number> {
  const set = new Set<number>();
  if (!words) return set;
  for (let i = 0; i < words.length; i++) {
    if (words[i].explicit === true) set.add(i);
  }
  return set;
}

function isLinked(line: LyricLine): boolean {
  return line.groupId !== undefined && line.templateLineIdx !== undefined && !line.detached;
}

function findExplicitWords(lines: LyricLine[], groups: LinkGroup[] = []): ExplicitSuggestion[] {
  const matcher = getMatcher();
  const raw: RawHit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.text && line.text.trim().length > 0) {
      scanField(line, i, "words", line.text, matcher, alreadyMarkedSet(line.words), raw);
    }
    if (line.backgroundText && line.backgroundText.trim().length > 0) {
      scanField(line, i, "backgroundWords", line.backgroundText, matcher, alreadyMarkedSet(line.backgroundWords), raw);
    }
  }

  const groupLabelById = new Map(groups.map((g) => [g.id, g.label]));
  const linkedBuckets = new Map<string, RawHit[]>();
  const standaloneHits: RawHit[] = [];

  for (const hit of raw) {
    if (!isLinked(hit.line)) {
      standaloneHits.push(hit);
      continue;
    }
    const key = linkedFingerprint(
      hit.line.groupId as string,
      hit.line.templateLineIdx as number,
      hit.field,
      hit.wordIndices[0],
      hit.word,
    );
    const bucket = linkedBuckets.get(key);
    if (bucket) bucket.push(hit);
    else linkedBuckets.set(key, [hit]);
  }

  const out: ExplicitSuggestion[] = [];

  for (const [fingerprint, hits] of linkedBuckets) {
    if (hits.length === 1) {
      const hit = hits[0];
      out.push({
        lineId: hit.line.id,
        lineIndex: hit.lineIndex,
        field: hit.field,
        wordIndices: hit.wordIndices,
        word: hit.word,
        fingerprint: standaloneFingerprint(hit.line.id, hit.field, hit.wordIndices[0], hit.word),
      });
      continue;
    }

    const sorted = hits.toSorted((a, b) => (a.line.instanceIdx ?? 0) - (b.line.instanceIdx ?? 0));
    const representative = sorted[0];
    out.push({
      lineId: representative.line.id,
      lineIndex: representative.lineIndex,
      field: representative.field,
      wordIndices: representative.wordIndices,
      word: representative.word,
      fingerprint,
      linked: {
        groupId: representative.line.groupId as string,
        groupLabel: groupLabelById.get(representative.line.groupId as string) ?? "Group",
        instanceCount: sorted.length,
        instances: sorted.map((h) => ({
          lineId: h.line.id,
          lineIndex: h.lineIndex,
          instanceIdx: h.line.instanceIdx ?? 0,
        })),
      },
    });
  }

  for (const hit of standaloneHits) {
    out.push({
      lineId: hit.line.id,
      lineIndex: hit.lineIndex,
      field: hit.field,
      wordIndices: hit.wordIndices,
      word: hit.word,
      fingerprint: standaloneFingerprint(hit.line.id, hit.field, hit.wordIndices[0], hit.word),
    });
  }

  return out;
}

// -- Exports -------------------------------------------------------------------

export { findExplicitWords };
export type { ExplicitSuggestion };
