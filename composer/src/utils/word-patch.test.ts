import type { WordTiming } from "@/domain/word/timing";
import { applyWordPatch } from "@/utils/word-patch";
import { describe, expect, it } from "vitest";

// -- Raw-pattern bug demonstration --------------------------------------------

describe("raw spread-and-assign pattern (unsafe, motivates the helper)", () => {
  it("produces a textless entry and a sparse hole when wordIndex is out of bounds", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const wordIndex = 3;
    const result = [...words];
    result[wordIndex] = { ...result[wordIndex], begin: 5, end: 6 };

    expect(result).toHaveLength(4);
    expect(result[wordIndex]).toEqual({ begin: 5, end: 6 });
    expect("text" in (result[wordIndex] as object)).toBe(false);
    expect(Object.hasOwn(result, 1)).toBe(false);
    expect(Object.hasOwn(result, 2)).toBe(false);
  });
});

// -- applyWordPatch -----------------------------------------------------------

describe("applyWordPatch", () => {
  it("patches a word in range", () => {
    const words: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 1, end: 2 },
    ];
    const result = applyWordPatch(words, 1, { begin: 1.5, end: 2.5 });
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 1.5, end: 2.5 },
    ]);
  });

  it("patches the adjacent word too when provided", () => {
    const words: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 1, end: 2 },
    ];
    const result = applyWordPatch(words, 0, { end: 1.5 }, { index: 1, updates: { begin: 1.5 } });
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 1.5 },
      { text: "two", begin: 1.5, end: 2 },
    ]);
  });

  it("returns the same reference shape but a new array (input unchanged)", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = applyWordPatch(words, 0, { begin: 0.5 });
    expect(result).not.toBe(words);
    expect(words[0]).toEqual({ text: "one ", begin: 0, end: 1 });
  });

  it("returns null when wordIndex is out of bounds (stale index after undo)", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    expect(applyWordPatch(words, 3, { begin: 5, end: 6 })).toBeNull();
  });

  it("returns null when wordIndex equals the array length", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    expect(applyWordPatch(words, 1, { begin: 5, end: 6 })).toBeNull();
  });

  it("returns null when wordIndex is negative", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    expect(applyWordPatch(words, -1, { begin: 5, end: 6 })).toBeNull();
  });

  it("returns null when the adjacent index is out of bounds", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    expect(applyWordPatch(words, 0, { begin: 0.5 }, { index: 5, updates: { begin: 1 } })).toBeNull();
  });

  it("returns null when the adjacent index is negative", () => {
    const words: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 1, end: 2 },
    ];
    expect(applyWordPatch(words, 0, { end: 1.5 }, { index: -1, updates: { begin: 1.5 } })).toBeNull();
  });

  it("returns null when given an empty array", () => {
    expect(applyWordPatch([], 0, { begin: 0, end: 1 })).toBeNull();
  });

  it("preserves text on the patched entry", () => {
    const words: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = applyWordPatch(words, 0, { begin: 5, end: 6 });
    expect(result?.[0].text).toBe("one ");
  });
});
