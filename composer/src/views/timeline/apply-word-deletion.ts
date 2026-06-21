import { isLinked } from "@/domain/instance/predicates";
import { CLEARED_BACKGROUND, manualBackgroundWordEdit } from "@/domain/line/background";
import { isLineSynced } from "@/domain/line/predicates";
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import { reconcileLine, type LyricLine } from "@/domain/line/model";
import { getSplitCharacter } from "@/utils/split-character";
import { absorbDeletedSyllablesIntoNeighbors } from "@/domain/word/syllable-groups";

interface DeletionSelection {
  lineId: string;
  type: "word" | "bg";
  wordIndex: number;
}

function isLineFullyEmpty(line: LyricLine): boolean {
  return (
    (line.words?.length ?? 0) === 0 &&
    (line.backgroundWords?.length ?? 0) === 0 &&
    line.begin === undefined &&
    line.end === undefined
  );
}

function applyWordDeletion(lines: LyricLine[], selectedWords: ReadonlyArray<DeletionSelection>): LyricLine[] {
  if (selectedWords.length === 0) return lines;

  const splitChar = getSplitCharacter();

  const byLine = new Map<string, { mainIdxs: Set<number>; bgIdxs: Set<number> }>();
  for (const sel of selectedWords) {
    let entry = byLine.get(sel.lineId);
    if (!entry) {
      entry = { mainIdxs: new Set(), bgIdxs: new Set() };
      byLine.set(sel.lineId, entry);
    }
    if (sel.type === "word") entry.mainIdxs.add(sel.wordIndex);
    else entry.bgIdxs.add(sel.wordIndex);
  }

  const linesById = new Map<string, LyricLine>();
  for (const l of lines) linesById.set(l.id, l);

  const updatedById = new Map<string, LyricLine>();

  for (const [lineId, { mainIdxs, bgIdxs }] of byLine) {
    const line = linesById.get(lineId);
    if (!line) continue;

    const realMainCount = line.words?.length ?? 0;
    const lineSynced = isLineSynced(line);

    let nextMain = line.words;
    let willHaveNoMainWords = realMainCount === 0;
    if (lineSynced && mainIdxs.has(0)) {
      nextMain = undefined;
      willHaveNoMainWords = true;
    } else if (realMainCount > 0 && mainIdxs.size > 0 && line.words) {
      const absorbed = absorbDeletedSyllablesIntoNeighbors(line.words, mainIdxs);
      nextMain = absorbed.filter((_, i) => !mainIdxs.has(i));
      willHaveNoMainWords = nextMain.length === 0;
    }

    const bgEdited = (line.backgroundWords?.length ?? 0) > 0 && bgIdxs.size > 0 && line.backgroundWords !== undefined;
    let bgFields: Partial<LyricLine> = {};
    if (bgEdited && line.backgroundWords) {
      const absorbed = absorbDeletedSyllablesIntoNeighbors(line.backgroundWords, bgIdxs);
      const remaining = absorbed.filter((_, i) => !bgIdxs.has(i));
      bgFields = remaining.length > 0 ? manualBackgroundWordEdit(remaining) : CLEARED_BACKGROUND;
    }

    const updatedLine = reconcileLine({
      ...line,
      words: nextMain,
      text: nextMain && nextMain.length > 0 ? reconstructLineText(nextMain, splitChar) : line.text,
      ...bgFields,
      ...(willHaveNoMainWords ? { begin: undefined, end: undefined } : {}),
    });

    updatedById.set(lineId, updatedLine);
  }

  let result = lines.map((line) => updatedById.get(line.id) ?? line);

  // Auto-cleanup: when every line in a touched instance is now fully empty
  // (no words, no bg words, no begin/end), strip the group attrs so the rows
  // become standalone placeholders. The instance disappears from the group
  // registry visually (no orphan banner at x=0). The rows remain so the
  // existing Cmd+D / paste-as-instance fill flow can repopulate them.
  const affectedInstanceKeys = new Set<string>();
  for (const sel of selectedWords) {
    const updated = updatedById.get(sel.lineId);
    if (updated && isLinked(updated)) {
      affectedInstanceKeys.add(`${updated.groupId}:${updated.instanceIdx}`);
    }
  }

  if (affectedInstanceKeys.size > 0) {
    const linesByInstanceKey = new Map<string, LyricLine[]>();
    for (const l of result) {
      if (!isLinked(l)) continue;
      const key = `${l.groupId}:${l.instanceIdx}`;
      const bucket = linesByInstanceKey.get(key);
      if (bucket) bucket.push(l);
      else linesByInstanceKey.set(key, [l]);
    }

    const keysToStrip = new Set<string>();
    for (const key of affectedInstanceKeys) {
      const instanceLines = linesByInstanceKey.get(key);
      if (!instanceLines || instanceLines.length === 0) continue;
      if (instanceLines.every(isLineFullyEmpty)) keysToStrip.add(key);
    }

    if (keysToStrip.size > 0) {
      result = result.map((line) => {
        if (!isLinked(line)) return line;
        if (!keysToStrip.has(`${line.groupId}:${line.instanceIdx}`)) return line;
        return { ...line, groupId: undefined, instanceIdx: undefined, templateLineIdx: undefined, detached: undefined };
      });
    }
  }

  return result;
}

export { applyWordDeletion };
export type { DeletionSelection };
