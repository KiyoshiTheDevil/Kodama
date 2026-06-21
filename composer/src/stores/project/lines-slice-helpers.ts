import { getLinkScope, isLinkedSibling } from "@/domain/group/linking";
import { applyBackground, CLEARED_BACKGROUND, manualBackgroundWordEdit } from "@/domain/line/background";
import { type LyricLine, reconcileLine } from "@/domain/line/model";
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import { mergeWordsIntoTrack } from "@/domain/word/merge-track";
import { computeByGroupId, expandSelectionToGroupmates } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { getSplitCharacter } from "@/utils/split-character";
import { resolveOverlapsForward, trimTrailingSpaceFromLast } from "@/utils/word-spaces";
import { applySiblingWords } from "@/utils/word-diff";

// -- Types --------------------------------------------------------------------

type ExplicitTarget = { lineId: string; field: "words" | "backgroundWords"; wordIndex: number };

// -- Helpers ------------------------------------------------------------------

// A field-targeted word write that keeps background provenance coherent: writing
// the backgroundWords track is a user edit, so it routes through the funnel and
// stamps source "manual". A main-words write carries no provenance.
function writeFieldWords(line: LyricLine, field: "words" | "backgroundWords", words: WordTiming[]): LyricLine {
  if (field === "backgroundWords") return reconcileLine({ ...line, ...manualBackgroundWordEdit(words) });
  return reconcileLine({ ...line, words });
}

function expandTargetsToSyllableGroups(targets: ExplicitTarget[], linesById: Map<string, LyricLine>): ExplicitTarget[] {
  const byLineField = new Map<string, { lineId: string; field: "words" | "backgroundWords"; indices: number[] }>();
  for (const t of targets) {
    const key = `${t.lineId}:${t.field}`;
    const existing = byLineField.get(key);
    if (existing) existing.indices.push(t.wordIndex);
    else byLineField.set(key, { lineId: t.lineId, field: t.field, indices: [t.wordIndex] });
  }
  const out: ExplicitTarget[] = [];
  for (const group of byLineField.values()) {
    const line = linesById.get(group.lineId);
    const currentWords = line?.[group.field];
    const expanded = currentWords ? expandSelectionToGroupmates(currentWords, group.indices) : group.indices;
    for (const idx of expanded) out.push({ lineId: group.lineId, field: group.field, wordIndex: idx });
  }
  return out;
}

function applyExplicitTargetToLines(
  lines: LyricLine[],
  lineId: string,
  field: "words" | "backgroundWords",
  newWords: WordTiming[],
): LyricLine[] {
  const target = lines.find((l) => l.id === lineId);
  if (!target) return lines;
  const sourceBefore = target[field];
  const linkScope = getLinkScope(target);

  return lines.map((line) => {
    if (line.id === lineId) {
      return writeFieldWords(line, field, newWords);
    }
    if (isLinkedSibling(line, linkScope)) {
      const propagated = applySiblingWords(newWords, sourceBefore, line[field]);
      if (propagated) return writeFieldWords(line, field, propagated);
    }
    return line;
  });
}

function applyMoveToBg(line: LyricLine, wordIndices: number[], timeDelta: number, duration: number): LyricLine | null {
  if (!line.words) return null;
  const indexSet = new Set(wordIndices);
  const movedWords = line.words.flatMap((word, index) => {
    if (!indexSet.has(index)) return [];
    const dur = word.end - word.begin;
    const newBegin = Math.max(0, Math.min(duration - dur, word.begin + timeDelta));
    return [{ ...word, begin: newBegin, end: newBegin + dur }];
  });

  if (movedWords.length === 0) return null;

  const remainingMain = trimTrailingSpaceFromLast(line.words.filter((_, i) => !indexSet.has(i)));
  const mergedBg = resolveOverlapsForward(mergeWordsIntoTrack(line.backgroundWords ?? [], movedWords), duration);

  return applyBackground(reconcileLine({ ...line, words: remainingMain }), {
    words: mergedBg,
    text: reconstructLineText(mergedBg, getSplitCharacter()),
    source: "manual",
  });
}

function applyMoveFromBg(
  line: LyricLine,
  wordIndices: number[],
  timeDelta: number,
  duration: number,
): LyricLine | null {
  if (!line.backgroundWords) return null;
  const indexSet = new Set(wordIndices);
  const movedWords = line.backgroundWords.flatMap((word, index) => {
    if (!indexSet.has(index)) return [];
    const dur = word.end - word.begin;
    const newBegin = Math.max(0, Math.min(duration - dur, word.begin + timeDelta));
    return [{ ...word, begin: newBegin, end: newBegin + dur }];
  });

  if (movedWords.length === 0) return null;

  const remainingBg = trimTrailingSpaceFromLast(line.backgroundWords.filter((_, i) => !indexSet.has(i)));
  const mergedMain = resolveOverlapsForward(mergeWordsIntoTrack(line.words ?? [], movedWords), duration);

  const withMain = reconcileLine({ ...line, words: mergedMain });
  if (remainingBg.length === 0) {
    return reconcileLine({ ...withMain, ...CLEARED_BACKGROUND });
  }
  return applyBackground(withMain, {
    words: remainingBg,
    text: reconstructLineText(remainingBg, getSplitCharacter()),
    source: "manual",
  });
}

function applyMergeSyllableGroup(
  lines: LyricLine[],
  lineId: string,
  field: "words" | "backgroundWords",
  wordIndices: number[],
): LyricLine[] | null {
  const target = lines.find((l) => l.id === lineId);
  if (!target) return null;
  const sourceWords = target[field];
  if (!sourceWords || sourceWords.length === 0) return null;
  const sourceCount = sourceWords.length;
  const selected = new Set(wordIndices.filter((i) => i >= 0 && i < sourceCount));
  if (selected.size === 0) return null;

  const linkScope = getLinkScope(target);
  let mutated = false;
  const newLines = lines.map((line) => {
    const isSource = line.id === lineId;
    const isSibling = !isSource && isLinkedSibling(line, linkScope) && line[field]?.length === sourceCount;
    if (!isSource && !isSibling) return line;
    const lineWords = line[field];
    if (!lineWords) return line;

    const runs = computeByGroupId(lineWords);
    const collapsed: WordTiming[] = [];
    let changed = false;
    let runIdx = 0;
    let i = 0;
    while (i < lineWords.length) {
      const run = runs[runIdx];
      if (!run || run.startIndex !== i) {
        collapsed.push(lineWords[i]);
        i++;
        continue;
      }
      runIdx++;
      let touched = false;
      for (let k = run.startIndex; k <= run.endIndex; k++) if (selected.has(k)) touched = true;
      if (touched) {
        const first = lineWords[run.startIndex];
        const { syllableGroupId: _drop, ...rest } = first;
        collapsed.push({
          ...rest,
          text: lineWords
            .slice(run.startIndex, run.endIndex + 1)
            .map((w) => w.text)
            .join(""),
          begin: first.begin,
          end: lineWords[run.endIndex].end,
        });
        changed = true;
      } else {
        for (let k = run.startIndex; k <= run.endIndex; k++) collapsed.push(lineWords[k]);
      }
      i = run.endIndex + 1;
    }
    if (!changed) return line;
    mutated = true;
    return writeFieldWords(line, field, collapsed);
  });
  if (!mutated) return null;
  return newLines;
}

function applyMarkWordsExplicit(lines: LyricLine[], targets: ExplicitTarget[], value: boolean): LyricLine[] | null {
  if (targets.length === 0) return null;
  let current = lines;
  let changed = false;
  const linesById = new Map<string, LyricLine>();
  for (const l of current) linesById.set(l.id, l);

  const expandedTargets = expandTargetsToSyllableGroups(targets, linesById);

  for (const target of expandedTargets) {
    const line = linesById.get(target.lineId);
    if (!line) continue;
    const currentWords = line[target.field];
    if (!currentWords || target.wordIndex < 0 || target.wordIndex >= currentWords.length) continue;
    if ((currentWords[target.wordIndex].explicit === true) === value) continue;

    const newWords: WordTiming[] = currentWords.map((word, i) => {
      if (i !== target.wordIndex) return word;
      if (value) return { ...word, explicit: true as const };
      const { explicit: _explicit, ...rest } = word;
      return rest;
    });

    const before = current;
    current = applyExplicitTargetToLines(current, target.lineId, target.field, newWords);
    for (let i = 0; i < current.length; i++) {
      if (current[i] !== before[i]) linesById.set(current[i].id, current[i]);
    }
    changed = true;
  }
  if (!changed) return null;
  return current;
}

// -- Exports ------------------------------------------------------------------

export { applyMarkWordsExplicit, applyMergeSyllableGroup, applyMoveFromBg, applyMoveToBg };
