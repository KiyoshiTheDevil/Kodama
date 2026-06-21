import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";

// -- Types ---------------------------------------------------------------------

interface ClipboardEntry {
  word: WordTiming;
  lineOffset: number;
  trackType: "word" | "bg";
}

interface ClipboardData {
  entries: ClipboardEntry[];
  sourceInstance?: {
    groupId: string;
    instanceIdx: number;
  };
  candidateLines?: LyricLine[];
}

type PasteMode = { status: "idle" } | { status: "preview"; clipboard: ClipboardData };

// -- Exports -------------------------------------------------------------------

export type { ClipboardEntry, ClipboardData, PasteMode };
