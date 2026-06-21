/**
 * @vitest-environment node
 */
import type { LinkGroup } from "@/domain/group/template";
import type { WordTiming } from "@/domain/word/timing";
import { useProjectStore } from "@/stores/project";
import { commitTappedWord, splitIntoWordsWithMeta } from "@/utils/sync-helpers";
import { nudgeLineBegin } from "@/utils/timing/line-timing";
import { nudgeWordBegin, setWordBegin } from "@/utils/timing/word-timing";
import { beforeEach, describe, expect, it } from "vitest";

// Regression coverage for issue #96: resyncing one instance of a group must not
// retime the other instances. The shared root cause is that per-instance timing
// edits routed through updateLineWithHistory / updateLinesWithHistory triggered
// smart-sync propagation. The propagateToSiblings option opts those writes out.

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
});

function seedGroup(id: string): LinkGroup {
  return { id, label: "Chorus", color: "#f472b6", templateVersion: 1 };
}

const INSTANCE_A_WORDS: WordTiming[] = [
  { text: "I ", begin: 0, end: 0.4 },
  { text: "love ", begin: 0.4, end: 0.8 },
  { text: "you", begin: 0.8, end: 1.2 },
];

const INSTANCE_B_WORDS: WordTiming[] = [
  { text: "I ", begin: 10, end: 10.5 },
  { text: "love ", begin: 10.5, end: 11.0 },
  { text: "you", begin: 11.0, end: 11.5 },
];

// Seeds in a single setState and marks the store dirty-since-history so the
// first *WithHistory mutation snapshots this state as the undo baseline.
function seedTwoWordSyncedInstances() {
  useProjectStore.setState({
    groups: [seedGroup("g1")],
    lines: [
      {
        id: "a0",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: INSTANCE_A_WORDS.map((w) => ({ ...w })),
      },
      {
        id: "a1",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: INSTANCE_B_WORDS.map((w) => ({ ...w })),
      },
    ],
    isDirtySinceHistory: true,
  });
}

const MERGED_WORDS: WordTiming[] = [
  { text: "I ", begin: 0, end: 0.4 },
  { text: "love you", begin: 0.4, end: 1.2 },
];

function getLine(id: string) {
  const line = useProjectStore.getState().lines.find((l) => l.id === id);
  if (!line) throw new Error(`line ${id} not found`);
  return line;
}

describe("updateLineWithHistory · propagateToSiblings: false", () => {
  it("does not retime a sibling when the source word count shrinks", () => {
    seedTwoWordSyncedInstances();

    useProjectStore
      .getState()
      .updateLineWithHistory("a0", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false });

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("does not retime a sibling when the source word count grows", () => {
    seedTwoWordSyncedInstances();

    const grown: WordTiming[] = [...INSTANCE_A_WORDS, { text: "you", begin: 1.2, end: 1.6 }];
    useProjectStore.getState().updateLineWithHistory("a0", { words: grown }, { propagateToSiblings: false });

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("does not reorder a sibling's word texts when the source word order changes", () => {
    seedTwoWordSyncedInstances();

    const reordered: WordTiming[] = [
      { text: "love ", begin: 0, end: 0.4 },
      { text: "I ", begin: 0.4, end: 0.8 },
      { text: "you", begin: 0.8, end: 1.2 },
    ];
    useProjectStore.getState().updateLineWithHistory("a0", { words: reordered }, { propagateToSiblings: false });

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("does not retime a sibling's background words", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const bgA: WordTiming[] = [{ text: "ah", begin: 0, end: 0.5 }];
    const bgB: WordTiming[] = [{ text: "ah", begin: 20, end: 20.5 }];
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "lead",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "ah",
          backgroundWords: bgA.map((w) => ({ ...w })),
        },
        {
          id: "a1",
          text: "lead",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          backgroundText: "ah",
          backgroundWords: bgB.map((w) => ({ ...w })),
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory(
      "a0",
      {
        backgroundWords: [
          { text: "ah", begin: 1, end: 1.2 },
          { text: "ah", begin: 1.2, end: 1.4 },
        ],
      },
      { propagateToSiblings: false },
    );

    expect(getLine("a1").backgroundWords).toEqual(bgB);
  });

  it("still writes the source line", () => {
    seedTwoWordSyncedInstances();
    const sourceWords: WordTiming[] = [{ text: "I ", begin: 9, end: 9.5 }];

    useProjectStore.getState().updateLineWithHistory("a0", { words: sourceWords }, { propagateToSiblings: false });

    expect(getLine("a0").words).toEqual(sourceWords);
  });

  it("still propagates structural word changes by default (option defaults to true)", () => {
    seedTwoWordSyncedInstances();

    useProjectStore.getState().updateLineWithHistory("a0", { words: MERGED_WORDS });

    expect(getLine("a1").words).toHaveLength(2);
  });

  it("works for a non-grouped line (regression)", () => {
    useProjectStore.setState({ lines: [{ id: "s", text: "standalone", agentId: "v1" }] });

    useProjectStore
      .getState()
      .updateLineWithHistory(
        "s",
        { words: [{ text: "standalone", begin: 1, end: 2 }] },
        { propagateToSiblings: false },
      );

    expect(getLine("s").words).toEqual([{ text: "standalone", begin: 1, end: 2 }]);
  });

  it("commits a single history entry that undo reverts", () => {
    seedTwoWordSyncedInstances();

    useProjectStore
      .getState()
      .updateLineWithHistory("a0", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false });
    useProjectStore.getState().undo();

    expect(getLine("a0").words).toEqual(INSTANCE_A_WORDS);
    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });
});

describe("updateLinesWithHistory · propagateToSiblings: false", () => {
  it("does not retime siblings of any line in the batch", () => {
    seedTwoWordSyncedInstances();

    useProjectStore
      .getState()
      .updateLinesWithHistory([{ id: "a0", updates: { words: [{ text: "I ", begin: 5, end: 5.4 }] } }], {
        propagateToSiblings: false,
      });

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("still propagates structural word changes by default", () => {
    seedTwoWordSyncedInstances();

    useProjectStore.getState().updateLinesWithHistory([{ id: "a0", updates: { words: MERGED_WORDS } }]);

    expect(getLine("a1").words).toHaveLength(2);
  });
});

describe("instance resync · issue #96 reproduction", () => {
  // Replays the tap-by-tap word resync that useSyncHandlers.handleTapWord
  // performs, using the real commitTappedWord helper.
  function tapResync(lineId: string, wordIndex: number, begin: number, end: number) {
    const line = getLine(lineId);
    const { parts, trailingSpace } = splitIntoWordsWithMeta(line.text);
    const text = trailingSpace[wordIndex] ? `${parts[wordIndex]} ` : parts[wordIndex];
    const updated = commitTappedWord(line.words ?? [], wordIndex, text, begin, end);
    useProjectStore
      .getState()
      .updateLineWithHistory(lineId, { words: updated }, { deriveText: false, propagateToSiblings: false });
  }

  it("resyncing instance A word-by-word leaves instance B's timing untouched", () => {
    seedTwoWordSyncedInstances();

    tapResync("a0", 0, 0.5, 0.8);
    tapResync("a0", 1, 1.0, 1.3);
    tapResync("a0", 2, 1.5, 1.8);

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("the resynced instance A keeps its full word set with the new timing", () => {
    seedTwoWordSyncedInstances();

    tapResync("a0", 0, 0.5, 0.8);
    tapResync("a0", 1, 1.0, 1.3);
    tapResync("a0", 2, 1.5, 1.8);

    expect(getLine("a0").words).toEqual([
      { text: "I ", begin: 0.5, end: 1.0 },
      { text: "love ", begin: 1.0, end: 1.5 },
      { text: "you", begin: 1.5, end: 1.8 },
    ]);
  });

  it("resyncing does not squash a third instance either", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const cWords: WordTiming[] = [
      { text: "I ", begin: 30, end: 30.6 },
      { text: "love ", begin: 30.6, end: 31.2 },
      { text: "you", begin: 31.2, end: 31.8 },
    ];
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: INSTANCE_A_WORDS.map((w) => ({ ...w })),
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: INSTANCE_B_WORDS.map((w) => ({ ...w })),
        },
        {
          id: "a2",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 2,
          templateLineIdx: 0,
          words: cWords.map((w) => ({ ...w })),
        },
      ],
    });

    tapResync("a0", 0, 0.5, 0.8);
    tapResync("a0", 1, 1.0, 1.3);
    tapResync("a0", 2, 1.5, 1.8);

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
    expect(getLine("a2").words).toEqual(cWords);
  });

  it("a single partial tap (the worst-case squash state) leaves the sibling intact", () => {
    seedTwoWordSyncedInstances();

    // Resync only word 0 and stop. Mid-resync the source array transiently
    // holds one word: this is the state that previously collapsed the sibling.
    tapResync("a0", 0, 0.5, 0.8);

    expect(getLine("a0").words).toHaveLength(1);
    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
    expect(getLine("a1").words).toHaveLength(3);
  });

  it("characterizes the bug: a resync left to propagate DOES squash the sibling", () => {
    seedTwoWordSyncedInstances();

    // The pre-fix call signature: handleTapWord passed only { deriveText: false }
    // with no opt-out, so propagation fired on the transient one-word array and
    // collapsed the sibling. This is the behavior the opt-out must prevent.
    const line = getLine("a0");
    const { parts, trailingSpace } = splitIntoWordsWithMeta(line.text);
    const text = trailingSpace[0] ? `${parts[0]} ` : parts[0];
    const updated = commitTappedWord(line.words ?? [], 0, text, 0.5, 0.8);
    useProjectStore.getState().updateLineWithHistory("a0", { words: updated }, { deriveText: false });

    expect(getLine("a1").words).toHaveLength(1);
    expect(getLine("a1").words).not.toEqual(INSTANCE_B_WORDS);
  });
});

describe("propagateToSiblings: false · edge cases", () => {
  it("leaves a detached sibling untouched", () => {
    seedTwoWordSyncedInstances();
    useProjectStore.setState((s) => ({
      lines: s.lines.map((l) => (l.id === "a1" ? { ...l, detached: true } : l)),
    }));

    useProjectStore
      .getState()
      .updateLineWithHistory("a0", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false });

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("does not throw and changes nothing for an unknown line id", () => {
    seedTwoWordSyncedInstances();

    expect(() =>
      useProjectStore.getState().updateLineWithHistory("nope", { words: [] }, { propagateToSiblings: false }),
    ).not.toThrow();
    expect(getLine("a0").words).toEqual(INSTANCE_A_WORDS);
    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("handles a single-instance group with no siblings", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "solo",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: INSTANCE_A_WORDS.map((w) => ({ ...w })),
        },
      ],
    });

    expect(() =>
      useProjectStore
        .getState()
        .updateLineWithHistory("solo", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false }),
    ).not.toThrow();
    expect(getLine("solo").words).toEqual([{ text: "I ", begin: 5, end: 5.4 }]);
  });

  it("does not touch lines belonging to a different group", () => {
    seedTwoWordSyncedInstances();
    const otherWords: WordTiming[] = [{ text: "other", begin: 50, end: 51 }];
    useProjectStore.setState((s) => ({
      lines: [
        ...s.lines,
        {
          id: "x",
          text: "other",
          agentId: "v1",
          groupId: "g2",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: otherWords.map((w) => ({ ...w })),
        },
      ],
    }));

    useProjectStore
      .getState()
      .updateLineWithHistory("a0", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false });

    expect(getLine("x").words).toEqual(otherWords);
  });

  it("leaves the sibling intact even when the sibling already diverged in word count", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const divergedB: WordTiming[] = [
      { text: "I ", begin: 10, end: 10.5 },
      { text: "love you", begin: 10.5, end: 11.5 },
    ];
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: INSTANCE_A_WORDS.map((w) => ({ ...w })),
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: divergedB.map((w) => ({ ...w })),
        },
      ],
    });

    useProjectStore
      .getState()
      .updateLineWithHistory("a0", { words: [{ text: "I ", begin: 5, end: 5.4 }] }, { propagateToSiblings: false });

    expect(getLine("a1").words).toEqual(divergedB);
  });

  it("updateLinesWithHistory opt-out does not throw on an empty batch", () => {
    seedTwoWordSyncedInstances();
    expect(() => useProjectStore.getState().updateLinesWithHistory([], { propagateToSiblings: false })).not.toThrow();
  });

  it("updateLinesWithHistory opt-out spares the siblings of every batched line", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const mk = (id: string, templateLineIdx: number, instanceIdx: number, words: WordTiming[]) => ({
      id,
      text: "I love you",
      agentId: "v1",
      groupId: "g1",
      instanceIdx,
      templateLineIdx,
      words: words.map((w) => ({ ...w })),
    });
    useProjectStore.setState({
      lines: [
        mk("t0i0", 0, 0, INSTANCE_A_WORDS),
        mk("t1i0", 1, 0, INSTANCE_A_WORDS),
        mk("t0i1", 0, 1, INSTANCE_B_WORDS),
        mk("t1i1", 1, 1, INSTANCE_B_WORDS),
      ],
    });

    useProjectStore.getState().updateLinesWithHistory(
      [
        { id: "t0i0", updates: { words: [{ text: "I ", begin: 5, end: 5.4 }] } },
        { id: "t1i0", updates: { words: [{ text: "I ", begin: 6, end: 6.4 }] } },
      ],
      { propagateToSiblings: false },
    );

    expect(getLine("t0i1").words).toEqual(INSTANCE_B_WORDS);
    expect(getLine("t1i1").words).toEqual(INSTANCE_B_WORDS);
  });
});

describe("timing nudges · do not propagate to siblings", () => {
  it("nudgeWordBegin on one instance leaves the sibling's words untouched", () => {
    seedTwoWordSyncedInstances();

    nudgeWordBegin(useProjectStore.getState().lines, 0, 1, 0.1, useProjectStore.getState().updateLineWithHistory);

    expect(getLine("a1").words).toEqual(INSTANCE_B_WORDS);
  });

  it("setWordBegin does not overwrite a sibling word whose text has diverged", () => {
    // A nudge is a pure timing edit. Before the opt-out it ran propagation,
    // and propagation's fast path would copy the source word texts onto a
    // text-diverged sibling. A timing edit must never rewrite sibling text.
    useProjectStore.setState({
      groups: [seedGroup("g1")],
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: INSTANCE_A_WORDS.map((w) => ({ ...w })),
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 10, end: 10.5 },
            { text: "LOVE ", begin: 10.5, end: 11.0 },
            { text: "you", begin: 11.0, end: 11.5 },
          ],
        },
      ],
      isDirtySinceHistory: true,
    });

    setWordBegin(useProjectStore.getState().lines, 0, 0, 0.2, useProjectStore.getState().updateLineWithHistory);

    expect(getLine("a1").words?.[1].text).toBe("LOVE ");
  });

  it("nudgeLineBegin on one line-synced instance leaves the sibling's bounds untouched", () => {
    useProjectStore.setState({
      groups: [seedGroup("g1")],
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          begin: 30,
          end: 32,
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          begin: 60,
          end: 62,
        },
      ],
      isDirtySinceHistory: true,
    });

    nudgeLineBegin(useProjectStore.getState().lines, 0, 0.5, useProjectStore.getState().updateLineWithHistory);

    expect(getLine("a1").begin).toBe(60);
    expect(getLine("a1").end).toBe(62);
  });
});
