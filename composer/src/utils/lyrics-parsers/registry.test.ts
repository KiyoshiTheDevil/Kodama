import { describe, expect, it } from "vitest";
import { PARSERS } from "@/utils/lyrics-parsers";
import type { LyricsFileType } from "@/utils/lyrics-parsers/detect";

describe("parser registry", () => {
  it("has an entry for every concrete LyricsFileType", () => {
    const concrete: Exclude<LyricsFileType, "unknown">[] = ["txt", "lrc", "srt", "ttml"];
    for (const t of concrete) expect(typeof PARSERS[t]).toBe("function");
  });

  it("has exactly the concrete keys and no stray entries", () => {
    expect(Object.keys(PARSERS).sort()).toEqual(["lrc", "srt", "ttml", "txt"]);
  });
});
