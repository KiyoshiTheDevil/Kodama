import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { effectiveWords, getEffectiveLines } from "@/domain/line/effective-words";

// -- Helpers ------------------------------------------------------------------

function line(extras: Partial<LooseLine> = {}): LyricLine {
  return reconcileLine({ id: "l1", text: "Hello", agentId: "v1", ...extras });
}

// -- effectiveWords -----------------------------------------------------------

describe("effectiveWords", () => {
  it("returns the words array when word-synced", () => {
    const words = [
      { text: "Hello ", begin: 0, end: 1 },
      { text: "world", begin: 1, end: 2 },
    ];
    expect(effectiveWords(line({ words }))).toEqual(words);
  });

  it("returns a single synthetic word covering line-synced begin/end", () => {
    expect(effectiveWords(line({ text: "Hello world", begin: 3, end: 7 }))).toEqual([
      { text: "Hello world", begin: 3, end: 7 },
    ]);
  });

  it("strips split characters from synthetic word text", () => {
    expect(effectiveWords(line({ text: "Hel|lo wo|rld", begin: 3, end: 7 }))).toEqual([
      { text: "Hello world", begin: 3, end: 7 },
    ]);
  });

  it("returns empty array when no timing at all", () => {
    expect(effectiveWords(line())).toEqual([]);
  });

  it("returns empty array for a word-synced line with an empty words array", () => {
    expect(effectiveWords(line({ words: [] }))).toEqual([]);
  });
});

// -- getEffectiveLines --------------------------------------------------------

describe("getEffectiveLines", () => {
  it("injects synthetic single-word array for line-synced lines", () => {
    const lines: LyricLine[] = [line({ id: "a", text: "Hi", begin: 1, end: 2 })];
    expect(getEffectiveLines(lines)[0].words).toEqual([{ text: "Hi", begin: 1, end: 2 }]);
  });

  it("leaves word-synced lines untouched", () => {
    const words = [{ text: "Hi ", begin: 0, end: 1 }];
    const lines: LyricLine[] = [line({ words })];
    expect(getEffectiveLines(lines)[0].words).toBe(words);
  });

  it("leaves untimed lines untouched (no synthetic words)", () => {
    const lines: LyricLine[] = [line({ id: "a", text: "Hi" })];
    expect(getEffectiveLines(lines)[0].words).toBeUndefined();
  });

  it("preserves other line properties", () => {
    const lines: LyricLine[] = [line({ id: "a", agentId: "v9", begin: 1, end: 2, groupId: "g1", instanceIdx: 3 })];
    const out = getEffectiveLines(lines)[0];
    expect(out.id).toBe("a");
    expect(out.agentId).toBe("v9");
    expect(out.groupId).toBe("g1");
    expect(out.instanceIdx).toBe(3);
  });
});
