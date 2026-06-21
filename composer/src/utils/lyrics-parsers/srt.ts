import type { LyricLine } from "@/domain/line/model";
import { generateLineId, type ParseResult } from "@/utils/lyrics-parsers/shared";

// -- Helpers ------------------------------------------------------------------

function parseSrtTimestamp(timestamp: string): number {
  // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const ms = Number.parseInt(match[4], 10);
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

// -- SRT Parser ---------------------------------------------------------------

function parseSrt(content: string, _fallbackDuration?: number): ParseResult {
  const lines: LyricLine[] = [];
  const blocks = content.split(/\r?\n\r?\n/);

  for (const block of blocks) {
    const blockLines = block.trim().split(/\r?\n/);
    if (blockLines.length < 2) continue;

    let timestampIdx = -1;
    for (let i = 0; i < blockLines.length; i++) {
      if (blockLines[i].includes("-->")) {
        timestampIdx = i;
        break;
      }
    }
    if (timestampIdx === -1) continue;
    const timestampLine = blockLines[timestampIdx];

    const [startStr, endStr] = timestampLine.split("-->");
    const begin = parseSrtTimestamp(startStr.trim());
    const end = parseSrtTimestamp(endStr.trim());

    const textLines = blockLines.slice(timestampIdx + 1);
    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (text) {
      lines.push({
        id: generateLineId(),
        text,
        agentId: "v1",
        begin,
        end,
      });
    }
  }

  return {
    lines,
    metadata: {},
    hasTimingData: lines.some((l) => l.begin !== undefined),
  };
}

// -- Exports ------------------------------------------------------------------

export { parseSrt };
