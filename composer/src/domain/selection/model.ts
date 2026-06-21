// -- Types --------------------------------------------------------------------

interface WordSelection {
  lineId: string;
  lineIndex: number;
  wordIndex: number;
  type: "word" | "bg";
}

// -- Exports ------------------------------------------------------------------

export type { WordSelection };
