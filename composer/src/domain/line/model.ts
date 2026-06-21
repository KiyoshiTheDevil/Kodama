import type { WordTiming } from "@/domain/word/timing";

// -- Types --------------------------------------------------------------------

interface LineFields {
  id: string;
  text: string;
  agentId: string;
  backgroundText?: string;
  backgroundWords?: WordTiming[];
  backgroundTextSource?: "extraction" | "manual";
  groupId?: string;
  instanceIdx?: number;
  templateLineIdx?: number;
  detached?: boolean;
}

// LyricLine is a discriminated union over its timing shape. The discriminant is
// structural (presence of `words` vs `begin`/`end`), not a literal `kind` tag,
// so saved projects need no migration. The `never` constraints make a both-state
// line (`words` + `begin`) a compile error at every constructor and write.
interface WordSyncedLine extends LineFields {
  words: WordTiming[];
  begin?: never;
  end?: never;
}

interface LineSyncedLine extends LineFields {
  begin: number;
  end: number;
  words?: never;
}

interface UntimedLine extends LineFields {
  words?: never;
  begin?: never;
  end?: never;
}

type LyricLine = WordSyncedLine | LineSyncedLine | UntimedLine;

// A line shape before reconcileLine narrows it to a concrete variant: any
// combination of timing fields may be present. Used for merge scratch objects.
type LooseLine = LineFields & { words?: WordTiming[]; begin?: number; end?: number };

// -- Functions ----------------------------------------------------------------

// The store builds lines by spreading `...line` (a union member) together with
// Partial<LyricLine> updates or fresh timing fields. A generic spread widens
// past the LyricLine union, so reconcileLine re-narrows a freshly merged line
// into exactly one variant by its runtime shape. It enforces the core
// invariant: a line is never both word-synced and line-synced. A `words` array
// (even empty) wins and drops begin/end.
function reconcileLine(line: LooseLine): LyricLine {
  const { words, begin, end, ...rest } = line;
  if (words !== undefined) return { ...rest, words };
  if (begin !== undefined && end !== undefined) return { ...rest, begin, end };
  return rest;
}

// -- Exports ------------------------------------------------------------------

export { reconcileLine };

export type { LineFields, LineSyncedLine, LyricLine, LooseLine };
