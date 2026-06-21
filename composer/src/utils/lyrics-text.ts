import { CLEARED_BACKGROUND } from "@/domain/line/background";
import type { LyricLine } from "@/domain/line/model";
import { reconcileMatchedTiming } from "@/domain/line/reconcile-text";
import { cleanSplitCharacters, stripSplitCharacter } from "@/utils/split-character";

// -- Helpers ------------------------------------------------------------------

function textToLyricLines(text: string, defaultAgentId: string, existingLines: LyricLine[] = []): LyricLine[] {
  const textToCandidates = new Map<string, LyricLine[]>();
  for (const line of existingLines) {
    const key = stripSplitCharacter(line.text);
    let bucket = textToCandidates.get(key);
    if (!bucket) {
      bucket = [];
      textToCandidates.set(key, bucket);
    }
    bucket.push(line);
  }

  const usedExistingIds = new Set<string>();
  const newLines = text.split("\n");
  // Position-based fallback only makes sense when the user is editing-in-place
  // (same number of typed lines as existing lines). If the count changed, the
  // user inserted or deleted rows: position-match would silently overwrite the
  // wrong existing line, so we generate a fresh id for any unmatched typed line.
  const allowPositionMatch = newLines.length === existingLines.length;

  const mapped = newLines.map((lineText, index) => {
    const trimmed = lineText.trim();
    const cleanedText = cleanSplitCharacters(trimmed);
    const matchText = stripSplitCharacter(cleanedText);

    const candidates = textToCandidates.get(matchText);
    const exactMatch = candidates?.find((line) => !usedExistingIds.has(line.id));
    if (exactMatch) {
      usedExistingIds.add(exactMatch.id);
      return reconcileMatchedTiming(exactMatch, cleanedText);
    }

    if (allowPositionMatch) {
      const positionMatch = existingLines[index];
      if (positionMatch && !usedExistingIds.has(positionMatch.id)) {
        usedExistingIds.add(positionMatch.id);
        return reconcileMatchedTiming(positionMatch, cleanedText);
      }
    }

    return {
      id: crypto.randomUUID(),
      text: cleanedText,
      agentId: defaultAgentId,
    };
  });

  // Raw parentheses in `text` are the source of truth for background vocals;
  // a carried-over extracted backgroundText would double on re-extraction.
  return mapped.map((line) => (/\([^)]*\)/.test(line.text) ? { ...line, ...CLEARED_BACKGROUND } : line));
}

// -- Exports ------------------------------------------------------------------

export { textToLyricLines };
