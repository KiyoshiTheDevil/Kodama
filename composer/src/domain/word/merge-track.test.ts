/**
 * @vitest-environment node
 */
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import { computeSyllableGroups } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { mergeWordsIntoTrack } from "./merge-track";

describe("mergeWordsIntoTrack", () => {
  it("inserts a word boundary so an incoming word after the last existing word is not grouped with it", () => {
    const existing: WordTiming[] = [
      { text: "Hello ", begin: 0, end: 0.5 },
      { text: "world", begin: 0.5, end: 1 },
    ];
    const incoming: WordTiming[] = [
      { text: "foo ", begin: 1.2, end: 1.6 },
      { text: "bar", begin: 1.6, end: 2 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["Hello ", "world ", "foo ", "bar"]);
    const groups = computeSyllableGroups(result);
    expect(groups.some((g) => g.startIndex <= 1 && g.endIndex >= 2)).toBe(false);
  });

  it("preserves a genuine multi-syllable existing last word while closing it off from incoming content", () => {
    const existing: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.4 },
      { text: "tle", begin: 0.4, end: 0.8 },
    ];
    const incoming: WordTiming[] = [{ text: "foo", begin: 1, end: 1.4 }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["ti", "tle ", "foo"]);
    const groups = computeSyllableGroups(result);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ startIndex: 0, endIndex: 1, originalWord: "title" });
  });

  it("inserts a boundary when incoming words land before the existing words", () => {
    const existing: WordTiming[] = [{ text: "world", begin: 2, end: 2.5 }];
    const incoming: WordTiming[] = [
      { text: "Hello ", begin: 0, end: 0.5 },
      { text: "there", begin: 0.5, end: 1 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["Hello ", "there ", "world"]);
    const groups = computeSyllableGroups(result);
    expect(groups.some((g) => g.startIndex <= 1 && g.endIndex >= 2)).toBe(false);
  });

  it("does not double-add a space when the seam word already ends with one", () => {
    const existing: WordTiming[] = [
      { text: "a ", begin: 0, end: 0.3 },
      { text: "b ", begin: 0.3, end: 0.6 },
    ];
    const incoming: WordTiming[] = [{ text: "c", begin: 1, end: 1.3 }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["a ", "b ", "c"]);
  });

  it("regenerates incoming syllableGroupId values so they cannot merge into an existing group at the seam", () => {
    const existing: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.4, syllableGroupId: "shared" },
      { text: "tle", begin: 0.4, end: 0.8, syllableGroupId: "shared" },
    ];
    const incoming: WordTiming[] = [
      { text: "po", begin: 1, end: 1.4, syllableGroupId: "shared" },
      { text: "em", begin: 1.4, end: 1.8, syllableGroupId: "shared" },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result[1].syllableGroupId).toBe("shared");
    expect(result[2].syllableGroupId).not.toBe("shared");
    expect(result[2].syllableGroupId).toBe(result[3].syllableGroupId);
    const groups = computeSyllableGroups(result);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ startIndex: 0, endIndex: 1 });
    expect(groups[1]).toMatchObject({ startIndex: 2, endIndex: 3 });
  });

  it("adds the seam space in syllableGroupId mode so reconstructed text keeps the word boundary", () => {
    const existing: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.4, syllableGroupId: "a" },
      { text: "tle", begin: 0.4, end: 0.8, syllableGroupId: "a" },
    ];
    const incoming: WordTiming[] = [
      { text: "po", begin: 1, end: 1.4, syllableGroupId: "b" },
      { text: "em", begin: 1.4, end: 1.8, syllableGroupId: "b" },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["ti", "tle ", "po", "em"]);
    expect(reconstructLineText(result, "|")).toBe("ti|tle po|em");
  });

  it("inserts boundaries on both sides when incoming words land in a gap between existing words", () => {
    const existing: WordTiming[] = [
      { text: "Hello ", begin: 0, end: 0.5 },
      { text: "world", begin: 3, end: 3.5 },
    ];
    const incoming: WordTiming[] = [
      { text: "very ", begin: 1, end: 1.4 },
      { text: "big", begin: 1.5, end: 1.9 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["Hello ", "very ", "big ", "world"]);
    expect(reconstructLineText(result, "|")).toBe("Hello very big world");
  });

  it("keeps the incoming batch's own syllable structure intact, spacing only the seam", () => {
    const existing: WordTiming[] = [
      { text: "Hello ", begin: 0, end: 0.5 },
      { text: "world", begin: 0.5, end: 1 },
    ];
    const incoming: WordTiming[] = [
      { text: "sun", begin: 1.2, end: 1.5 },
      { text: "shine", begin: 1.5, end: 1.9 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["Hello ", "world ", "sun", "shine"]);
    expect(reconstructLineText(result, "|")).toBe("Hello world sun|shine");
    expect(computeSyllableGroups(result)).toEqual([{ startIndex: 2, endIndex: 3, originalWord: "sunshine" }]);
  });

  it("preserves word fields such as explicit through the merge and seam-spacing", () => {
    const existing: WordTiming[] = [{ text: "last", begin: 0, end: 0.5, explicit: true }];
    const incoming: WordTiming[] = [{ text: "next", begin: 1, end: 1.4, explicit: true }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["last ", "next"]);
    expect(result[0].explicit).toBe(true);
    expect(result[1].explicit).toBe(true);
  });

  it("returns the existing array unchanged when there is nothing to merge", () => {
    const existing: WordTiming[] = [{ text: "word", begin: 0, end: 1 }];
    expect(mergeWordsIntoTrack(existing, [])).toBe(existing);
  });

  it("returns incoming words with fresh group ids when the track has no existing words", () => {
    const incoming: WordTiming[] = [
      { text: "new", begin: 0, end: 0.5, syllableGroupId: "g" },
      { text: "er", begin: 0.5, end: 1, syllableGroupId: "g" },
    ];

    const result = mergeWordsIntoTrack([], incoming);

    expect(result.map((w) => w.text)).toEqual(["new", "er"]);
    expect(result[0].syllableGroupId).not.toBe("g");
    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
  });

  it("trims the trailing space off the final merged word", () => {
    const existing: WordTiming[] = [{ text: "a", begin: 0, end: 0.5 }];
    const incoming: WordTiming[] = [
      { text: "b ", begin: 1, end: 1.4 },
      { text: "c ", begin: 1.4, end: 1.8 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["a ", "b ", "c"]);
  });
});

describe("mergeWordsIntoTrack edge cases and invariants", () => {
  it("returns an empty array when both tracks are empty", () => {
    expect(mergeWordsIntoTrack([], [])).toEqual([]);
  });

  it("spaces the seam for the minimal single-word case", () => {
    const result = mergeWordsIntoTrack([{ text: "a", begin: 0, end: 1 }], [{ text: "b", begin: 2, end: 3 }]);
    expect(result.map((w) => w.text)).toEqual(["a ", "b"]);
  });

  it("does not mutate the existing or incoming arrays or their word objects", () => {
    const existing: WordTiming[] = [{ text: "world", begin: 1, end: 1.5 }];
    const incoming: WordTiming[] = [{ text: "foo", begin: 2, end: 2.5, syllableGroupId: "g" }];
    const existingBefore = existing.map((w) => ({ ...w }));
    const incomingBefore = incoming.map((w) => ({ ...w }));

    mergeWordsIntoTrack(existing, incoming);

    expect(existing).toEqual(existingBefore);
    expect(incoming).toEqual(incomingBefore);
  });

  it("returns words sorted by begin even when the incoming batch is unsorted", () => {
    const existing: WordTiming[] = [{ text: "mid ", begin: 5, end: 5.5 }];
    const incoming: WordTiming[] = [
      { text: "late", begin: 9, end: 9.5 },
      { text: "early ", begin: 1, end: 1.5 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["early ", "mid ", "late"]);
    const begins = result.map((w) => w.begin);
    expect(begins).toEqual([...begins].toSorted((a, b) => a - b));
  });

  it("spaces every seam when existing and incoming words fully interleave", () => {
    const existing: WordTiming[] = [
      { text: "one", begin: 0, end: 0.5 },
      { text: "three", begin: 2, end: 2.5 },
    ];
    const incoming: WordTiming[] = [
      { text: "two", begin: 1, end: 1.5 },
      { text: "four", begin: 3, end: 3.5 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["one ", "two ", "three ", "four"]);
    expect(computeSyllableGroups(result)).toEqual([]);
  });

  it("maps each distinct incoming syllable group to its own fresh id", () => {
    const incoming: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.4, syllableGroupId: "g1" },
      { text: "tle ", begin: 0.4, end: 0.8, syllableGroupId: "g1" },
      { text: "po", begin: 0.8, end: 1.2, syllableGroupId: "g2" },
      { text: "em", begin: 1.2, end: 1.6, syllableGroupId: "g2" },
    ];

    const result = mergeWordsIntoTrack([], incoming);

    expect(result[0].syllableGroupId).toBe(result[1].syllableGroupId);
    expect(result[2].syllableGroupId).toBe(result[3].syllableGroupId);
    expect(result[0].syllableGroupId).not.toBe(result[2].syllableGroupId);
    expect(result[0].syllableGroupId).not.toBe("g1");
    expect(result[2].syllableGroupId).not.toBe("g2");
    expect(computeSyllableGroups(result)).toHaveLength(2);
  });

  it("regenerates defined incoming ids and leaves undefined ones untouched", () => {
    const incoming: WordTiming[] = [
      { text: "grouped ", begin: 0, end: 0.5, syllableGroupId: "g" },
      { text: "plain", begin: 0.5, end: 1 },
    ];

    const result = mergeWordsIntoTrack([], incoming);

    expect(result[0].syllableGroupId).toBeDefined();
    expect(result[0].syllableGroupId).not.toBe("g");
    expect(result[1].syllableGroupId).toBeUndefined();
  });

  it("preserves explicit when an incoming word's group id is regenerated", () => {
    const incoming: WordTiming[] = [
      { text: "ex", begin: 0, end: 0.4, syllableGroupId: "g", explicit: true },
      { text: "plicit", begin: 0.4, end: 0.8, syllableGroupId: "g", explicit: true },
    ];

    const result = mergeWordsIntoTrack([], incoming);

    expect(result[0].explicit).toBe(true);
    expect(result[1].explicit).toBe(true);
    expect(result[0].syllableGroupId).not.toBe("g");
  });

  it("trims a trailing space off the final word even when it comes from the existing track", () => {
    const existing: WordTiming[] = [{ text: "tail ", begin: 5, end: 5.5 }];
    const incoming: WordTiming[] = [{ text: "head ", begin: 1, end: 1.5 }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["head ", "tail"]);
  });

  it("preserves the internal syllable structure of both tracks while spacing the seam", () => {
    const existing: WordTiming[] = [
      { text: "ti", begin: 0, end: 0.3 },
      { text: "tle", begin: 0.3, end: 0.6 },
    ];
    const incoming: WordTiming[] = [
      { text: "po", begin: 1, end: 1.3 },
      { text: "em", begin: 1.3, end: 1.6 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["ti", "tle ", "po", "em"]);
    expect(reconstructLineText(result, "|")).toBe("ti|tle po|em");
    expect(computeSyllableGroups(result)).toEqual([
      { startIndex: 0, endIndex: 1, originalWord: "title" },
      { startIndex: 2, endIndex: 3, originalWord: "poem" },
    ]);
  });

  it("spaces the seam when an incoming word is exactly time-adjacent to an existing word", () => {
    const existing: WordTiming[] = [{ text: "before", begin: 0, end: 1 }];
    const incoming: WordTiming[] = [{ text: "after", begin: 1, end: 2 }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["before ", "after"]);
  });

  it("trims the final incoming word and still spaces the seam before it", () => {
    const existing: WordTiming[] = [{ text: "head", begin: 0, end: 0.5 }];
    const incoming: WordTiming[] = [{ text: "tail ", begin: 1, end: 1.5 }];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["head ", "tail"]);
  });

  it("never spaces an existing internal syllable joint when incoming words bracket it", () => {
    const existing: WordTiming[] = [
      { text: "ti", begin: 1, end: 1.4 },
      { text: "tle", begin: 1.4, end: 1.8 },
    ];
    const incoming: WordTiming[] = [
      { text: "before ", begin: 0, end: 0.5 },
      { text: "after", begin: 3, end: 3.5 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.map((w) => w.text)).toEqual(["before ", "ti", "tle ", "after"]);
    expect(computeSyllableGroups(result)).toEqual([{ startIndex: 1, endIndex: 2, originalWord: "title" }]);
  });

  it("never injects syllableGroupId into a trailing-space track so the spaces fallback stays active", () => {
    const existing: WordTiming[] = [
      { text: "Hello ", begin: 0, end: 0.5 },
      { text: "wor", begin: 0.5, end: 0.75 },
      { text: "ld", begin: 0.75, end: 1 },
    ];
    const incoming: WordTiming[] = [
      { text: "sun", begin: 1.2, end: 1.5 },
      { text: "shine", begin: 1.5, end: 1.9 },
    ];

    const result = mergeWordsIntoTrack(existing, incoming);

    expect(result.every((w) => w.syllableGroupId === undefined)).toBe(true);
    expect(computeSyllableGroups(result)).toEqual([
      { startIndex: 1, endIndex: 2, originalWord: "world" },
      { startIndex: 3, endIndex: 4, originalWord: "sunshine" },
    ]);
  });
});
