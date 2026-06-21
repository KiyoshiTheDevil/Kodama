import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { propagateWordChanges } from "@/domain/group/smart-sync";

// -- propagateWordChanges -----------------------------------------------------

describe("propagateWordChanges", () => {
  it("returns undefined when sourceAfter is missing", () => {
    expect(propagateWordChanges(undefined, [], [])).toBeUndefined();
  });

  it("returns undefined when siblingWords is missing", () => {
    expect(propagateWordChanges([], [], undefined)).toBeUndefined();
  });

  it("fast path: renames sibling word text on an unchanged count, keeping timing exact", () => {
    const before: WordTiming[] = [
      { text: "I", begin: 0, end: 1 },
      { text: "go", begin: 1, end: 2 },
    ];
    const after: WordTiming[] = [
      { text: "I", begin: 0, end: 1 },
      { text: "run", begin: 1, end: 2 },
    ];
    const sibling: WordTiming[] = [
      { text: "I", begin: 10, end: 11 },
      { text: "go", begin: 11, end: 12 },
    ];
    expect(propagateWordChanges(after, before, sibling)).toEqual([
      { text: "I", begin: 10, end: 11 },
      { text: "run", begin: 11, end: 12 },
    ]);
  });

  it("fast path: returns undefined when no sibling text actually changed", () => {
    const words: WordTiming[] = [{ text: "I", begin: 0, end: 1 }];
    expect(propagateWordChanges(words, words, [{ text: "I", begin: 9, end: 9.5 }])).toBeUndefined();
  });

  it("fast path: returns undefined when sibling count diverged from the source", () => {
    const before: WordTiming[] = [{ text: "I", begin: 0, end: 1 }];
    const after: WordTiming[] = [{ text: "X", begin: 0, end: 1 }];
    const sibling: WordTiming[] = [
      { text: "I", begin: 9, end: 10 },
      { text: "extra", begin: 10, end: 11 },
    ];
    expect(propagateWordChanges(after, before, sibling)).toBeUndefined();
  });

  it("structural change: delegates to the smart-sync diff, preserving unchanged sibling timing", () => {
    const before: WordTiming[] = [
      { text: "I ", begin: 0, end: 0.3 },
      { text: "love ", begin: 0.3, end: 0.6 },
      { text: "you", begin: 0.6, end: 1 },
    ];
    const after: WordTiming[] = [
      { text: "I ", begin: 0, end: 0.3 },
      { text: "lo", begin: 0.3, end: 0.45 },
      { text: "ve ", begin: 0.45, end: 0.6 },
      { text: "you", begin: 0.6, end: 1 },
    ];
    const sibling: WordTiming[] = [
      { text: "I ", begin: 30, end: 30.4 },
      { text: "love ", begin: 30.4, end: 30.7 },
      { text: "you", begin: 30.7, end: 31.2 },
    ];

    const result = propagateWordChanges(after, before, sibling);
    expect(result).toHaveLength(4);
    expect(result?.[0]).toEqual({ text: "I ", begin: 30, end: 30.4 });
    expect(result?.[3]).toEqual({ text: "you", begin: 30.7, end: 31.2 });
  });
});
