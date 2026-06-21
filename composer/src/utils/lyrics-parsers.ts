import { detectFileType, type LyricsFileType } from "@/utils/lyrics-parsers/detect";
import { parseLrc } from "@/utils/lyrics-parsers/lrc";
import type { ParseResult, ParserFn } from "@/utils/lyrics-parsers/shared";
import { parseSrt } from "@/utils/lyrics-parsers/srt";
import { parseTtml } from "@/utils/lyrics-parsers/ttml";
import { parseTxt } from "@/utils/lyrics-parsers/txt";

// -- Registry -----------------------------------------------------------------

const PARSERS: Record<Exclude<LyricsFileType, "unknown">, ParserFn> = {
  txt: parseTxt,
  lrc: parseLrc,
  srt: parseSrt,
  ttml: parseTtml,
};

// -- Main Parser --------------------------------------------------------------

function parseLyricsFile(filename: string, content: string, fallbackDuration?: number): ParseResult {
  const fileType = detectFileType(filename, content);
  const parser = fileType === "unknown" ? parseTxt : PARSERS[fileType];
  return parser(content, fallbackDuration);
}

// -- Exports ------------------------------------------------------------------

export { parseLyricsFile, PARSERS };
export type { ParseResult };
