import { isLineSynced } from "@/domain/line/predicates";
import type { LyricLine } from "@/domain/line/model";

// -- Types ---------------------------------------------------------------------

type AnchorKind = "word-begin" | "word-end" | "line-begin" | "line-end" | "playhead";

interface SnapAnchor {
  t: number;
  kind: AnchorKind;
  label: string;
  lineId?: string;
  wordIndex?: number;
  track?: "word" | "bg";
}

type SelfKey = string;

interface FindSnapShiftArgs {
  edges: number[];
  anchors: SnapAnchor[];
  zoom: number;
  threshold: number;
  overlapCheck?: (shift: number) => boolean;
  invertCheck?: (shift: number) => boolean;
}

interface SnapResult {
  shift: number;
  anchor: SnapAnchor | null;
}

interface CandidateSnap {
  shift: number;
  distPx: number;
  anchor: SnapAnchor;
}

// -- Self-key helper -----------------------------------------------------------

function selfKey(lineId: string, wordIndex: number, track: "word" | "bg"): SelfKey {
  return `${lineId}:${wordIndex}:${track}`;
}

// -- Anchor collection ---------------------------------------------------------

function collectSnapAnchors(lines: LyricLine[], selfIds: Set<SelfKey>, playheadTime: number | null): SnapAnchor[] {
  const anchors: SnapAnchor[] = [];

  for (const line of lines) {
    const words = line.words;
    const wordCount = words?.length ?? 0;
    const wordTimed = wordCount > 0;

    if (words && wordCount > 0) {
      for (let i = 0; i < wordCount; i++) {
        const word = words[i];
        if (!selfIds.has(selfKey(line.id, i, "word"))) {
          anchors.push({
            t: word.begin,
            kind: "word-begin",
            label: word.text,
            lineId: line.id,
            wordIndex: i,
            track: "word",
          });
          anchors.push({
            t: word.end,
            kind: "word-end",
            label: word.text,
            lineId: line.id,
            wordIndex: i,
            track: "word",
          });
        }
      }
    }

    const bgWords = line.backgroundWords;
    const bgCount = bgWords?.length ?? 0;
    if (bgWords && bgCount > 0) {
      for (let i = 0; i < bgCount; i++) {
        const word = bgWords[i];
        if (!selfIds.has(selfKey(line.id, i, "bg"))) {
          anchors.push({
            t: word.begin,
            kind: "word-begin",
            label: word.text,
            lineId: line.id,
            wordIndex: i,
            track: "bg",
          });
          anchors.push({
            t: word.end,
            kind: "word-end",
            label: word.text,
            lineId: line.id,
            wordIndex: i,
            track: "bg",
          });
        }
      }
    }

    if (!wordTimed && isLineSynced(line)) {
      anchors.push({ t: line.begin, kind: "line-begin", label: line.text, lineId: line.id });
      anchors.push({ t: line.end, kind: "line-end", label: line.text, lineId: line.id });
    }
  }

  if (playheadTime !== null) {
    anchors.push({ t: playheadTime, kind: "playhead", label: "playhead" });
  }

  anchors.sort((a, b) => a.t - b.t);
  return anchors;
}

// -- Snap resolution -----------------------------------------------------------

function findSnapShift(args: FindSnapShiftArgs): SnapResult {
  const { edges, anchors, zoom, threshold, overlapCheck, invertCheck } = args;
  if (anchors.length === 0 || edges.length === 0) return { shift: 0, anchor: null };

  const candidates: CandidateSnap[] = [];
  for (const edge of edges) {
    for (const anchor of anchors) {
      const shift = anchor.t - edge;
      const distPx = Math.abs(shift) * zoom;
      if (distPx <= threshold) {
        candidates.push({ shift, distPx, anchor });
      }
    }
  }

  if (candidates.length === 0) return { shift: 0, anchor: null };

  candidates.sort((a, b) => {
    if (a.distPx !== b.distPx) return a.distPx - b.distPx;
    if (a.anchor.kind === "playhead" && b.anchor.kind !== "playhead") return -1;
    if (b.anchor.kind === "playhead" && a.anchor.kind !== "playhead") return 1;
    return 0;
  });

  for (const candidate of candidates) {
    if (overlapCheck && !overlapCheck(candidate.shift)) continue;
    if (invertCheck && !invertCheck(candidate.shift)) continue;
    return { shift: candidate.shift, anchor: candidate.anchor };
  }

  return { shift: 0, anchor: null };
}

// -- Exports -------------------------------------------------------------------

export { collectSnapAnchors, findSnapShift, selfKey };
export type { SnapAnchor };
