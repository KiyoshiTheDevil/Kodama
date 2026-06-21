import type { SyncType } from "@/domain/lyrics-search/sync-type";

// -- Types --------------------------------------------------------------------

type ProviderName = "lrclib" | "binimum" | "boidu-lyrics";

type LyricsSearchPayload =
  | { kind: "lrc"; synced: string | null; plain: string | null }
  | { kind: "ttml"; xml: string }
  | { kind: "deferred-ttml"; fetchUrl: string };

interface LyricsSearchResult {
  id: string;
  source: ProviderName;
  sourceLabel: string;
  syncType: SyncType;
  track: string;
  artist: string;
  album?: string;
  durationSec: number;
  payload: LyricsSearchPayload;
}

// -- Exports ------------------------------------------------------------------

export type { LyricsSearchPayload, LyricsSearchResult, ProviderName };
