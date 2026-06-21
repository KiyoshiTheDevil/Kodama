/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import type { WordSelection } from "@/domain/selection/model";
import { describe, expect, it } from "vitest";
import { buildCandidateLines } from "./build-candidate-lines";

const lineA: LyricLine = {
  id: "a",
  text: "I love you",
  agentId: "v1",
  words: [
    { text: "I ", begin: 0, end: 1 },
    { text: "love ", begin: 1, end: 2 },
    { text: "you", begin: 2, end: 3 },
  ],
};

const lineB: LyricLine = {
  id: "b",
  text: "and so do I",
  agentId: "v1",
  words: [
    { text: "and ", begin: 3, end: 4 },
    { text: "so ", begin: 4, end: 5 },
    { text: "do ", begin: 5, end: 6 },
    { text: "I", begin: 6, end: 7 },
  ],
};

const lineWithBg: LyricLine = {
  id: "c",
  text: "main",
  agentId: "v1",
  words: [{ text: "main", begin: 0, end: 1 }],
  backgroundText: "bg",
  backgroundWords: [{ text: "bg", begin: 0.5, end: 1 }],
};

function selectAll(line: LyricLine, lineIndex: number): WordSelection[] {
  const sels: WordSelection[] = [];
  (line.words ?? []).forEach((_, i) => sels.push({ lineId: line.id, lineIndex, wordIndex: i, type: "word" }));
  (line.backgroundWords ?? []).forEach((_, i) => sels.push({ lineId: line.id, lineIndex, wordIndex: i, type: "bg" }));
  return sels;
}

describe("buildCandidateLines", () => {
  it("returns the lines in order when every word is selected", () => {
    const lines = [lineA, lineB];
    const sel = [...selectAll(lineA, 0), ...selectAll(lineB, 1)];
    const result = buildCandidateLines(lines, sel);
    expect(result?.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("preserves lineIndex order when selection is built out of order", () => {
    const lines = [lineA, lineB];
    const sel = [...selectAll(lineB, 1), ...selectAll(lineA, 0)];
    const result = buildCandidateLines(lines, sel);
    expect(result?.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("returns undefined when only some words of a line are selected", () => {
    const lines = [lineA];
    const sel: WordSelection[] = [{ lineId: "a", lineIndex: 0, wordIndex: 0, type: "word" }];
    expect(buildCandidateLines(lines, sel)).toBeUndefined();
  });

  it("requires every bg word to be selected when bg track has words", () => {
    const lines = [lineWithBg];
    const sel: WordSelection[] = [{ lineId: "c", lineIndex: 0, wordIndex: 0, type: "word" }];
    expect(buildCandidateLines(lines, sel)).toBeUndefined();
  });

  it("returns the line when both main and bg words are fully selected", () => {
    const lines = [lineWithBg];
    const sel: WordSelection[] = [
      { lineId: "c", lineIndex: 0, wordIndex: 0, type: "word" },
      { lineId: "c", lineIndex: 0, wordIndex: 0, type: "bg" },
    ];
    expect(buildCandidateLines(lines, sel)?.map((l) => l.id)).toEqual(["c"]);
  });

  it("returns undefined for an empty selection", () => {
    expect(buildCandidateLines([lineA], [])).toBeUndefined();
  });

  it("returns undefined when a selected line is missing from project", () => {
    const sel: WordSelection[] = [{ lineId: "ghost", lineIndex: 0, wordIndex: 0, type: "word" }];
    expect(buildCandidateLines([lineA], sel)).toBeUndefined();
  });
});
