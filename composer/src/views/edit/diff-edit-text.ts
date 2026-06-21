import { extractLinkedFields } from "@/domain/group/linking";
import { propagateWordChanges } from "@/domain/group/smart-sync";
import { isLinked } from "@/domain/instance/predicates";
import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";

// -- Types --------------------------------------------------------------------

interface ContentUpdate {
  id: string;
  updates: Partial<LyricLine>;
}

interface DiffResult {
  contentUpdates: ContentUpdate[];
  hasStructuralChange: boolean;
}

// -- Constants ----------------------------------------------------------------

const TIMING_CLEAR_FIELDS = ["words", "begin", "end", "backgroundWords"] as const;
const CONTENT_FIELDS = ["text", "agentId", "backgroundText", "backgroundTextSource"] as const;

// -- Helpers ------------------------------------------------------------------

function diffEditTextChange(oldLines: LyricLine[], newLines: LyricLine[]): DiffResult {
  if (oldLines.length !== newLines.length) {
    return { contentUpdates: [], hasStructuralChange: true };
  }

  for (let i = 0; i < oldLines.length; i++) {
    if (oldLines[i].id !== newLines[i].id) {
      return { contentUpdates: [], hasStructuralChange: true };
    }
  }

  const contentUpdates: ContentUpdate[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    const updates: Partial<LyricLine> = {};

    for (const field of CONTENT_FIELDS) {
      if (oldLine[field] !== newLine[field]) {
        (updates as Record<string, unknown>)[field] = newLine[field];
      }
    }

    for (const field of TIMING_CLEAR_FIELDS) {
      if (oldLine[field] !== undefined && newLine[field] === undefined) {
        (updates as Record<string, unknown>)[field] = undefined;
      }
    }

    if (Object.keys(updates).length > 0) {
      contentUpdates.push({ id: oldLine.id, updates });
    }
  }

  return { contentUpdates, hasStructuralChange: false };
}

interface ImpactedInstance {
  groupId: string;
  instanceIdx: number;
}

function instancesByKey(lines: LyricLine[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const line of lines) {
    if (!isLinked(line)) continue;
    const key = `${line.groupId}:${line.instanceIdx}`;
    let bucket = out.get(key);
    if (!bucket) {
      bucket = new Set();
      out.set(key, bucket);
    }
    bucket.add(line.id);
  }
  return out;
}

function findStructurallyImpactedInstances(oldLines: LyricLine[], newLines: LyricLine[]): ImpactedInstance[] {
  const oldByKey = instancesByKey(oldLines);
  const newByKey = instancesByKey(newLines);

  const seen = new Set<string>();
  const impacted: ImpactedInstance[] = [];

  const push = (groupId: string, instanceIdx: number) => {
    const key = `${groupId}:${instanceIdx}`;
    if (seen.has(key)) return;
    seen.add(key);
    impacted.push({ groupId, instanceIdx });
  };

  // Detection 1: an instance gained or lost line ids between old and new.
  for (const [key, oldIds] of oldByKey) {
    const newIds = newByKey.get(key) ?? new Set<string>();
    let differs = oldIds.size !== newIds.size;
    if (!differs) {
      for (const id of oldIds) {
        if (!newIds.has(id)) {
          differs = true;
          break;
        }
      }
    }
    if (differs) {
      const [groupId, instanceIdxStr] = key.split(":");
      push(groupId, Number.parseInt(instanceIdxStr, 10));
    }
  }

  // Detection 2: a non-grouped line was inserted positionally between two
  // grouped lines from the same instance. The id-set check above misses this
  // when textToLyricLines preserved every existing id and only added a fresh
  // ungrouped row in the middle of an instance.
  for (let i = 1; i < newLines.length - 1; i++) {
    const middle = newLines[i];
    if (middle.groupId !== undefined) continue;
    const prev = newLines[i - 1];
    const next = newLines[i + 1];
    if (prev.groupId === undefined || next.groupId === undefined) continue;
    if (prev.groupId !== next.groupId) continue;
    if (prev.instanceIdx === undefined || prev.instanceIdx !== next.instanceIdx) continue;
    push(prev.groupId, prev.instanceIdx);
  }

  return impacted;
}

function detachInstancesFromLines(lines: LyricLine[], instances: ImpactedInstance[]): LyricLine[] {
  if (instances.length === 0) return lines;
  const impactedKeys = new Set(instances.map((i) => `${i.groupId}:${i.instanceIdx}`));

  return lines.map((line) => {
    if (!isLinked(line)) return line;
    if (!impactedKeys.has(`${line.groupId}:${line.instanceIdx}`)) return line;
    return {
      ...line,
      groupId: undefined,
      instanceIdx: undefined,
      templateLineIdx: undefined,
      detached: undefined,
    };
  });
}

interface LinkedScope {
  groupId: string;
  templateLineIdx: number;
  linkedUpdate: Partial<LyricLine>;
  sourceWordsBefore: LyricLine["words"];
  sourceWordsAfter: LyricLine["words"];
  sourceBgWordsBefore: LyricLine["backgroundWords"];
  sourceBgWordsAfter: LyricLine["backgroundWords"];
}

function propagateContentUpdates(
  oldLines: LyricLine[],
  newLines: LyricLine[],
  contentUpdates: ContentUpdate[],
): LyricLine[] {
  if (contentUpdates.length === 0) return newLines;

  const oldById = new Map<string, LyricLine>();
  for (const line of oldLines) oldById.set(line.id, line);

  const newById = new Map<string, LyricLine>();
  for (const line of newLines) newById.set(line.id, line);

  const updatesById = new Map<string, ContentUpdate>();
  for (const update of contentUpdates) {
    updatesById.set(update.id, update);
  }

  const linkedScopes: LinkedScope[] = [];
  for (const update of contentUpdates) {
    const sourceNew = newById.get(update.id);
    const sourceOld = oldById.get(update.id);
    if (!sourceNew || !sourceOld) continue;
    if (sourceNew.groupId === undefined || sourceNew.templateLineIdx === undefined || sourceNew.detached) continue;
    const linkedUpdate = extractLinkedFields(update.updates);
    const wordsChanged = "words" in update.updates;
    const bgWordsChanged = "backgroundWords" in update.updates;
    if (Object.keys(linkedUpdate).length === 0 && !wordsChanged && !bgWordsChanged) continue;
    linkedScopes.push({
      groupId: sourceNew.groupId,
      templateLineIdx: sourceNew.templateLineIdx,
      linkedUpdate,
      sourceWordsBefore: sourceOld.words,
      sourceWordsAfter: sourceNew.words,
      sourceBgWordsBefore: sourceOld.backgroundWords,
      sourceBgWordsAfter: sourceNew.backgroundWords,
    });
  }

  if (linkedScopes.length === 0) return newLines;

  return newLines.map((line) => {
    if (updatesById.has(line.id)) return line;
    if (line.groupId === undefined || line.templateLineIdx === undefined || line.detached) return line;

    const merged: Partial<LooseLine> = {};
    for (const scope of linkedScopes) {
      if (line.groupId !== scope.groupId) continue;
      if (line.templateLineIdx !== scope.templateLineIdx) continue;
      Object.assign(merged, scope.linkedUpdate);
      const propagatedWords = propagateWordChanges(scope.sourceWordsAfter, scope.sourceWordsBefore, line.words);
      if (propagatedWords) merged.words = propagatedWords;
      const propagatedBg = propagateWordChanges(
        scope.sourceBgWordsAfter,
        scope.sourceBgWordsBefore,
        line.backgroundWords,
      );
      if (propagatedBg) merged.backgroundWords = propagatedBg;
    }
    if (Object.keys(merged).length === 0) return line;
    return reconcileLine({ ...line, ...merged });
  });
}

// -- Exports ------------------------------------------------------------------

export { detachInstancesFromLines, diffEditTextChange, findStructurallyImpactedInstances, propagateContentUpdates };
export type { ImpactedInstance };
