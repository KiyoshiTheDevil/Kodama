import type { LyricLine } from "@/domain/line/model";
import { createLine } from "@/test/factories";
import { createWordTimingOps } from "@/utils/timing/word-timing-ops";
import { describe, expect, it } from "vitest";

interface CapturedUpdate {
  id: string;
  updates: Partial<LyricLine>;
  options?: { propagateToSiblings?: boolean };
}

function captureUpdates() {
  const calls: CapturedUpdate[] = [];
  const updateLineWithHistory = (
    id: string,
    updates: Partial<LyricLine>,
    options?: { propagateToSiblings?: boolean },
  ) => {
    calls.push({ id, updates, options });
  };
  return { calls, updateLineWithHistory };
}

const wordsOps = createWordTimingOps({ getWords: (line) => line.words, updateKey: "words" });
const bgOps = createWordTimingOps({ getWords: (line) => line.backgroundWords, updateKey: "backgroundWords" });

describe("createWordTimingOps: early returns", () => {
  it("nudgeBegin no-ops when line missing", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeBegin([], 0, 0, 0.1, updateLineWithHistory);
    expect(calls).toHaveLength(0);
  });

  it("setBegin no-ops when wordIdx out of bounds", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const lines = [createLine({ text: "Hello", words: [{ text: "Hello", begin: 0, end: 1 }] })];
    wordsOps.setBegin(lines, 0, 5, 0.5, updateLineWithHistory);
    expect(calls).toHaveLength(0);
  });

  it("nudgeEnd no-ops when getWords returns undefined", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const lines = [createLine({ text: "Hello" })];
    wordsOps.nudgeEnd(lines, 0, 0, 0.1, updateLineWithHistory);
    expect(calls).toHaveLength(0);
  });
});

describe("createWordTimingOps: nudgeBegin / setBegin clamp", () => {
  function makeLine() {
    return createLine({
      text: "a b c",
      words: [
        { text: "a", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
        { text: "c", begin: 2, end: 3 },
      ],
    });
  }

  it("nudgeBegin caps at prev word's end", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeBegin([makeLine()], 0, 1, -5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].begin).toBe(1);
  });

  it("nudgeBegin caps at word's own end", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeBegin([makeLine()], 0, 1, +5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].begin).toBe(2);
  });

  it("nudgeBegin caps at 0 for first word with no prev", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeBegin([makeLine()], 0, 0, -5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[0].begin).toBe(0);
  });

  it("setBegin clamps to [prev.end, word.end]", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.setBegin([makeLine()], 0, 1, 0.5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].begin).toBe(1);
  });

  it("setBegin accepts an in-range value", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.setBegin([makeLine()], 0, 1, 1.5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].begin).toBe(1.5);
  });
});

describe("createWordTimingOps: nudgeEnd / setEnd clamp", () => {
  function makeLine() {
    return createLine({
      text: "a b c",
      words: [
        { text: "a", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
        { text: "c", begin: 2, end: 3 },
      ],
    });
  }

  it("nudgeEnd caps at next word's begin", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeEnd([makeLine()], 0, 1, +5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].end).toBe(2);
  });

  it("nudgeEnd caps at word's own begin", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeEnd([makeLine()], 0, 1, -5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].end).toBe(1);
  });

  it("nudgeEnd has no upper bound when next word is missing", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.nudgeEnd([makeLine()], 0, 2, +100, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[2].end).toBe(103);
  });

  it("setEnd clamps to [word.begin, next.begin]", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    wordsOps.setEnd([makeLine()], 0, 1, 5, updateLineWithHistory);
    expect((calls[0].updates.words ?? [])[1].end).toBe(2);
  });
});

describe("createWordTimingOps: write contract", () => {
  it("always passes propagateToSiblings: false", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const line = createLine({ text: "x", words: [{ text: "x", begin: 0, end: 1 }] });
    wordsOps.setBegin([line], 0, 0, 0.2, updateLineWithHistory);
    expect(calls[0].options?.propagateToSiblings).toBe(false);
  });

  it("targets the updateKey configured by the factory (words)", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const line = createLine({ text: "x", words: [{ text: "x", begin: 0, end: 1 }] });
    wordsOps.setBegin([line], 0, 0, 0.2, updateLineWithHistory);
    expect("words" in calls[0].updates).toBe(true);
    expect("backgroundWords" in calls[0].updates).toBe(false);
  });

  it("targets the updateKey configured by the factory (backgroundWords)", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const line = createLine({
      text: "Lead",
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 0, end: 1 }],
    });
    bgOps.setBegin([line], 0, 0, 0.2, updateLineWithHistory);
    expect("backgroundWords" in calls[0].updates).toBe(true);
    expect("words" in calls[0].updates).toBe(false);
  });

  it("produces a new words array (immutability)", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const original = createLine({
      text: "a b",
      words: [
        { text: "a", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
      ],
    });
    wordsOps.setBegin([original], 0, 1, 1.5, updateLineWithHistory);
    expect(calls[0].updates.words).not.toBe(original.words);
  });

  it("does not mutate untouched words in the resulting array", () => {
    const { calls, updateLineWithHistory } = captureUpdates();
    const line = createLine({
      text: "a b c",
      words: [
        { text: "a", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
        { text: "c", begin: 2, end: 3 },
      ],
    });
    wordsOps.setBegin([line], 0, 1, 1.5, updateLineWithHistory);
    const out = calls[0].updates.words ?? [];
    expect(out[0]).toEqual({ text: "a", begin: 0, end: 1 });
    expect(out[2]).toEqual({ text: "c", begin: 2, end: 3 });
  });
});
