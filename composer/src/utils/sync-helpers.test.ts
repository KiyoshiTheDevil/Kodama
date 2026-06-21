import type { WordTiming } from "@/domain/word/timing";
import { commitHeldWord, commitTappedWord } from "@/utils/sync-helpers";
import { describe, expect, it } from "vitest";

// -- commitTappedWord ---------------------------------------------------------

describe("commitTappedWord", () => {
  it("returns a single new word when there are no existing words", () => {
    const result = commitTappedWord([], 0, "hello", 5, 6);
    expect(result).toEqual([{ text: "hello", begin: 5, end: 6 }]);
  });

  it("returns a single new word when there are no existing words and wordIndex is non-zero", () => {
    const result = commitTappedWord([], 2, "hello", 5, 6);
    expect(result).toEqual([{ text: "hello", begin: 5, end: 6 }]);
  });

  it("replaces the first word when wordIndex is 0", () => {
    const existing: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 1, end: 2 },
    ];
    const result = commitTappedWord(existing, 0, "ONE", 5, 6);
    expect(result).toEqual([{ text: "ONE", begin: 5, end: 6 }]);
  });

  it("re-syncs from the middle: truncates and closes the prior word at begin", () => {
    const existing: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two ", begin: 1, end: 2 },
      { text: "three", begin: 2, end: 3 },
    ];
    const result = commitTappedWord(existing, 1, "TWO", 5, 6);
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 5 },
      { text: "TWO", begin: 5, end: 6 },
    ]);
  });

  it("forward tap at the end: closes the prior word and appends", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitTappedWord(existing, 1, "two", 5, 6);
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 5 },
      { text: "two", begin: 5, end: 6 },
    ]);
  });

  it("drifted cursor (wordIndex past existing length) clamps to length and appends without holes", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitTappedWord(existing, 4, "two", 5, 6);
    expect(result).toHaveLength(2);
    for (const w of result) {
      expect(typeof w.text).toBe("string");
      expect(typeof w.begin).toBe("number");
      expect(typeof w.end).toBe("number");
    }
    expect(result[0]).toEqual({ text: "one ", begin: 0, end: 5 });
    expect(result[1]).toEqual({ text: "two", begin: 5, end: 6 });
  });

  it("drifted cursor result has no sparse holes", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitTappedWord(existing, 5, "next", 10, 11);
    expect(Object.keys(result).length).toBe(result.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeDefined();
    }
  });
});

// -- commitHeldWord -----------------------------------------------------------

describe("commitHeldWord", () => {
  it("returns a single new word when there are no existing words", () => {
    const result = commitHeldWord([], 0, "hello", 5);
    expect(result).toEqual([{ text: "hello", begin: 5, end: 5 }]);
  });

  it("replaces the first word's text and begin but preserves its end when wordIndex is 0", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitHeldWord(existing, 0, "ONE", 5);
    expect(result).toEqual([{ text: "ONE", begin: 5, end: 1 }]);
  });

  it("truncates to wordIndex and appends a held word", () => {
    const existing: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two ", begin: 1, end: 2 },
      { text: "three", begin: 2, end: 3 },
    ];
    const result = commitHeldWord(existing, 1, "TWO", 5);
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 1 },
      { text: "TWO", begin: 5, end: 5 },
    ]);
  });

  it("forward hold at the end: appends a held word without closing prior word's end", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitHeldWord(existing, 1, "two", 5);
    expect(result).toEqual([
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 5, end: 5 },
    ]);
  });

  it("drifted cursor (wordIndex past existing length) clamps and appends without holes", () => {
    const existing: WordTiming[] = [{ text: "one ", begin: 0, end: 1 }];
    const result = commitHeldWord(existing, 4, "two", 5);
    expect(result).toHaveLength(2);
    for (const w of result) {
      expect(typeof w.text).toBe("string");
    }
    expect(result[0]).toEqual({ text: "one ", begin: 0, end: 1 });
    expect(result[1]).toEqual({ text: "two", begin: 5, end: 5 });
  });
});
