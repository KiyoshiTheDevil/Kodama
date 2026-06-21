import type { LineTemplate, LinkGroup } from "@/domain/group/template";
import { reconcileLine, type LyricLine } from "@/domain/line/model";

interface FillResult {
  ok: boolean;
  reason?: "not_enough_empty_lines" | "out_of_range";
  updatedLines?: LyricLine[];
  newGroup?: LinkGroup;
  instanceIdx?: number;
}

interface FillInput {
  lines: LyricLine[];
  groupId: string;
  template: LineTemplate[];
  startIndex: number;
  instanceStart: number;
}

function isEmptyFillable(line: LyricLine): boolean {
  return line.groupId === undefined && (!line.words || line.words.length === 0);
}

function fillEmptyLinesWithInstance(input: FillInput): FillResult {
  const { lines, groupId, template, startIndex, instanceStart } = input;

  if (startIndex < 0 || startIndex + template.length > lines.length) {
    return { ok: false, reason: "out_of_range" };
  }

  for (let i = 0; i < template.length; i++) {
    const target = lines[startIndex + i];
    if (!isEmptyFillable(target)) {
      return { ok: false, reason: "not_enough_empty_lines" };
    }
  }

  const usedIndices = new Set(
    lines.flatMap((l) => (l.groupId === groupId && l.instanceIdx !== undefined ? [l.instanceIdx] : [])),
  );
  let instanceIdx = 0;
  while (usedIndices.has(instanceIdx)) instanceIdx++;

  const updatedLines = lines.map((line, idx) => {
    if (idx < startIndex || idx >= startIndex + template.length) return line;
    const tplLine = template[idx - startIndex];
    return reconcileLine({
      ...line,
      text: tplLine.text,
      agentId: tplLine.agentId,
      groupId,
      instanceIdx,
      templateLineIdx: idx - startIndex,
      ...(tplLine.relativeBegin !== undefined
        ? { begin: tplLine.relativeBegin + instanceStart }
        : { begin: undefined }),
      ...(tplLine.relativeEnd !== undefined ? { end: tplLine.relativeEnd + instanceStart } : { end: undefined }),
      ...(tplLine.words
        ? {
            words: tplLine.words.map((w) => ({
              text: w.text,
              begin: w.relativeBegin + instanceStart,
              end: w.relativeEnd + instanceStart,
            })),
          }
        : { words: undefined }),
      ...(tplLine.backgroundText !== undefined
        ? { backgroundText: tplLine.backgroundText }
        : { backgroundText: undefined }),
      ...(tplLine.backgroundWords
        ? {
            backgroundWords: tplLine.backgroundWords.map((w) => ({
              text: w.text,
              begin: w.relativeBegin + instanceStart,
              end: w.relativeEnd + instanceStart,
            })),
          }
        : { backgroundWords: undefined }),
      backgroundTextSource: tplLine.backgroundTextSource,
    });
  });

  return { ok: true, updatedLines, instanceIdx };
}

export { fillEmptyLinesWithInstance, isEmptyFillable };
