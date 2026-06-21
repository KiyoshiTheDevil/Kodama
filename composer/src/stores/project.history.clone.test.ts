/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "@/stores/project";

// Pins the contract that history snapshots round-trip cleanly through whatever
// deep-clone primitive project.ts uses. Pre-Task-3.3 the codebase used
// JSON.parse(JSON.stringify(...)); after, structuredClone. Both should:
//   - preserve nested arrays and objects (lines, words, groups)
//   - drop undefined fields (both clone strategies behave the same here)
//   - restore the prior state exactly on undo

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
});

describe("history snapshot deep-clone integrity", () => {
  it("undo restores nested word arrays without aliasing the post-state", () => {
    const store = useProjectStore.getState();
    store.setLinesWithHistory([
      {
        id: "L1",
        text: "hello",
        agentId: "v1",
        words: [{ text: "hello", begin: 0, end: 1 }],
      },
    ]);
    store.updateLineWithHistory("L1", { words: [{ text: "hello!", begin: 0, end: 1 }] });
    const beforeUndo = useProjectStore.getState().lines[0].words?.[0].text;
    expect(beforeUndo).toBe("hello!");
    store.undo();
    expect(useProjectStore.getState().lines[0].words?.[0].text).toBe("hello");
    // Mutate the restored state object and confirm the next undo entry is
    // still independent (the clone wasn't a shallow alias).
    const restored = useProjectStore.getState().lines[0].words;
    if (restored) restored[0].text = "MUTATED";
    store.redo();
    expect(useProjectStore.getState().lines[0].words?.[0].text).toBe("hello!");
  });

  it("undo restores groups[] alongside lines[]", () => {
    const store = useProjectStore.getState();
    store.addGroupWithLines({ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }, [
      {
        id: "L1",
        text: "x",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
      },
    ]);
    expect(useProjectStore.getState().groups).toHaveLength(1);
    store.removeGroup("g1");
    expect(useProjectStore.getState().groups).toHaveLength(0);
    store.undo();
    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().groups[0].label).toBe("Chorus");
  });

  it("undo and redo preserve identity of nested structures across multiple steps", () => {
    const store = useProjectStore.getState();
    store.setLinesWithHistory([
      {
        id: "A",
        text: "a",
        agentId: "v1",
        words: [
          { text: "a ", begin: 0, end: 0.5 },
          { text: "b", begin: 0.5, end: 1 },
        ],
      },
    ]);
    store.updateLineWithHistory("A", { words: [{ text: "ab", begin: 0, end: 1 }] });
    store.updateLineWithHistory("A", { words: [{ text: "ABC", begin: 0, end: 1 }] });
    store.undo();
    expect(useProjectStore.getState().lines[0].words?.[0].text).toBe("ab");
    store.undo();
    expect(useProjectStore.getState().lines[0].words?.length).toBe(2);
    store.redo();
    expect(useProjectStore.getState().lines[0].words?.[0].text).toBe("ab");
    store.redo();
    expect(useProjectStore.getState().lines[0].words?.[0].text).toBe("ABC");
  });
});
