import type { LyricsSearchResult, ProviderName } from "@/domain/lyrics-search/result";

// -- Types --------------------------------------------------------------------

interface LyricsSearchQuery {
  track?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
  videoId?: string;
  isrc?: string;
}

interface LyricsSearchProvider {
  name: ProviderName;
  sourceLabel: string;
  canSearch(query: LyricsSearchQuery): boolean;
  search(query: LyricsSearchQuery, signal: AbortSignal): Promise<LyricsSearchResult[]>;
}

// -- Errors -------------------------------------------------------------------

class LyricsSearchError extends Error {
  public provider: ProviderName;
  public override cause?: unknown;

  constructor(provider: ProviderName, message: string, cause?: unknown) {
    super(message);
    this.name = "LyricsSearchError";
    this.provider = provider;
    this.cause = cause;
  }
}

// -- Exports ------------------------------------------------------------------

export { LyricsSearchError };
export type { LyricsSearchProvider, LyricsSearchQuery };
