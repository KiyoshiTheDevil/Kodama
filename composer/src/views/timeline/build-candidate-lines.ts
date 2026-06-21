import type { LyricLine } from "@/domain/line/model";
import type { WordSelection } from "@/domain/selection/model";

function buildCandidateLines(lines: LyricLine[], selectedWords: ReadonlyArray<WordSelection>): LyricLine[] | undefined {
  if (selectedWords.length === 0) return undefined;

  const byLine = new Map<string, { mainIdxs: Set<number>; bgIdxs: Set<number>; lineIndex: number }>();
  for (const sel of selectedWords) {
    let entry = byLine.get(sel.lineId);
    if (!entry) {
      entry = { mainIdxs: new Set(), bgIdxs: new Set(), lineIndex: sel.lineIndex };
      byLine.set(sel.lineId, entry);
    }
    if (sel.type === "word") entry.mainIdxs.add(sel.wordIndex);
    else entry.bgIdxs.add(sel.wordIndex);
  }

  const linesById = new Map<string, LyricLine>();
  for (const l of lines) linesById.set(l.id, l);

  const candidates: { line: LyricLine; lineIndex: number }[] = [];
  for (const [lineId, { mainIdxs, bgIdxs, lineIndex }] of byLine) {
    const line = linesById.get(lineId);
    if (!line) return undefined;
    const totalMain = line.words?.length ?? 0;
    const totalBg = line.backgroundWords?.length ?? 0;
    if (mainIdxs.size !== totalMain) return undefined;
    if (bgIdxs.size !== totalBg) return undefined;
    candidates.push({ line, lineIndex });
  }

  candidates.sort((a, b) => a.lineIndex - b.lineIndex);
  return candidates.map((c) => c.line);
}

export { buildCandidateLines };
