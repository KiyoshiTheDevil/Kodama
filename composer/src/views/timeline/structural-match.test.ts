/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { findMatchingTemplate, linesStructurallyEqual, structurallyEqualLineSequences } from "./structural-match";

const baseLine: LyricLine = { id: "x", text: "I love you", agentId: "v1" };

describe("linesStructurallyEqual", () => {
  it("equal when text/agentId/words/bg match", () => {
    const a: LyricLine = {
      ...baseLine,
      words: [
        { text: "I ", begin: 0, end: 1 },
        { text: "love", begin: 1, end: 2 },
      ],
    };
    const b: LyricLine = {
      ...baseLine,
      id: "y",
      words: [
        { text: "I ", begin: 30, end: 31 },
        { text: "love", begin: 31, end: 32 },
      ],
    };
    expect(linesStructurallyEqual(a, b)).toBe(true);
  });

  it("unequal when text differs", () => {
    expect(linesStructurallyEqual(baseLine, { ...baseLine, text: "different" })).toBe(false);
  });

  it("unequal when agent differs", () => {
    expect(linesStructurallyEqual(baseLine, { ...baseLine, agentId: "v2" })).toBe(false);
  });

  it("unequal when word count differs", () => {
    const a: LyricLine = {
      ...baseLine,
      words: [
        { text: "I ", begin: 0, end: 1 },
        { text: "love", begin: 1, end: 2 },
      ],
    };
    const b: LyricLine = {
      ...baseLine,
      words: [{ text: "I ", begin: 0, end: 1 }],
    };
    expect(linesStructurallyEqual(a, b)).toBe(false);
  });

  it("unequal when background differs", () => {
    const a: LyricLine = { ...baseLine, backgroundText: "yeah" };
    const b: LyricLine = { ...baseLine, backgroundText: "yeah yeah" };
    expect(linesStructurallyEqual(a, b)).toBe(false);
  });
});

describe("structurallyEqualLineSequences", () => {
  it("matches sequences with same structure but different timings", () => {
    const a: LyricLine[] = [
      { id: "1", text: "I love", agentId: "v1", words: [{ text: "I", begin: 0, end: 1 }] },
      { id: "2", text: "you", agentId: "v1", words: [{ text: "you", begin: 1, end: 2 }] },
    ];
    const b: LyricLine[] = [
      { id: "x", text: "I love", agentId: "v1", words: [{ text: "I", begin: 30, end: 31 }] },
      { id: "y", text: "you", agentId: "v1", words: [{ text: "you", begin: 31, end: 32 }] },
    ];
    expect(structurallyEqualLineSequences(a, b)).toBe(true);
  });

  it("rejects different line counts", () => {
    const a: LyricLine[] = [{ id: "1", text: "I", agentId: "v1" }];
    const b: LyricLine[] = [
      { id: "1", text: "I", agentId: "v1" },
      { id: "2", text: "you", agentId: "v1" },
    ];
    expect(structurallyEqualLineSequences(a, b)).toBe(false);
  });
});

describe("findMatchingTemplate", () => {
  it("finds a matching instance template in the project", () => {
    const projectLines: LyricLine[] = [
      {
        id: "a",
        text: "I love",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "I love", begin: 0, end: 2 }],
      },
      {
        id: "b",
        text: "you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 1,
        words: [{ text: "you", begin: 2, end: 3 }],
      },
    ];
    const candidate: LyricLine[] = [
      { id: "p", text: "I love", agentId: "v1", words: [{ text: "I love", begin: 30, end: 32 }] },
      { id: "q", text: "you", agentId: "v1", words: [{ text: "you", begin: 32, end: 33 }] },
    ];
    const found = findMatchingTemplate(candidate, projectLines);
    expect(found).toEqual({ groupId: "g1", instanceIdx: 0 });
  });

  it("returns null when no match", () => {
    const projectLines: LyricLine[] = [
      {
        id: "a",
        text: "I love",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "I love", begin: 0, end: 2 }],
      },
    ];
    const candidate: LyricLine[] = [{ id: "p", text: "different text", agentId: "v1" }];
    expect(findMatchingTemplate(candidate, projectLines)).toBeNull();
  });
});
