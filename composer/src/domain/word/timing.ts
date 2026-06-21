// -- Types --------------------------------------------------------------------

interface WordTiming {
  text: string;
  begin: number;
  end: number;
  explicit?: true;
  syllableGroupId?: string;
}

// -- Exports ------------------------------------------------------------------

export type { WordTiming };
