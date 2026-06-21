import type { LyricsSearchPayload, LyricsSearchResult } from "@/domain/lyrics-search/result";
import { detectLrcSyncType, type SyncType } from "@/domain/lyrics-search/sync-type";
import { LyricsSearchError, type LyricsSearchProvider, type LyricsSearchQuery } from "@/utils/lyrics-search/types";

// -- Constants ----------------------------------------------------------------

const LRCLIB_BASE_URL = "https://lrclib.net";
const SEARCH_PATH = "/api/search";
const GET_PATH = "/api/get";
const ID_PREFIX = "lrclib-";
const USER_AGENT = "Better Lyrics Composer (https://composer.boidu.dev)";

// -- Types --------------------------------------------------------------------

interface LrcLibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

// -- Helpers ------------------------------------------------------------------

function hasNonEmptyTrack(query: LyricsSearchQuery): boolean {
  return typeof query.track === "string" && query.track.trim().length > 0;
}

function buildSearchUrl(query: LyricsSearchQuery): URL {
  const url = new URL(SEARCH_PATH, LRCLIB_BASE_URL);
  url.searchParams.set("track_name", (query.track ?? "").trim());
  if (query.artist?.trim()) url.searchParams.set("artist_name", query.artist.trim());
  if (query.album?.trim()) url.searchParams.set("album_name", query.album.trim());
  if (typeof query.durationSec === "number" && Number.isFinite(query.durationSec)) {
    url.searchParams.set("duration", Math.round(query.durationSec).toString());
  }
  return url;
}

function buildGetUrl(query: LyricsSearchQuery): URL {
  const url = new URL(GET_PATH, LRCLIB_BASE_URL);
  url.searchParams.set("track_name", (query.track ?? "").trim());
  url.searchParams.set("artist_name", (query.artist ?? "").trim());
  url.searchParams.set("album_name", (query.album ?? "").trim());
  url.searchParams.set("duration", Math.round(query.durationSec as number).toString());
  return url;
}

function canRunGet(query: LyricsSearchQuery): boolean {
  return (
    typeof query.track === "string" &&
    query.track.trim().length > 0 &&
    typeof query.artist === "string" &&
    query.artist.trim().length > 0 &&
    typeof query.album === "string" &&
    query.album.trim().length > 0 &&
    typeof query.durationSec === "number" &&
    Number.isFinite(query.durationSec)
  );
}

function deriveSyncType(synced: string | null, plain: string | null): SyncType | null {
  if (synced && synced.trim().length > 0) return detectLrcSyncType(synced);
  if (plain && plain.trim().length > 0) return "unsynced";
  return null;
}

function mapResponseToResult(response: LrcLibResponse): LyricsSearchResult | null {
  const synced = response.syncedLyrics ?? null;
  const plain = response.plainLyrics ?? null;
  const syncType = deriveSyncType(synced, plain);
  if (syncType === null) return null;

  const album = response.albumName && response.albumName.trim().length > 0 ? response.albumName : undefined;
  const payload: LyricsSearchPayload = { kind: "lrc", synced, plain };

  return {
    id: `${ID_PREFIX}${response.id.toString()}`,
    source: "lrclib",
    sourceLabel: "LRCLib",
    syncType,
    track: response.trackName,
    artist: response.artistName,
    album,
    durationSec: Math.round(response.duration),
    payload,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchSearch(query: LyricsSearchQuery, signal: AbortSignal): Promise<LrcLibResponse[]> {
  const url = buildSearchUrl(query);
  const response = await fetch(url.toString(), {
    signal,
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return [];
  if (response.status >= 500) {
    throw new LyricsSearchError("lrclib", `LRCLib /api/search returned ${response.status}`);
  }
  if (!response.ok) {
    throw new LyricsSearchError("lrclib", `LRCLib /api/search returned ${response.status}`);
  }
  const body = (await response.json()) as LrcLibResponse[];
  return Array.isArray(body) ? body : [];
}

async function fetchGet(query: LyricsSearchQuery, signal: AbortSignal): Promise<LrcLibResponse | null> {
  const url = buildGetUrl(query);
  const response = await fetch(url.toString(), {
    signal,
    headers: { "User-Agent": USER_AGENT },
  });
  if (response.status === 404) return null;
  if (response.status >= 500) {
    throw new LyricsSearchError("lrclib", `LRCLib /api/get returned ${response.status}`);
  }
  if (!response.ok) {
    throw new LyricsSearchError("lrclib", `LRCLib /api/get returned ${response.status}`);
  }
  const body = (await response.json()) as LrcLibResponse;
  return body;
}

// -- Search -------------------------------------------------------------------

async function search(query: LyricsSearchQuery, signal: AbortSignal): Promise<LyricsSearchResult[]> {
  if (!hasNonEmptyTrack(query)) return [];
  if (signal.aborted) return [];

  const tasks: Promise<unknown>[] = [fetchSearch(query, signal)];
  if (canRunGet(query)) tasks.push(fetchGet(query, signal));

  const settled = await Promise.allSettled(tasks);

  if (signal.aborted) return [];

  const searchSettled = settled[0] as PromiseSettledResult<LrcLibResponse[]>;
  const getSettled = settled.length > 1 ? (settled[1] as PromiseSettledResult<LrcLibResponse | null>) : null;

  const searchResponses: LrcLibResponse[] =
    searchSettled.status === "fulfilled" ? searchSettled.value : handleSearchRejection(searchSettled.reason);
  const getResponse: LrcLibResponse | null =
    getSettled === null
      ? null
      : getSettled.status === "fulfilled"
        ? getSettled.value
        : handleGetRejection(getSettled.reason);

  const merged: LyricsSearchResult[] = [];
  const seenIds = new Set<string>();

  if (getResponse !== null) {
    const exact = mapResponseToResult(getResponse);
    if (exact !== null) {
      merged.push(exact);
      seenIds.add(exact.id);
    }
  }

  for (const candidate of searchResponses) {
    const mapped = mapResponseToResult(candidate);
    if (mapped === null) continue;
    if (seenIds.has(mapped.id)) continue;
    merged.push(mapped);
    seenIds.add(mapped.id);
  }

  return merged;
}

function handleSearchRejection(reason: unknown): LrcLibResponse[] {
  if (isAbortError(reason)) return [];
  if (reason instanceof LyricsSearchError) throw reason;
  throw new LyricsSearchError("lrclib", "LRCLib /api/search request failed", reason);
}

function handleGetRejection(_reason: unknown): LrcLibResponse | null {
  return null;
}

// -- Provider -----------------------------------------------------------------

const lrclibProvider: LyricsSearchProvider = {
  name: "lrclib",
  sourceLabel: "LRCLib",
  canSearch: hasNonEmptyTrack,
  search,
};

// -- Exports ------------------------------------------------------------------

export { lrclibProvider };
