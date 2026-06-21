import type { LyricsSearchPayload, LyricsSearchResult } from "@/domain/lyrics-search/result";
import type { SyncType } from "@/domain/lyrics-search/sync-type";
import { LyricsSearchError, type LyricsSearchProvider, type LyricsSearchQuery } from "@/utils/lyrics-search/types";

// -- Constants ----------------------------------------------------------------

const BINIMUM_BASE_URL = "https://lyrics-api.binimum.org/";
const ID_PREFIX = "binimum-";
const USER_AGENT = "Better Lyrics Composer (https://composer.boidu.dev)";
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const VALID_TIMING_TYPES: ReadonlySet<SyncType> = new Set<SyncType>(["syllable", "word", "line"]);

// -- Types --------------------------------------------------------------------

interface BinimumSearchResult {
  id: string;
  track_name: string;
  artist_name: string;
  album_name: string;
  duration: number;
  isrc: string;
  timing_type: SyncType;
  lyricsUrl: string;
}

interface BinimumSearchResponse {
  total: number;
  source: string;
  results: BinimumSearchResult[];
}

// -- Helpers ------------------------------------------------------------------

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeIsrc(input: string | undefined): string | null {
  if (!hasNonEmptyString(input)) return null;
  const candidate = input.trim().toUpperCase();
  return ISRC_REGEX.test(candidate) ? candidate : null;
}

function isValidIsrc(input: string | undefined): boolean {
  return normalizeIsrc(input) !== null;
}

function hasTrackAndArtist(query: LyricsSearchQuery): boolean {
  return hasNonEmptyString(query.track) && hasNonEmptyString(query.artist);
}

function canSearch(query: LyricsSearchQuery): boolean {
  if (hasTrackAndArtist(query)) return true;
  return isValidIsrc(query.isrc);
}

function buildSearchUrl(query: LyricsSearchQuery): URL {
  const url = new URL(BINIMUM_BASE_URL);
  const isrc = normalizeIsrc(query.isrc);

  if (isrc && !hasTrackAndArtist(query)) {
    url.searchParams.set("isrc", isrc);
    return url;
  }

  if (hasNonEmptyString(query.track)) url.searchParams.set("track", query.track.trim());
  if (hasNonEmptyString(query.artist)) url.searchParams.set("artist", query.artist.trim());
  if (hasNonEmptyString(query.album)) url.searchParams.set("album", query.album.trim());
  if (typeof query.durationSec === "number" && Number.isFinite(query.durationSec)) {
    url.searchParams.set("duration", Math.round(query.durationSec).toString());
  }
  if (isrc) url.searchParams.set("isrc", isrc);
  return url;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}

function deriveSyncType(timingType: string): SyncType {
  if (VALID_TIMING_TYPES.has(timingType as SyncType)) return timingType as SyncType;
  return "line";
}

function mapResponseToResult(result: BinimumSearchResult): LyricsSearchResult {
  const album = hasNonEmptyString(result.album_name) ? result.album_name : undefined;
  const payload: LyricsSearchPayload = { kind: "deferred-ttml", fetchUrl: result.lyricsUrl };

  return {
    id: `${ID_PREFIX}${result.id}`,
    source: "binimum",
    sourceLabel: "Binimum",
    syncType: deriveSyncType(result.timing_type),
    track: result.track_name,
    artist: result.artist_name,
    album,
    durationSec: Math.round(result.duration),
    payload,
  };
}

// -- Search -------------------------------------------------------------------

async function search(query: LyricsSearchQuery, signal: AbortSignal): Promise<LyricsSearchResult[]> {
  if (!canSearch(query)) return [];
  if (signal.aborted) return [];

  try {
    const url = buildSearchUrl(query);
    const response = await fetch(url.toString(), {
      signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (signal.aborted) return [];
    if (response.status === 404) return [];
    if (response.status === 400) return [];
    if (response.status >= 500) {
      throw new LyricsSearchError("binimum", `Binimum search returned ${response.status}`);
    }
    if (!response.ok) {
      throw new LyricsSearchError("binimum", `Binimum search returned ${response.status}`);
    }

    const body = (await response.json()) as BinimumSearchResponse;
    if (!body || !Array.isArray(body.results)) return [];

    const mapped: LyricsSearchResult[] = [];
    for (const candidate of body.results) {
      if (!candidate || typeof candidate.lyricsUrl !== "string" || candidate.lyricsUrl.length === 0) continue;
      mapped.push(mapResponseToResult(candidate));
    }
    return mapped;
  } catch (error) {
    if (isAbortError(error)) return [];
    if (error instanceof LyricsSearchError) throw error;
    throw new LyricsSearchError("binimum", "Binimum search request failed", error);
  }
}

// -- Provider -----------------------------------------------------------------

const binimumProvider: LyricsSearchProvider = {
  name: "binimum",
  sourceLabel: "Binimum",
  canSearch,
  search,
};

// -- Exports ------------------------------------------------------------------

export { binimumProvider };
