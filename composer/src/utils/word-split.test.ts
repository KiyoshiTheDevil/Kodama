import { describe, expect, it } from "vitest";
import { computeSyllableGroups, getSyllablePositions } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { splitWordIntoWords } from "@/utils/word-split";

describe("splitWordIntoWords", () => {
  const source: WordTiming = { text: "everyday", begin: 1, end: 2 };

  it("splits into independent words with a trailing space on the non-final word", () => {
    const out = splitWordIntoWords(source, [5]);
    expect(out.map((w) => w.text)).toEqual(["every ", "day"]);
    expect(out[0].syllableGroupId).toBeUndefined();
    expect(out[1].syllableGroupId).toBeUndefined();
  });

  it("preserves the source trailing space on the final word", () => {
    const out = splitWordIntoWords({ ...source, text: "everyday " }, [5]);
    expect(out.map((w) => w.text)).toEqual(["every ", "day "]);
  });

  it("distributes timing across the source span", () => {
    const out = splitWordIntoWords(source, [5]);
    expect(out[0].begin).toBe(1);
    expect(out[out.length - 1].end).toBe(2);
  });

  it("output is NOT a syllable group when the line has no syllableGroupId", () => {
    const out = splitWordIntoWords(source, [5]);
    expect(getSyllablePositions(out)).toEqual(["none", "none"]);
    expect(computeSyllableGroups(out)).toEqual([]);
  });

  it("output is NOT a syllable group when the line also has a syllableGroupId word", () => {
    const out = splitWordIntoWords(source, [5]);
    const line = [...out, { text: "x", begin: 2, end: 3, syllableGroupId: "g1" }];
    expect(getSyllablePositions(line).slice(0, 2)).toEqual(["none", "none"]);
  });
});
