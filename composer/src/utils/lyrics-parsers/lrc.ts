import { hasAnyTiming } from "@/domain/line/predicates";
import { reconcileLine, type LooseLine } from "@/domain/line/model";
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import type { ProjectMetadata } from "@/domain/project/metadata";
import type { WordTiming } from "@/domain/word/timing";
import { getSplitCharacter } from "@/utils/split-character";
import { generateLineId, type ParseResult } from "@/utils/lyrics-parsers/shared";

// -- Constants ----------------------------------------------------------------

const LINE_TIMESTAMP_REGEX = /\[(\d{1,2}:\d{2}(?:[.:]\d{2,3})?)\]/g;
const INLINE_WORD_TAG_REGEX = /<(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?>/g;
const PENDING_WORD_END = -1;

// -- Helpers ------------------------------------------------------------------

function lrcTimeToSeconds(minutes: string, seconds: string, ms?: string): number {
  const m = Number.parseInt(minutes, 10);
  const s = Number.parseInt(seconds, 10);
  const milli = ms ? Number.parseInt(ms.padEnd(3, "0"), 10) : 0;
  return m * 60 + s + milli / 1000;
}

function parseLrcTimestamp(timestamp: string): number {
  const match = timestamp.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?\]/);
  if (!match) return 0;
  return lrcTimeToSeconds(match[1], match[2], match[3]);
}

interface InlineWordParseResult {
  cleanText: string;
  words: WordTiming[];
}

function parseInlineWordTags(text: string, lineBegin: number): InlineWordParseResult | null {
  const markers: { timestamp: number; matchStart: number; matchEnd: number }[] = [];
  const regex = new RegExp(INLINE_WORD_TAG_REGEX.source, "g");
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    markers.push({
      timestamp: lrcTimeToSeconds(match[1], match[2], match[3]),
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
    });
    match = regex.exec(text);
  }

  if (markers.length === 0) return null;

  const words: WordTiming[] = [];

  const leadingText = text.substring(0, markers[0].matchStart);
  if (leadingText.trim().length > 0) {
    words.push({ text: leadingText, begin: lineBegin, end: markers[0].timestamp });
  }

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const nextMarker = markers[i + 1];
    const segmentStart = marker.matchEnd;
    const segmentEnd = nextMarker ? nextMarker.matchStart : text.length;
    const wordText = text.substring(segmentStart, segmentEnd);
    if (wordText.length === 0) continue;
    words.push({
      text: wordText,
      begin: marker.timestamp,
      end: nextMarker ? nextMarker.timestamp : PENDING_WORD_END,
    });
  }

  if (words.length === 0) return null;

  return { cleanText: reconstructLineText(words, getSplitCharacter()), words };
}

// -- LRC Parser ---------------------------------------------------------------

function parseLrc(content: string, fallbackDuration?: number): ParseResult {
  const metadata: Partial<ProjectMetadata> = {};
  const lines: LooseLine[] = [];

  const rawLines = content.split(/\r?\n/);

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const metaMatch = trimmed.match(/^\[([a-z]+):(.+)\]$/i);
    if (metaMatch) {
      const [, tag, value] = metaMatch;
      const tagLower = tag.toLowerCase();
      if (tagLower === "ti" || tagLower === "title") {
        metadata.title = value.trim();
      } else if (tagLower === "ar" || tagLower === "artist") {
        metadata.artist = value.trim();
      } else if (tagLower === "al" || tagLower === "album") {
        metadata.album = value.trim();
      } else if (tagLower === "length") {
        const lengthMatch = value.trim().match(/^(\d{1,2}):(\d{2})(?:[.:](\d{2,3}))?$/);
        if (lengthMatch) {
          metadata.duration = lrcTimeToSeconds(lengthMatch[1], lengthMatch[2], lengthMatch[3]);
        }
      }
      continue;
    }

    const timestamps: number[] = [];
    const matches = trimmed.matchAll(LINE_TIMESTAMP_REGEX);
    for (const timestampMatch of matches) {
      timestamps.push(parseLrcTimestamp(`[${timestampMatch[1]}]`));
    }

    if (timestamps.length === 0) continue;

    const textWithoutLineTags = trimmed.replace(LINE_TIMESTAMP_REGEX, "");

    if (timestamps.length === 1) {
      const parsed = parseInlineWordTags(textWithoutLineTags, timestamps[0]);
      if (parsed) {
        lines.push({
          id: generateLineId(),
          text: parsed.cleanText,
          agentId: "v1",
          begin: timestamps[0],
          words: parsed.words,
        });
        continue;
      }
    }

    const cleanText = textWithoutLineTags.replace(INLINE_WORD_TAG_REGEX, "").trim();
    if (!cleanText) continue;
    for (const begin of timestamps) {
      lines.push({ id: generateLineId(), text: cleanText, agentId: "v1", begin });
    }
  }

  lines.sort((a, b) => (a.begin ?? 0) - (b.begin ?? 0));
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].begin !== undefined) {
      lines[i].end = lines[i + 1].begin;
    }
  }

  // The last line has no following line to source its end from. Prefer an
  // explicit [length:] tag, then the caller-supplied audio duration; if neither
  // is available it stays begin-only and reconcileLine renders it untimed.
  const lastLine = lines[lines.length - 1];
  const songEnd = metadata.duration ?? fallbackDuration;
  if (
    lastLine &&
    !lastLine.words &&
    lastLine.begin !== undefined &&
    lastLine.end === undefined &&
    songEnd !== undefined &&
    songEnd > lastLine.begin
  ) {
    lastLine.end = songEnd;
  }

  for (const line of lines) {
    if (!line.words || line.words.length === 0) continue;
    const lastWord = line.words[line.words.length - 1];
    if (lastWord.end === PENDING_WORD_END) {
      lastWord.end = line.end ?? lastWord.begin;
    }
  }

  const reconciledLines = lines.map(reconcileLine);
  return {
    lines: reconciledLines,
    metadata,
    hasTimingData: reconciledLines.some(hasAnyTiming),
  };
}

// -- Exports ------------------------------------------------------------------

export { parseLrc };
