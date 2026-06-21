import { instanceBounds } from "@/domain/instance/bounds";
import { linesOfInstance } from "@/domain/instance/enumerate";
import { mainBounds } from "@/domain/line/bounds";
import type { LineTemplate, LinkGroup, WordTemplate } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { GROUP_COLORS, pickNextGroupColor } from "@/utils/group-colors";

// -- Types ---------------------------------------------------------------------

interface CreateGroupResult {
  group: LinkGroup;
  updatedLines: LyricLine[];
}

// -- Selection helpers --------------------------------------------------------

function lineIdsAreContiguous(lines: LyricLine[], selectedLineIds: ReadonlySet<string>): boolean {
  if (selectedLineIds.size === 0) return false;
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (selectedLineIds.has(lines[i].id)) indices.push(i);
  }
  if (indices.length !== selectedLineIds.size) return false;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}

// Expand a selection to fill any gaps between min and max selected indices.
// Returns the expanded set, or null if any in-between line is already part of a group
// (which would make the resulting group invalid).
function fillSelectionGaps(
  lines: LyricLine[],
  selectedLineIds: ReadonlySet<string>,
): { expanded: Set<string>; addedCount: number } | null {
  if (selectedLineIds.size === 0) return null;
  const indices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (selectedLineIds.has(lines[i].id)) indices.push(i);
  }
  if (indices.length === 0) return null;
  const min = indices[0];
  const max = indices[indices.length - 1];
  const expanded = new Set<string>();
  let addedCount = 0;
  for (let i = min; i <= max; i++) {
    const line = lines[i];
    if (line.groupId !== undefined) return null; // any in-between is grouped → can't form coherent group
    if (!selectedLineIds.has(line.id)) addedCount++;
    expanded.add(line.id);
  }
  return { expanded, addedCount };
}

function selectionTouchesAnyGroup(lines: LyricLine[], selectedLineIds: ReadonlySet<string>): boolean {
  for (const line of lines) {
    if (selectedLineIds.has(line.id) && line.groupId !== undefined) return true;
  }
  return false;
}

// -- Create group --------------------------------------------------------------

function nextGroupId(existingGroups: LinkGroup[]): string {
  const used = new Set(existingGroups.map((g) => g.id));
  let i = 1;
  while (used.has(`g${i}`)) i++;
  return `g${i}`;
}

function createGroupFromSelection(
  lines: LyricLine[],
  selectedLineIds: ReadonlySet<string>,
  existingGroups: LinkGroup[],
  options: { label?: string } = {},
): CreateGroupResult | null {
  if (!lineIdsAreContiguous(lines, selectedLineIds)) return null;
  if (selectionTouchesAnyGroup(lines, selectedLineIds)) return null;

  const groupId = nextGroupId(existingGroups);
  const usedColors = existingGroups.map((g) => g.color);
  const color = pickNextGroupColor(usedColors.length > 0 ? usedColors : GROUP_COLORS.slice(0, 0));
  const label = options.label ?? `Group ${existingGroups.length + 1}`;

  const group: LinkGroup = { id: groupId, label, color, templateVersion: 1 };

  let templateLineIdx = 0;
  const updatedLines = lines.map((line) => {
    if (!selectedLineIds.has(line.id)) return line;
    const updated: LyricLine = {
      ...line,
      groupId,
      instanceIdx: 0,
      templateLineIdx: templateLineIdx,
    };
    templateLineIdx++;
    return updated;
  });

  return { group, updatedLines };
}

// -- Duplicate as linked -------------------------------------------------------

function instanceToTemplate(lines: LyricLine[], groupId: string, instanceIdx: number): LineTemplate[] {
  const matched = linesOfInstance(lines, groupId, instanceIdx).toSorted(
    (a, b) => (a.templateLineIdx ?? 0) - (b.templateLineIdx ?? 0),
  );
  const bounds = instanceBounds(matched);
  const startTime = bounds?.begin ?? 0;
  const templates: LineTemplate[] = [];

  for (const line of matched) {
    const tplWords: WordTemplate[] | undefined = line.words?.map((w) => ({
      text: w.text,
      relativeBegin: w.begin - startTime,
      relativeEnd: w.end - startTime,
    }));
    const tplBgWords: WordTemplate[] | undefined = line.backgroundWords?.map((w) => ({
      text: w.text,
      relativeBegin: w.begin - startTime,
      relativeEnd: w.end - startTime,
    }));

    const lineBounds = mainBounds(line);
    templates.push({
      text: line.text,
      agentId: line.agentId,
      relativeBegin: lineBounds ? lineBounds.begin - startTime : undefined,
      relativeEnd: lineBounds ? lineBounds.end - startTime : undefined,
      words: tplWords,
      backgroundText: line.backgroundText,
      backgroundWords: tplBgWords,
      backgroundTextSource: line.backgroundTextSource,
    });
  }
  return templates;
}

// -- Exports -------------------------------------------------------------------

export {
  createGroupFromSelection,
  lineIdsAreContiguous,
  fillSelectionGaps,
  selectionTouchesAnyGroup,
  instanceToTemplate,
};
