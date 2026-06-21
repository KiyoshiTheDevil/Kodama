/**
 * @vitest-environment node
 */
import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { findRepeatingStandaloneSections } from "./repeating-sections";

function line(id: string, text: string, opts: Partial<LooseLine> = {}): LyricLine {
  return reconcileLine({ id, text, agentId: "v1", ...opts });
}

describe("findRepeatingStandaloneSections", () => {
  it("returns nothing when no repeats exist", () => {
    const lines = [line("1", "a"), line("2", "b"), line("3", "c")];
    expect(findRepeatingStandaloneSections(lines)).toEqual([]);
  });

  it("detects two contiguous chorus runs", () => {
    const lines = [
      line("1", "verse"),
      line("2", "chorus a"),
      line("3", "chorus b"),
      line("4", "verse 2"),
      line("5", "chorus a"),
      line("6", "chorus b"),
    ];
    const result = findRepeatingStandaloneSections(lines);
    expect(result).toHaveLength(1);
    expect(result[0].starts).toEqual([1, 4]);
    expect(result[0].length).toBe(2);
    expect(result[0].previewLines).toEqual(["chorus a", "chorus b"]);
    expect(result[0].fingerprint).toBeTruthy();
  });

  it("fingerprint is stable when surrounding lines change but block content doesn't", () => {
    const baseChorus = [line("1", "chorus a"), line("2", "chorus b")];
    const a = [line("v1", "verse"), ...baseChorus, line("v2", "verse 2"), line("3", "chorus a"), line("4", "chorus b")];
    const b = [
      line("intro1", "intro 1"),
      line("intro2", "intro 2"),
      line("intro3", "intro 3"),
      ...baseChorus,
      line("v1", "verse"),
      line("3", "chorus a"),
      line("4", "chorus b"),
    ];
    const fpA = findRepeatingStandaloneSections(a)[0].fingerprint;
    const fpB = findRepeatingStandaloneSections(b)[0].fingerprint;
    expect(fpA).toBe(fpB);
  });

  it("fingerprint changes when block text changes", () => {
    const a = [line("1", "chorus a"), line("2", "chorus b"), line("3", "chorus a"), line("4", "chorus b")];
    const b = [line("1", "different"), line("2", "chorus b"), line("3", "different"), line("4", "chorus b")];
    const fpA = findRepeatingStandaloneSections(a)[0].fingerprint;
    const fpB = findRepeatingStandaloneSections(b)[0].fingerprint;
    expect(fpA).not.toBe(fpB);
  });

  it("detects 4 contiguous chorus runs of length 4", () => {
    const block = ["chorus a", "chorus b", "chorus c", "chorus d"];
    const lines: LyricLine[] = [];
    let id = 0;
    for (let rep = 0; rep < 4; rep++) {
      for (const t of block) lines.push(line(`${id++}`, t));
      lines.push(line(`${id++}`, `verse-${rep}`));
    }
    const result = findRepeatingStandaloneSections(lines);
    expect(result).toHaveLength(1);
    expect(result[0].starts).toHaveLength(4);
    expect(result[0].length).toBe(4);
  });

  it("prefers larger blocks: detects an 8-line block over a 2-line slice of it", () => {
    const big = Array.from({ length: 8 }, (_, i) => `line ${i}`);
    const lines: LyricLine[] = [];
    let id = 0;
    for (const t of big) lines.push(line(`${id++}`, t));
    for (const t of big) lines.push(line(`${id++}`, t));
    const result = findRepeatingStandaloneSections(lines);
    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(8);
    expect(result[0].starts).toEqual([0, 8]);
  });

  it("ignores lines that already belong to a group", () => {
    const lines = [
      line("1", "chorus a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
      line("2", "chorus b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
      line("3", "chorus a", { groupId: "g1", instanceIdx: 1, templateLineIdx: 0 }),
      line("4", "chorus b", { groupId: "g1", instanceIdx: 1, templateLineIdx: 1 }),
    ];
    expect(findRepeatingStandaloneSections(lines)).toEqual([]);
  });

  it("rejects blocks that include any grouped line", () => {
    const lines = [
      line("1", "a"),
      line("2", "b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
      line("3", "a"),
      line("4", "b"),
    ];
    expect(findRepeatingStandaloneSections(lines)).toEqual([]);
  });

  it("matches by structural equality including word splits", () => {
    const a: LyricLine[] = [
      { id: "1", text: "I love", agentId: "v1", words: [{ text: "I love", begin: 0, end: 1 }] },
      { id: "2", text: "you", agentId: "v1", words: [{ text: "you", begin: 1, end: 2 }] },
      { id: "3", text: "I love", agentId: "v1", words: [{ text: "I love", begin: 10, end: 11 }] },
      { id: "4", text: "you", agentId: "v1", words: [{ text: "you", begin: 11, end: 12 }] },
    ];
    const result = findRepeatingStandaloneSections(a);
    expect(result).toHaveLength(1);
    expect(result[0].starts).toEqual([0, 2]);
  });

  it("rejects pseudo-repeats whose word splits differ", () => {
    const a: LyricLine[] = [
      {
        id: "1",
        text: "I love",
        agentId: "v1",
        words: [
          { text: "I", begin: 0, end: 1 },
          { text: " love", begin: 1, end: 2 },
        ],
      },
      { id: "2", text: "you", agentId: "v1" },
      { id: "3", text: "I love", agentId: "v1", words: [{ text: "I love", begin: 10, end: 11 }] },
      { id: "4", text: "you", agentId: "v1" },
    ];
    expect(findRepeatingStandaloneSections(a)).toEqual([]);
  });

  it("yields multiple distinct sections when both repeat", () => {
    const lines = [
      line("1", "chorus a"),
      line("2", "chorus b"),
      line("3", "chorus a"),
      line("4", "chorus b"),
      line("5", "verse-bridge"),
      line("6", "verse a"),
      line("7", "verse b"),
      line("8", "verse a"),
      line("9", "verse b"),
    ];
    const result = findRepeatingStandaloneSections(lines);
    expect(result).toHaveLength(2);
    expect(result[0].starts).toEqual([0, 2]);
    expect(result[1].starts).toEqual([5, 7]);
  });
});
