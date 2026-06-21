import { describe, expect, it } from "vitest";
import { splitWordIntoSyllables } from "@/utils/single-word-syllable-split";

describe("splitWordIntoSyllables", () => {
  it("trims trailing space before computing per-character durations", () => {
    const result = splitWordIntoSyllables({
      word: { text: "running ", begin: 0, end: 8 },
      splitPoints: [3],
    });
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("run");
    expect(result[0].end).toBeCloseTo(3.428, 2);
    expect(result[1].text).toBe("ning ");
    expect(result[1].begin).toBeCloseTo(3.428, 2);
    expect(result[1].end).toBe(8);
  });

  it("generates a fresh syllableGroupId when reuseGroupId is false (default)", () => {
    const result = splitWordIntoSyllables({
      word: { text: "abc", begin: 0, end: 1, syllableGroupId: "existing-id" },
      splitPoints: [1],
    });
    expect(result[0].syllableGroupId).not.toBe("existing-id");
    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
  });

  it("reuses syllableGroupId when reuseGroupId is true and word has one", () => {
    const result = splitWordIntoSyllables({
      word: { text: "abc", begin: 0, end: 1, syllableGroupId: "existing-id" },
      splitPoints: [1],
      reuseGroupId: true,
    });
    expect(result[0].syllableGroupId).toBe("existing-id");
    expect(result[1].syllableGroupId).toBe("existing-id");
  });

  it("generates a fresh syllableGroupId when reuseGroupId is true but word has none", () => {
    const result = splitWordIntoSyllables({
      word: { text: "abc", begin: 0, end: 1 },
      splitPoints: [1],
      reuseGroupId: true,
    });
    expect(result[0].syllableGroupId).toBeTruthy();
    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
  });

  it("does not append a trailing space when the source had none", () => {
    const result = splitWordIntoSyllables({
      word: { text: "abc", begin: 0, end: 1 },
      splitPoints: [1],
    });
    expect(result[1].text).toBe("bc");
  });
});
