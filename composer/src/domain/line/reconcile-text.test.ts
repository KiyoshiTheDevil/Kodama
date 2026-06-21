import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/domain/line/model";
import { reconcileMatchedTiming } from "@/domain/line/reconcile-text";

describe("reconcileMatchedTiming", () => {
  it("returns the same reference when the typed text is identical", () => {
    const line: LyricLine = {
      id: "L1",
      text: "Dengar|lah rindu yang menyik|sa i|ni",
      agentId: "v1",
      words: [
        { text: "Dengar", begin: 1, end: 1.2 },
        { text: "lah ", begin: 1.2, end: 1.4 },
        { text: "rindu ", begin: 1.4, end: 1.6 },
        { text: "yang ", begin: 1.6, end: 1.8 },
        { text: "menyik", begin: 1.8, end: 2 },
        { text: "sa ", begin: 2, end: 2.2 },
        { text: "i", begin: 2.2, end: 2.4 },
        { text: "ni", begin: 2.4, end: 2.6 },
      ],
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah rindu yang menyik|sa i|ni");
    expect(result).toBe(line);
  });

  it("preserves begin/end on an untouched line-synced line that contains split characters", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Dengar|lah rindu",
      agentId: "v1",
      begin: 1,
      end: 2,
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah rindu");
    expect(result).toBe(line);
  });

  it("remaps words when split positions move but the syllable count is unchanged", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Den|garlah rin|du",
      agentId: "v1",
      words: [
        { text: "Den", begin: 0, end: 0.5 },
        { text: "garlah ", begin: 0.5, end: 1 },
        { text: "rin", begin: 1, end: 1.5 },
        { text: "du", begin: 1.5, end: 2 },
      ],
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah rin|du");
    expect(result.text).toBe("Dengar|lah rin|du");
    expect(result.words?.map((w) => w.begin)).toEqual([0, 0.5, 1, 1.5]);
    expect(result.words?.map((w) => w.end)).toEqual([0.5, 1, 1.5, 2]);
    expect(result.words?.map((w) => w.text)).toEqual(["Dengar", "lah ", "rin", "du"]);
  });

  it("clears word timing when the syllable count actually changes", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Dengar|lah",
      agentId: "v1",
      words: [
        { text: "Dengar", begin: 0, end: 0.5 },
        { text: "lah", begin: 0.5, end: 1 },
      ],
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah|extra");
    expect(result.text).toBe("Dengar|lah|extra");
    expect(result.words).toBeUndefined();
  });

  it("clears begin/end on a line-synced line whose text content actually changed", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Dengarlah rindu",
      agentId: "v1",
      begin: 1,
      end: 2,
    };
    const result = reconcileMatchedTiming(line, "Dengarlah rindu sayang");
    expect(result.text).toBe("Dengarlah rindu sayang");
    expect(result.begin).toBeUndefined();
    expect(result.end).toBeUndefined();
  });
});

describe("reconcileMatchedTiming · edge cases", () => {
  it("returns the same reference for an untimed line whose text is identical", () => {
    const line: LyricLine = { id: "L0", text: "no timing here", agentId: "v1" };
    const result = reconcileMatchedTiming(line, "no timing here");
    expect(result).toBe(line);
  });

  it("updates text on an untimed line whose text changed", () => {
    const line: LyricLine = { id: "L0", text: "old", agentId: "v1" };
    const result = reconcileMatchedTiming(line, "new");
    expect(result.text).toBe("new");
    expect(result.words).toBeUndefined();
    expect(result.begin).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  it("treats an empty words array as no timing and clears on text change", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Dengar|lah",
      agentId: "v1",
      words: [],
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah|extra");
    expect(result.text).toBe("Dengar|lah|extra");
    expect(result.words).toBeUndefined();
    expect(result.begin).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  it("does not mutate the input line or its words array", () => {
    const originalWords = [
      { text: "Den", begin: 0, end: 0.5 },
      { text: "garlah ", begin: 0.5, end: 1 },
      { text: "rin", begin: 1, end: 1.5 },
      { text: "du", begin: 1.5, end: 2 },
    ];
    const line: LyricLine = {
      id: "L0",
      text: "Den|garlah rin|du",
      agentId: "v1",
      words: originalWords,
    };
    const beforeText = line.text;
    const beforeWords = line.words;
    const beforeWordsSnapshot = JSON.parse(JSON.stringify(line.words));
    reconcileMatchedTiming(line, "Dengar|lah rin|du");
    expect(line.text).toBe(beforeText);
    expect(line.words).toBe(beforeWords);
    expect(line.words).toEqual(beforeWordsSnapshot);
  });

  it("preserves background-vocal fields on the remap path", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Den|garlah rin|du",
      agentId: "v1",
      words: [
        { text: "Den", begin: 0, end: 0.5 },
        { text: "garlah ", begin: 0.5, end: 1 },
        { text: "rin", begin: 1, end: 1.5 },
        { text: "du", begin: 1.5, end: 2 },
      ],
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 0.2, end: 0.8 }],
      backgroundTextSource: "manual",
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah rin|du");
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundWords).toEqual([{ text: "ooh", begin: 0.2, end: 0.8 }]);
    expect(result.backgroundTextSource).toBe("manual");
  });

  it("preserves background-vocal fields on the clear path", () => {
    const line: LyricLine = {
      id: "L0",
      text: "Dengar|lah",
      agentId: "v1",
      words: [
        { text: "Dengar", begin: 0, end: 0.5 },
        { text: "lah", begin: 0.5, end: 1 },
      ],
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 0.2, end: 0.8 }],
      backgroundTextSource: "extraction",
    };
    const result = reconcileMatchedTiming(line, "Dengar|lah|extra");
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundWords).toEqual([{ text: "ooh", begin: 0.2, end: 0.8 }]);
    expect(result.backgroundTextSource).toBe("extraction");
  });

  it("preserves group fields (groupId, instanceIdx, templateLineIdx) on both paths", () => {
    const wordSynced: LyricLine = {
      id: "L0",
      text: "Den|garlah rin|du",
      agentId: "v1",
      words: [
        { text: "Den", begin: 0, end: 0.5 },
        { text: "garlah ", begin: 0.5, end: 1 },
        { text: "rin", begin: 1, end: 1.5 },
        { text: "du", begin: 1.5, end: 2 },
      ],
      groupId: "g1",
      instanceIdx: 0,
      templateLineIdx: 0,
    };
    const remapped = reconcileMatchedTiming(wordSynced, "Dengar|lah rin|du");
    expect(remapped.groupId).toBe("g1");
    expect(remapped.instanceIdx).toBe(0);
    expect(remapped.templateLineIdx).toBe(0);

    const cleared = reconcileMatchedTiming(wordSynced, "totally different content here now");
    expect(cleared.groupId).toBe("g1");
    expect(cleared.instanceIdx).toBe(0);
    expect(cleared.templateLineIdx).toBe(0);
  });
});
