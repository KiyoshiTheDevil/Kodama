/**
 * @vitest-environment node
 */
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import { computeSyllableGroups } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { reorderWordTrack } from "./reorder-track";

describe("reorderWordTrack", () => {
  it("keeps three separate words separate when the last word is dragged before the middle word", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two ", begin: 2, end: 3 },
      { text: "three", begin: 4, end: 5 },
    ];

    const result = reorderWordTrack(track, new Set([2]), -2.5, 10);

    expect(result).toHaveLength(3);
    expect(computeSyllableGroups(result)).toEqual([]);
    expect(reconstructLineText(result, "|")).not.toContain("|");
    const three = result.find((w) => w.text.trimEnd() === "three");
    expect(three?.text).toBe("three ");
    expect(result[result.length - 1].text.endsWith(" ")).toBe(false);
  });

  it("keeps words separate when the first word is dragged to the end", () => {
    const track: WordTiming[] = [
      { text: "alpha ", begin: 0, end: 1 },
      { text: "beta ", begin: 2, end: 3 },
      { text: "gamma", begin: 4, end: 5 },
    ];

    const result = reorderWordTrack(track, new Set([0]), 6, 12);

    expect(result).toHaveLength(3);
    expect(computeSyllableGroups(result)).toEqual([]);
    expect(reconstructLineText(result, "|")).not.toContain("|");
    expect(result.map((w) => w.text.trimEnd())).toEqual(["beta", "gamma", "alpha"]);
    expect(result[result.length - 1].text.endsWith(" ")).toBe(false);
  });

  it("keeps spacing correct when a middle word is nudged without changing order", () => {
    const track: WordTiming[] = [
      { text: "first ", begin: 0, end: 1 },
      { text: "second ", begin: 2, end: 3 },
      { text: "third", begin: 4, end: 5 },
    ];

    const result = reorderWordTrack(track, new Set([1]), 0.2, 10);

    expect(result.map((w) => w.text.trimEnd())).toEqual(["first", "second", "third"]);
    expect(computeSyllableGroups(result)).toEqual([]);
    expect(reconstructLineText(result, "|")).toBe("first second third");
  });

  it("reinserts boundaries for a multi-word dragged set with non-adjacent indices", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two ", begin: 2, end: 3 },
      { text: "three ", begin: 4, end: 5 },
      { text: "four", begin: 6, end: 7 },
    ];

    const result = reorderWordTrack(track, new Set([0, 2]), 4, 20);

    expect(result).toHaveLength(4);
    expect(computeSyllableGroups(result)).toEqual([]);
    expect(reconstructLineText(result, "|")).not.toContain("|");
    expect(result[result.length - 1].text.endsWith(" ")).toBe(false);
  });

  it("gives the original spaceless last word a trailing space when it lands mid-track", () => {
    const track: WordTiming[] = [
      { text: "head ", begin: 0, end: 1 },
      { text: "body ", begin: 5, end: 6 },
      { text: "tail", begin: 8, end: 9 },
    ];

    const result = reorderWordTrack(track, new Set([2]), -6, 12);

    expect(result).toHaveLength(3);
    expect(reconstructLineText(result, "|")).not.toContain("|");
    expect(result.map((w) => w.text.trimEnd())).toEqual(["head", "tail", "body"]);
    const tail = result.find((w) => w.text.trimEnd() === "tail");
    expect(tail?.text).toBe("tail ");
    expect(result[result.length - 1].text.trimEnd()).toBe("body");
    expect(result[result.length - 1].text.endsWith(" ")).toBe(false);
  });

  it("shifts the whole track uniformly when every index is dragged", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 1, end: 2 },
      { text: "two ", begin: 3, end: 4 },
      { text: "three", begin: 5, end: 6 },
    ];

    const result = reorderWordTrack(track, new Set([0, 1, 2]), 2, 20);

    expect(result.map((w) => w.text)).toEqual(["one ", "two ", "three"]);
    expect(result.map((w) => w.begin)).toEqual([3, 5, 7]);
    expect(result.map((w) => w.end)).toEqual([4, 6, 8]);
    expect(computeSyllableGroups(result)).toEqual([]);
  });

  it("preserves the internal syllable structure of a multi-syllable word dragged past another word", () => {
    const track: WordTiming[] = [
      { text: "sun", begin: 0, end: 0.5, syllableGroupId: "g1" },
      { text: "shine ", begin: 0.5, end: 1, syllableGroupId: "g1" },
      { text: "bright", begin: 2, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set([0, 1]), 4, 12);

    const sunIdx = result.findIndex((w) => w.text.trimEnd() === "sun");
    const shineIdx = result.findIndex((w) => w.text.trimEnd() === "shine");
    expect(result[sunIdx].text.endsWith(" ")).toBe(false);
    expect(result[sunIdx].syllableGroupId).toBe(result[shineIdx].syllableGroupId);
    expect(result[sunIdx].syllableGroupId).not.toBe("g1");
    expect(result[sunIdx].syllableGroupId).toBeDefined();
    const groups = computeSyllableGroups(result);
    expect(groups).toEqual([{ startIndex: sunIdx, endIndex: shineIdx, originalWord: "sunshine" }]);
  });

  it("pushes a later overlapping word forward so the result has no overlap", () => {
    const track: WordTiming[] = [
      { text: "early ", begin: 0, end: 1 },
      { text: "late", begin: 8, end: 9 },
    ];

    const result = reorderWordTrack(track, new Set([1]), -7.5, 20);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].begin).toBeGreaterThanOrEqual(result[i - 1].end);
    }
  });

  it("clamps a word's end to duration when the timeDelta would push it past the end", () => {
    const track: WordTiming[] = [
      { text: "stay ", begin: 0, end: 1 },
      { text: "move", begin: 2, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set([1]), 100, 10);

    const move = result.find((w) => w.text.trimEnd() === "move");
    expect(move?.end).toBeLessThanOrEqual(10);
  });

  it("clamps a word's begin to zero when a negative timeDelta would push it before zero", () => {
    const track: WordTiming[] = [
      { text: "early ", begin: 3, end: 4 },
      { text: "later", begin: 6, end: 7 },
    ];

    const result = reorderWordTrack(track, new Set([0]), -100, 10);

    for (const word of result) {
      expect(word.begin).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps begin non-negative when a single word is longer than the duration", () => {
    const track: WordTiming[] = [{ text: "long", begin: 0, end: 100 }];

    const result = reorderWordTrack(track, new Set([0]), 5, 30);

    expect(result).toHaveLength(1);
    expect(result[0].begin).toBeGreaterThanOrEqual(0);
  });

  it("preserves the explicit flag through the reorder", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1, explicit: true },
      { text: "two", begin: 2, end: 3, explicit: true },
    ];

    const result = reorderWordTrack(track, new Set([1]), -2, 10);

    expect(result.every((w) => w.explicit === true)).toBe(true);
  });
});

describe("reorderWordTrack edge cases and invariants", () => {
  it("returns an empty array for an empty track", () => {
    expect(reorderWordTrack([], new Set([0]), 1, 10)).toEqual([]);
  });

  it("returns a single word for a single-word track that is dragged", () => {
    const track: WordTiming[] = [{ text: "solo", begin: 1, end: 2 }];

    const result = reorderWordTrack(track, new Set([0]), 2, 20);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("solo");
  });

  it("does not mutate the input track or its word objects", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1, syllableGroupId: "g" },
      { text: "two ", begin: 2, end: 3, syllableGroupId: "g" },
      { text: "three", begin: 4, end: 5 },
    ];
    const trackBefore = track.map((w) => ({ ...w }));

    reorderWordTrack(track, new Set([2]), -3, 10);

    expect(track).toEqual(trackBefore);
  });

  it("returns the track unchanged in shape when no indices are dragged", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 2, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set(), 5, 10);

    expect(result.map((w) => w.text)).toEqual(["one ", "two"]);
    expect(result.map((w) => w.begin)).toEqual([0, 2]);
  });

  it("returns words sorted by begin after a reorder", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two ", begin: 2, end: 3 },
      { text: "three", begin: 4, end: 5 },
    ];

    const result = reorderWordTrack(track, new Set([0]), 5, 12);

    const begins = result.map((w) => w.begin);
    expect(begins).toEqual([...begins].toSorted((a, b) => a - b));
  });

  it("regenerates syllable group ids while keeping groupmates sharing one id", () => {
    const track: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.4, syllableGroupId: "shared" },
      { text: "tle ", begin: 0.4, end: 0.8, syllableGroupId: "shared" },
      { text: "next", begin: 2, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set([0, 1]), 4, 12);

    const tiIdx = result.findIndex((w) => w.text.trimEnd() === "ti");
    const tleIdx = result.findIndex((w) => w.text.trimEnd() === "tle");
    expect(result[tiIdx].syllableGroupId).toBe(result[tleIdx].syllableGroupId);
    expect(result[tiIdx].syllableGroupId).not.toBe("shared");
  });

  it("ignores dragged indices that fall outside the track", () => {
    const track: WordTiming[] = [
      { text: "one ", begin: 0, end: 1 },
      { text: "two", begin: 2, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set([5, 9]), 4, 10);

    expect(result.map((w) => w.text)).toEqual(["one ", "two"]);
    expect(result.map((w) => w.begin)).toEqual([0, 2]);
  });

  it("spaces every seam when a dragged block interleaves with the rest on a timing collision", () => {
    const track: WordTiming[] = [
      { text: "hel ", begin: 0, end: 0.5 },
      { text: "lo ", begin: 0.5, end: 1 },
      { text: "sun ", begin: 2, end: 2.5 },
      { text: "shine", begin: 2.5, end: 3 },
    ];

    const result = reorderWordTrack(track, new Set([2, 3]), -2, 12);

    expect(result).toHaveLength(4);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].text.endsWith(" ")).toBe(true);
    }
    expect(result[result.length - 1].text.endsWith(" ")).toBe(false);
    expect(computeSyllableGroups(result)).toEqual([]);
    expect(reconstructLineText(result, "|")).not.toContain("|");
  });
});
