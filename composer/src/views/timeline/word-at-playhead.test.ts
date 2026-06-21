import { describe, expect, it } from "vitest";
import { createLine } from "@/test/factories";
import type { WordSelection } from "@/domain/selection/model";
import { findWordsAtTime, pickNextWordAtPlayhead } from "@/views/timeline/word-at-playhead";

describe("findWordsAtTime", () => {
  it("returns empty when nothing overlaps the time", () => {
    const lines = [createLine({ words: [{ text: "a", begin: 0, end: 1 }] })];
    expect(findWordsAtTime(lines, 5)).toEqual([]);
  });

  it("treats begin as inclusive and end as exclusive", () => {
    const lines = [createLine({ words: [{ text: "a", begin: 1, end: 2 }] })];
    expect(findWordsAtTime(lines, 1)).toHaveLength(1);
    expect(findWordsAtTime(lines, 2)).toEqual([]);
    expect(findWordsAtTime(lines, 1.999)).toHaveLength(1);
  });

  it("returns a main word and an overlapping background word, main first", () => {
    const line = createLine({
      id: "line-a",
      words: [{ text: "main", begin: 0, end: 2 }],
      backgroundWords: [{ text: "bg", begin: 0.5, end: 1.5 }],
    });
    const matches = findWordsAtTime([line], 1);
    expect(matches).toEqual<WordSelection[]>([
      { lineId: "line-a", lineIndex: 0, wordIndex: 0, type: "word" },
      { lineId: "line-a", lineIndex: 0, wordIndex: 0, type: "bg" },
    ]);
  });

  it("returns overlapping words from multiple lines in line order", () => {
    const lineOne = createLine({ id: "line-1", words: [{ text: "one", begin: 0, end: 3 }] });
    const lineTwo = createLine({ id: "line-2", words: [{ text: "two", begin: 1, end: 4 }] });
    const matches = findWordsAtTime([lineOne, lineTwo], 2);
    expect(matches).toEqual<WordSelection[]>([
      { lineId: "line-1", lineIndex: 0, wordIndex: 0, type: "word" },
      { lineId: "line-2", lineIndex: 1, wordIndex: 0, type: "word" },
    ]);
  });
});

describe("pickNextWordAtPlayhead", () => {
  const matchA: WordSelection = { lineId: "line-1", lineIndex: 0, wordIndex: 0, type: "word" };
  const matchB: WordSelection = { lineId: "line-1", lineIndex: 0, wordIndex: 0, type: "bg" };
  const matchC: WordSelection = { lineId: "line-2", lineIndex: 1, wordIndex: 0, type: "word" };

  it("returns null when matches are empty", () => {
    expect(pickNextWordAtPlayhead([], [matchA])).toBeNull();
  });

  it("returns the first match when nothing is selected", () => {
    expect(pickNextWordAtPlayhead([matchA, matchB], [])).toEqual(matchA);
  });

  it("advances to the next match when the current selection is one of the matches", () => {
    expect(pickNextWordAtPlayhead([matchA, matchB, matchC], [matchA])).toEqual(matchB);
  });

  it("wraps from the last match back to the first", () => {
    expect(pickNextWordAtPlayhead([matchA, matchB, matchC], [matchC])).toEqual(matchA);
  });

  it("falls back to the first match when more than one word is selected", () => {
    expect(pickNextWordAtPlayhead([matchA, matchB, matchC], [matchA, matchB])).toEqual(matchA);
  });

  it("falls back to the first match when the selection is not among the matches", () => {
    const outsider: WordSelection = { lineId: "line-9", lineIndex: 8, wordIndex: 3, type: "word" };
    expect(pickNextWordAtPlayhead([matchA, matchB, matchC], [outsider])).toEqual(matchA);
  });
});
