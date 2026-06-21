/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { getEffectiveLines } from "@/domain/line/effective-words";
import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { beforeEach, describe, expect, it } from "vitest";
import { computeSplitIntoWordsUpdates, computeSplitSelections, splitLinesIntoWords } from "./split-lines-into-words";

const lineSynced: LyricLine = { id: "L1", text: "one two three", agentId: "v1", begin: 1, end: 4 };
const wordSynced: LyricLine = {
  id: "L2",
  text: "already words",
  agentId: "v1",
  words: [{ text: "already words", begin: 5, end: 6 }],
};
const anotherSynced: LyricLine = { id: "L3", text: "four five", agentId: "v1", begin: 7, end: 9 };

describe("computeSplitIntoWordsUpdates", () => {
  it("converts a line-synced line into a word update with begin/end cleared", () => {
    const updates = computeSplitIntoWordsUpdates(["L1"], [lineSynced]);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("L1");
    expect(updates[0].updates.begin).toBeUndefined();
    expect(updates[0].updates.end).toBeUndefined();
    expect(updates[0].updates.words?.length).toBeGreaterThan(0);
  });

  it("skips lines that are already word-synced", () => {
    const updates = computeSplitIntoWordsUpdates(["L2"], [wordSynced]);
    expect(updates).toHaveLength(0);
  });

  it("skips unknown ids", () => {
    const updates = computeSplitIntoWordsUpdates(["missing"], [lineSynced]);
    expect(updates).toHaveLength(0);
  });

  it("handles a mix of target ids, converting only the line-synced ones", () => {
    const updates = computeSplitIntoWordsUpdates(["L1", "L2", "L3"], [lineSynced, wordSynced, anotherSynced]);
    expect(updates.map((u) => u.id).sort()).toEqual(["L1", "L3"]);
  });
});

describe("computeSplitSelections", () => {
  it("produces a word selection per converted word, indexed against effective lines", () => {
    const updates = computeSplitIntoWordsUpdates(["L1"], [lineSynced]);
    const selections = computeSplitSelections(updates, [lineSynced]);
    expect(selections.length).toBe(updates[0].updates.words?.length);
    expect(selections.every((s) => s.lineId === "L1" && s.lineIndex === 0 && s.type === "word")).toBe(true);
  });

  it("returns no selections when an update id is absent from the effective lines", () => {
    const updates = computeSplitIntoWordsUpdates(["L1"], [lineSynced]);
    const selections = computeSplitSelections(updates, [anotherSynced]);
    expect(selections).toHaveLength(0);
  });
});

describe("splitLinesIntoWords (store-mutating)", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
    useProjectStore.getState().clearHistory();
    useTimelineStore.getState().clearSelection();
  });

  it("converts a single line-synced row to word-synced and selects its words", () => {
    useProjectStore.setState({ lines: [{ ...lineSynced }] });
    const effective = getEffectiveLines(useProjectStore.getState().lines);

    splitLinesIntoWords(["L1"], effective);

    const after = useProjectStore.getState().lines[0];
    expect(after.words?.length).toBeGreaterThan(0);
    expect(after.begin).toBeUndefined();
    expect(after.end).toBeUndefined();
    expect(useTimelineStore.getState().selectedWords.length).toBe(after.words?.length);
  });

  it("converts multiple line-synced rows in one history step", () => {
    useProjectStore.setState({ lines: [{ ...lineSynced }, { ...anotherSynced }] });
    const effective = getEffectiveLines(useProjectStore.getState().lines);

    splitLinesIntoWords(["L1", "L3"], effective);

    const after = useProjectStore.getState().lines;
    expect(after.find((l) => l.id === "L1")?.words?.length).toBeGreaterThan(0);
    expect(after.find((l) => l.id === "L3")?.words?.length).toBeGreaterThan(0);
  });

  it("leaves a word-synced row untouched and selects nothing", () => {
    useProjectStore.setState({ lines: [{ ...wordSynced }] });
    const effective = getEffectiveLines(useProjectStore.getState().lines);

    splitLinesIntoWords(["L2"], effective);

    expect(useProjectStore.getState().lines[0].words).toEqual(wordSynced.words);
    expect(useTimelineStore.getState().selectedWords).toHaveLength(0);
  });
});
