import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { firstBegin, lastEnd } from "@/domain/word/bounds";

// -- firstBegin ---------------------------------------------------------------

describe("firstBegin", () => {
  it("returns begin of first word", () => {
    const words: WordTiming[] = [
      { text: "hi", begin: 3, end: 4 },
      { text: "yo", begin: 5, end: 6 },
    ];
    expect(firstBegin(words)).toBe(3);
  });

  it("works for a single-word array", () => {
    expect(firstBegin([{ text: "hi", begin: 7, end: 8 }])).toBe(7);
  });
});

// -- lastEnd ------------------------------------------------------------------

describe("lastEnd", () => {
  it("returns end of last word", () => {
    const words: WordTiming[] = [
      { text: "hi", begin: 3, end: 4 },
      { text: "yo", begin: 5, end: 6 },
    ];
    expect(lastEnd(words)).toBe(6);
  });

  it("works for a single-word array", () => {
    expect(lastEnd([{ text: "hi", begin: 7, end: 8 }])).toBe(8);
  });
});
