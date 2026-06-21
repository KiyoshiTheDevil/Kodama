import type { LyricLine } from "@/domain/line/model";
import type { LyricsSearchResult } from "@/domain/lyrics-search/result";
import type { ParseResult } from "@/utils/lyrics-parsers/shared";

function wrapTextAsParseResult(lines: LyricLine[]): ParseResult {
  return { lines, metadata: {}, hasTimingData: false };
}

function syntheticFilenameForResult(result: LyricsSearchResult): string {
  const ext = result.payload.kind === "lrc" ? "lrc" : "ttml";
  return `${result.source}-${result.id}.${ext}`;
}

async function payloadToContent(result: LyricsSearchResult, signal: AbortSignal): Promise<string | null> {
  if (result.payload.kind === "ttml") return result.payload.xml;
  if (result.payload.kind === "lrc") return result.payload.synced ?? result.payload.plain;

  const response = await fetch(result.payload.fetchUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch lyrics (${response.status})`);
  }
  const text = await response.text();
  if (text.length === 0) return null;
  return text;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// -- Exports ------------------------------------------------------------------

export { isAbortError, payloadToContent, syntheticFilenameForResult, wrapTextAsParseResult };
