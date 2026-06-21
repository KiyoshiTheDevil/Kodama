import { cleanSplitCharacters, getSplitCharacter } from "@/utils/split-character";
import { generateLineId, type ParseResult } from "@/utils/lyrics-parsers/shared";

// -- Plain Text Parser --------------------------------------------------------

function parseTxt(content: string, _fallbackDuration?: number): ParseResult {
  const lines = content.split(/\r?\n/).flatMap((raw) => {
    const text = raw.trim();
    if (text.length === 0) return [];
    const displayText = text.includes(getSplitCharacter()) ? cleanSplitCharacters(text) : text;
    return [
      {
        id: generateLineId(),
        text: displayText,
        agentId: "v1",
      },
    ];
  });

  return {
    lines,
    metadata: {},
    hasTimingData: false,
  };
}

// -- Exports ------------------------------------------------------------------

export { parseTxt };
