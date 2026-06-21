/**
 * @vitest-environment node
 */
import {
  absorbDeletedSyllablesIntoNeighbors,
  closeIntraGroupGaps,
  computeSyllableGroups,
  expandSelectionToGroupmates,
  getSyllablePositions,
  hasIntraGroupGap,
  inferSyllableGroupIds,
} from "@/domain/word/syllable-groups";
import { describe, expect, it } from "vitest";

// -- id-mode -------------------------------------------------------------------

describe("getSyllablePositions · id-mode", () => {
  it("groups a contiguous run of words sharing a syllableGroupId", () => {
    const positions = getSyllablePositions([
      { text: "hello ", begin: 0, end: 1 },
      { text: "ev", begin: 1, end: 1.2, syllableGroupId: "g1" },
      { text: "er", begin: 1.2, end: 1.5, syllableGroupId: "g1" },
      { text: "y", begin: 1.5, end: 1.8, syllableGroupId: "g1" },
      { text: "world", begin: 1.8, end: 2.5 },
    ]);
    expect(positions).toEqual(["none", "first", "middle", "last", "none"]);
  });

  it("ignores trailing-space pattern when any word in the array has an id", () => {
    const positions = getSyllablePositions([
      { text: "ev ", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er ", begin: 0.2, end: 0.4, syllableGroupId: "g1" },
      { text: "y", begin: 0.4, end: 0.6, syllableGroupId: "g1" },
    ]);
    expect(positions).toEqual(["first", "middle", "last"]);
  });

  it("does not group a single-word id run", () => {
    const positions = getSyllablePositions([
      { text: "hello", begin: 0, end: 1, syllableGroupId: "g1" },
      { text: "world", begin: 1, end: 2 },
    ]);
    expect(positions).toEqual(["none", "none"]);
  });

  it("breaks contiguity when adjacent ids differ", () => {
    const positions = getSyllablePositions([
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.2, end: 0.4, syllableGroupId: "g2" },
    ]);
    expect(positions).toEqual(["none", "none"]);
  });

  it("supports multiple distinct groups in the same array", () => {
    const positions = getSyllablePositions([
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.2, end: 0.5, syllableGroupId: "g1" },
      { text: "world", begin: 0.5, end: 1 },
      { text: "wi", begin: 1, end: 1.2, syllableGroupId: "g2" },
      { text: "de", begin: 1.2, end: 1.5, syllableGroupId: "g2" },
    ]);
    expect(positions).toEqual(["first", "last", "none", "first", "last"]);
  });

  it("treats a standalone id-d word among id-d siblings as 'none'", () => {
    const positions = getSyllablePositions([
      { text: "lone", begin: 0, end: 1, syllableGroupId: "g0" },
      { text: "wo", begin: 1, end: 1.5, syllableGroupId: "g1" },
      { text: "rd", begin: 1.5, end: 2, syllableGroupId: "g1" },
    ]);
    expect(positions).toEqual(["none", "first", "last"]);
  });
});

// -- trailing-space fallback ---------------------------------------------------

describe("getSyllablePositions · trailing-space fallback", () => {
  it("falls back to trailing-space heuristic when no word has an id", () => {
    const positions = getSyllablePositions([
      { text: "ev", begin: 0, end: 0.2 },
      { text: "er", begin: 0.2, end: 0.4 },
      { text: "y ", begin: 0.4, end: 0.6 },
      { text: "world", begin: 0.6, end: 1 },
    ]);
    expect(positions).toEqual(["first", "middle", "last", "none"]);
  });

  it("returns all 'none' for a single standalone word with no ids", () => {
    const positions = getSyllablePositions([{ text: "hello", begin: 0, end: 1 }]);
    expect(positions).toEqual(["none"]);
  });

  it("returns empty array for empty input", () => {
    expect(getSyllablePositions([])).toEqual([]);
  });
});

// -- computeSyllableGroups (lower-level invariants) ----------------------------

describe("absorbDeletedSyllablesIntoNeighbors", () => {
  it("extends the left neighbor's end when a middle syllable is deleted", () => {
    const result = absorbDeletedSyllablesIntoNeighbors(
      [
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "y", begin: 0.6, end: 1, syllableGroupId: "g1" },
      ],
      [1],
    );
    expect(result[0].end).toBe(0.6);
    expect(result[2].begin).toBe(0.6);
  });

  it("extends the right neighbor's begin when the first syllable is deleted", () => {
    const result = absorbDeletedSyllablesIntoNeighbors(
      [
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "y", begin: 0.6, end: 1, syllableGroupId: "g1" },
      ],
      [0],
    );
    expect(result[1].begin).toBe(0);
    expect(result[1].end).toBe(0.6);
  });

  it("extends the left neighbor's end when the last syllable is deleted", () => {
    const result = absorbDeletedSyllablesIntoNeighbors(
      [
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "y", begin: 0.6, end: 1, syllableGroupId: "g1" },
      ],
      [2],
    );
    expect(result[1].end).toBe(1);
  });

  it("absorbs a run of consecutive deletes from the front into the right neighbor", () => {
    const result = absorbDeletedSyllablesIntoNeighbors(
      [
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "y", begin: 0.6, end: 1, syllableGroupId: "g1" },
      ],
      [0, 1],
    );
    expect(result[2].begin).toBe(0);
    expect(result[2].end).toBe(1);
  });

  it("absorbs a run of consecutive deletes from the back into the left neighbor", () => {
    const result = absorbDeletedSyllablesIntoNeighbors(
      [
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "y", begin: 0.6, end: 1, syllableGroupId: "g1" },
      ],
      [1, 2],
    );
    expect(result[0].end).toBe(1);
  });

  it("does not touch words outside the deleted syllable's group", () => {
    const input = [
      { text: "hello ", begin: 0, end: 1 },
      { text: "ev", begin: 1, end: 1.3, syllableGroupId: "g1" },
      { text: "er", begin: 1.3, end: 1.6, syllableGroupId: "g1" },
      { text: "y", begin: 1.6, end: 2, syllableGroupId: "g1" },
      { text: "world", begin: 2, end: 3 },
    ];
    const result = absorbDeletedSyllablesIntoNeighbors(input, [2]);
    expect(result[0]).toBe(input[0]);
    expect(result[4]).toBe(input[4]);
    expect(result[1].end).toBe(1.6);
  });

  it("is a no-op for a deleted standalone (non-group) word", () => {
    const input = [
      { text: "hello", begin: 0, end: 1 },
      { text: "world", begin: 1, end: 2 },
    ];
    const result = absorbDeletedSyllablesIntoNeighbors(input, [0]);
    expect(result).toBe(input);
  });

  it("returns the input array when nothing is deleted", () => {
    const input = [{ text: "ev", begin: 0, end: 1, syllableGroupId: "g1" }];
    expect(absorbDeletedSyllablesIntoNeighbors(input, [])).toBe(input);
  });
});

describe("expandSelectionToGroupmates", () => {
  const words = [
    { text: "hello ", begin: 0, end: 1 },
    { text: "ev", begin: 1, end: 1.2, syllableGroupId: "g1" },
    { text: "er", begin: 1.2, end: 1.5, syllableGroupId: "g1" },
    { text: "y", begin: 1.5, end: 1.8, syllableGroupId: "g1" },
    { text: "world", begin: 1.8, end: 2.5 },
    { text: "wi", begin: 2.5, end: 2.7, syllableGroupId: "g2" },
    { text: "de", begin: 2.7, end: 3, syllableGroupId: "g2" },
  ];

  it("returns the input set unchanged when no selected word is part of a group", () => {
    expect(expandSelectionToGroupmates(words, [0])).toEqual([0]);
    expect(expandSelectionToGroupmates(words, [0, 4])).toEqual([0, 4]);
  });

  it("expands a partial selection to include all groupmates of any selected syllable", () => {
    expect(expandSelectionToGroupmates(words, [2])).toEqual([1, 2, 3]);
    expect(expandSelectionToGroupmates(words, [1, 2])).toEqual([1, 2, 3]);
    expect(expandSelectionToGroupmates(words, [3])).toEqual([1, 2, 3]);
  });

  it("preserves the indices of selected standalone words alongside expanded groupmates", () => {
    expect(expandSelectionToGroupmates(words, [0, 2])).toEqual([0, 1, 2, 3]);
    expect(expandSelectionToGroupmates(words, [4, 6])).toEqual([4, 5, 6]);
  });

  it("handles selection that touches multiple separate groups", () => {
    expect(expandSelectionToGroupmates(words, [2, 5])).toEqual([1, 2, 3, 5, 6]);
  });

  it("returns sorted unique indices", () => {
    expect(expandSelectionToGroupmates(words, [3, 2, 1])).toEqual([1, 2, 3]);
    expect(expandSelectionToGroupmates(words, [2, 2])).toEqual([1, 2, 3]);
  });

  it("returns an empty array for empty input", () => {
    expect(expandSelectionToGroupmates(words, [])).toEqual([]);
  });

  it("ignores out-of-bounds indices", () => {
    expect(expandSelectionToGroupmates(words, [99])).toEqual([]);
    expect(expandSelectionToGroupmates(words, [2, 99])).toEqual([1, 2, 3]);
  });

  it("does not expand a single-word group (since no group is emitted)", () => {
    const single = [
      { text: "hi", begin: 0, end: 1, syllableGroupId: "g1" },
      { text: "world", begin: 1, end: 2 },
    ];
    expect(expandSelectionToGroupmates(single, [0])).toEqual([0]);
  });
});

describe("inferSyllableGroupIds", () => {
  it("stamps a fresh shared id on each multi-word run inferred from trailing-space pattern", () => {
    const result = inferSyllableGroupIds([
      { text: "ev", begin: 0, end: 0.2 },
      { text: "er", begin: 0.2, end: 0.4 },
      { text: "y ", begin: 0.4, end: 0.6 },
      { text: "world", begin: 0.6, end: 1 },
    ]);
    expect(result[0].syllableGroupId).toBeDefined();
    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
    expect(result[1].syllableGroupId).toBe(result[2].syllableGroupId);
    expect(result[3].syllableGroupId).toBeUndefined();
  });

  it("emits independent ids for two separate runs in the same array", () => {
    const result = inferSyllableGroupIds([
      { text: "ev", begin: 0, end: 0.2 },
      { text: "er ", begin: 0.2, end: 0.4 },
      { text: "wi", begin: 0.4, end: 0.6 },
      { text: "de", begin: 0.6, end: 0.8 },
    ]);
    expect(result[0].syllableGroupId).toBeDefined();
    expect(result[2].syllableGroupId).toBeDefined();
    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
    expect(result[2].syllableGroupId).toBe(result[3].syllableGroupId);
    expect(result[0].syllableGroupId).not.toBe(result[2].syllableGroupId);
  });

  it("is a no-op when every word is already standalone", () => {
    const input = [
      { text: "hello ", begin: 0, end: 1 },
      { text: "world", begin: 1, end: 2 },
    ];
    const result = inferSyllableGroupIds(input);
    expect(result).toBe(input);
  });

  it("is a no-op when any word already has an id", () => {
    const input = [
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.2, end: 0.4, syllableGroupId: "g1" },
      { text: "y", begin: 0.4, end: 0.6, syllableGroupId: "g1" },
    ];
    const result = inferSyllableGroupIds(input);
    expect(result).toBe(input);
  });

  it("returns an empty array as-is", () => {
    expect(inferSyllableGroupIds([])).toEqual([]);
  });
});

describe("computeSyllableGroups · id-mode", () => {
  it("emits one group per contiguous same-id run", () => {
    const groups = computeSyllableGroups([
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.2, end: 0.5, syllableGroupId: "g1" },
      { text: "world", begin: 0.5, end: 1 },
      { text: "wi", begin: 1, end: 1.2, syllableGroupId: "g2" },
      { text: "de", begin: 1.2, end: 1.5, syllableGroupId: "g2" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ startIndex: 0, endIndex: 1 });
    expect(groups[1]).toMatchObject({ startIndex: 3, endIndex: 4 });
  });

  it("joins originalWord ignoring trailing spaces", () => {
    const groups = computeSyllableGroups([
      { text: "ev ", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er ", begin: 0.2, end: 0.4, syllableGroupId: "g1" },
      { text: "y", begin: 0.4, end: 0.6, syllableGroupId: "g1" },
    ]);
    expect(groups[0].originalWord).toBe("every");
  });
});

// -- closeIntraGroupGaps -------------------------------------------------------

describe("closeIntraGroupGaps", () => {
  it("extends earlier word to close a gap inside a syllable group", () => {
    const result = closeIntraGroupGaps([
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g1" },
      { text: "y", begin: 0.5, end: 0.7, syllableGroupId: "g1" },
    ]);
    expect(result[0].end).toBe(0.3);
    expect(result[1].begin).toBe(0.3);
    expect(result[1].end).toBe(0.5);
    expect(result[2].begin).toBe(0.5);
  });

  it("returns input by reference when there are no gaps", () => {
    const input = [
      { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
      { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
    ];
    expect(closeIntraGroupGaps(input)).toBe(input);
  });

  it("only closes gaps between same-group neighbors", () => {
    const result = closeIntraGroupGaps([
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g1" },
      { text: "world", begin: 0.6, end: 0.8 },
    ]);
    expect(result[0].end).toBe(0.3);
    expect(result[1].end).toBe(0.5);
    expect(result[2].begin).toBe(0.6);
  });

  it("is a no-op when adjacent words have different groupIds", () => {
    const input = [
      { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
      { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g2" },
    ];
    expect(closeIntraGroupGaps(input)).toBe(input);
  });

  it("returns input by reference for a single word", () => {
    const input = [{ text: "solo", begin: 0, end: 1, syllableGroupId: "g1" }];
    expect(closeIntraGroupGaps(input)).toBe(input);
  });

  it("returns input by reference for empty array", () => {
    const input: never[] = [];
    expect(closeIntraGroupGaps(input)).toBe(input);
  });
});

// -- hasIntraGroupGap ----------------------------------------------------------

describe("hasIntraGroupGap", () => {
  it("returns true when a same-group pair has a gap", () => {
    expect(
      hasIntraGroupGap([
        { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g1" },
      ]),
    ).toBe(true);
  });

  it("returns false when same-group neighbors are flush", () => {
    expect(
      hasIntraGroupGap([
        { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
      ]),
    ).toBe(false);
  });

  it("ignores gaps between words in different groups", () => {
    expect(
      hasIntraGroupGap([
        { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
        { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g2" },
      ]),
    ).toBe(false);
  });

  it("ignores gaps between standalone (non-group) words", () => {
    expect(
      hasIntraGroupGap([
        { text: "hello", begin: 0, end: 0.2 },
        { text: "world", begin: 0.5, end: 1 },
      ]),
    ).toBe(false);
  });

  it("detects a gap in a later group when an earlier group is flush", () => {
    expect(
      hasIntraGroupGap([
        { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
        { text: "er", begin: 0.2, end: 0.4, syllableGroupId: "g1" },
        { text: "wi", begin: 0.4, end: 0.6, syllableGroupId: "g2" },
        { text: "de", begin: 0.8, end: 1, syllableGroupId: "g2" },
      ]),
    ).toBe(true);
  });

  it("returns false for a single word", () => {
    expect(hasIntraGroupGap([{ text: "solo", begin: 0, end: 1, syllableGroupId: "g1" }])).toBe(false);
  });

  it("returns false for an empty array", () => {
    expect(hasIntraGroupGap([])).toBe(false);
  });
});
