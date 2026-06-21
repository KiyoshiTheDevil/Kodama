/**
 * @vitest-environment node
 */
import { useProjectStore } from "@/stores/project";
import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
});

function seedMainLine(overrides: Partial<LooseLine> = {}): LyricLine {
  return reconcileLine({
    id: "line-1",
    text: "ev er y world",
    agentId: "v1",
    words: [
      { text: "ev ", begin: 0, end: 0.3 },
      { text: "er ", begin: 0.3, end: 0.6 },
      { text: "y ", begin: 0.6, end: 0.9 },
      { text: "world", begin: 0.9, end: 1.5 },
    ],
    ...overrides,
  });
}

// -- mergeSyllableGroupIntoWord ------------------------------------------------

describe("mergeSyllableGroupIntoWord", () => {
  function seedGroupedLine(): LyricLine {
    return {
      id: "line-1",
      text: "beautiful",
      agentId: "v1",
      words: [
        { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "ti", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
        { text: "ful", begin: 0.6, end: 0.9, syllableGroupId: "g1" },
      ],
    };
  }

  it("collapses a syllable group into one word", () => {
    useProjectStore.getState().setLines([seedGroupedLine()]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0, 1, 2]);
    const words = useProjectStore.getState().lines[0].words ?? [];
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe("beautiful");
    expect(words[0].begin).toBe(0);
    expect(words[0].end).toBe(0.9);
    expect(words[0].syllableGroupId).toBeUndefined();
  });

  it("collapses the whole group when only one syllable is selected", () => {
    useProjectStore.getState().setLines([seedGroupedLine()]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [1]);
    const words = useProjectStore.getState().lines[0].words ?? [];
    expect(words.map((w) => w.text)).toEqual(["beautiful"]);
  });

  it("syncs line.text to the collapsed words", () => {
    useProjectStore.getState().setLines([seedGroupedLine()]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0]);
    expect(useProjectStore.getState().lines[0].text).toBe("beautiful");
  });

  it("leaves non-grouped words untouched and is a no-op on a non-grouped selection", () => {
    useProjectStore.getState().setLines([seedMainLine()]);
    const before = useProjectStore.getState().lines[0];
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0, 1]);
    expect(useProjectStore.getState().lines[0]).toBe(before);
  });

  it("collapses two groups touched by one multi-selection", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "abcd",
        agentId: "v1",
        words: [
          { text: "a", begin: 0, end: 0.1, syllableGroupId: "g1" },
          { text: "b", begin: 0.1, end: 0.2, syllableGroupId: "g1" },
          { text: "c", begin: 0.2, end: 0.3, syllableGroupId: "g2" },
          { text: "d", begin: 0.3, end: 0.4, syllableGroupId: "g2" },
        ],
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0, 3]);
    expect((useProjectStore.getState().lines[0].words ?? []).map((w) => w.text)).toEqual(["ab", "cd"]);
  });

  it("works on the background track and syncs backgroundText", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b1" },
          { text: "oh", begin: 1.2, end: 1.5, syllableGroupId: "b1" },
        ],
        backgroundText: "ooh",
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "backgroundWords", [0, 1]);
    const line = useProjectStore.getState().lines[0];
    expect((line.backgroundWords ?? []).map((w) => w.text)).toEqual(["oooh"]);
    expect(line.backgroundText).toBe("oooh");
  });

  it("is undoable", () => {
    useProjectStore.getState().setLines([seedGroupedLine()]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0, 1, 2]);
    expect(useProjectStore.getState().canUndo()).toBe(true);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].words ?? []).toHaveLength(3);
  });
});

describe("mergeSyllableGroupIntoWord · linked propagation", () => {
  function seedTwoLinkedInstances() {
    useProjectStore.getState().addGroup({ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 });
    useProjectStore.getState().setLines([
      {
        id: "a0",
        text: "every",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g_a0" },
          { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g_a0" },
          { text: "y", begin: 0.6, end: 1, syllableGroupId: "g_a0" },
        ],
      },
      {
        id: "a1",
        text: "every",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "ev", begin: 10, end: 10.3, syllableGroupId: "g_a1" },
          { text: "er", begin: 10.3, end: 10.6, syllableGroupId: "g_a1" },
          { text: "y", begin: 10.6, end: 11, syllableGroupId: "g_a1" },
        ],
      },
    ]);
  }

  it("collapses the group on every linked sibling", () => {
    seedTwoLinkedInstances();
    useProjectStore.getState().mergeSyllableGroupIntoWord("a0", "words", [0, 1, 2]);

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");
    expect(a0?.words?.map((w) => w.text)).toEqual(["every"]);
    expect(a1?.words?.map((w) => w.text)).toEqual(["every"]);
  });
});

describe("mergeSyllableGroupIntoWord · background provenance", () => {
  it("flips backgroundTextSource to manual after a background-track merge", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b1" },
          { text: "oh", begin: 1.2, end: 1.5, syllableGroupId: "b1" },
        ],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "backgroundWords", [0, 1]);
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("manual");
    expect((line.backgroundWords ?? []).map((w) => w.text)).toEqual(["oooh"]);
  });

  it("leaves backgroundTextSource untouched when merging the main track", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "beautiful",
        agentId: "v1",
        words: [
          { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g1" },
          { text: "ti", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
          { text: "ful", begin: 0.6, end: 0.9, syllableGroupId: "g1" },
        ],
        backgroundWords: [{ text: "ooh", begin: 1, end: 1.5 }],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "words", [0, 1, 2]);
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });

  it("flips linked siblings to manual when a background-track merge propagates", () => {
    useProjectStore.getState().addGroup({ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 });
    useProjectStore.getState().setLines([
      {
        id: "a0",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b_a0" },
          { text: "oh", begin: 1.2, end: 1.5, syllableGroupId: "b_a0" },
        ],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
      {
        id: "a1",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 10, end: 11 }],
        backgroundWords: [
          { text: "oo", begin: 11, end: 11.2, syllableGroupId: "b_a1" },
          { text: "oh", begin: 11.2, end: 11.5, syllableGroupId: "b_a1" },
        ],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("a0", "backgroundWords", [0, 1]);
    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.backgroundTextSource).toBe("manual");
    expect(lines.find((l) => l.id === "a1")?.backgroundTextSource).toBe("manual");
    expect(lines.find((l) => l.id === "a1")?.backgroundWords?.map((w) => w.text)).toEqual(["oooh"]);
  });

  it("undo restores the prior extraction provenance", () => {
    useProjectStore.getState().setLinesWithHistory([
      {
        id: "line-1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b1" },
          { text: "oh", begin: 1.2, end: 1.5, syllableGroupId: "b1" },
        ],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);
    useProjectStore.getState().mergeSyllableGroupIntoWord("line-1", "backgroundWords", [0, 1]);
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("manual");
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });
});

// -- snapSyllablesFlush -------------------------------------------------------

describe("snapSyllablesFlush", () => {
  function seedGappedGroupLine(): LyricLine {
    return {
      id: "line-1",
      text: "beautiful",
      agentId: "v1",
      words: [
        { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g1" },
        { text: "ti", begin: 0.5, end: 0.8, syllableGroupId: "g1" },
        { text: "ful", begin: 1.0, end: 1.3, syllableGroupId: "g1" },
      ],
    };
  }

  it("closes internal gaps by extending each earlier syllable's end to the next begin", () => {
    useProjectStore.getState().setLines([seedGappedGroupLine()]);

    useProjectStore.getState().snapSyllablesFlush("line-1", "words");

    const words = useProjectStore.getState().lines[0].words ?? [];
    expect(words[0].end).toBe(words[1].begin);
    expect(words[1].end).toBe(words[2].begin);
    expect(words[0].begin).toBe(0);
    expect(words[1].begin).toBe(0.5);
    expect(words[2].begin).toBe(1.0);
    expect(words[2].end).toBe(1.3);
  });

  it("is a no-op when the line has no syllable group", () => {
    useProjectStore.getState().setLines([seedMainLine()]);
    const before = useProjectStore.getState().lines[0];

    useProjectStore.getState().snapSyllablesFlush("line-1", "words");

    expect(useProjectStore.getState().lines[0]).toBe(before);
  });

  it("is a no-op when the syllable group is already flush", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "beautiful",
        agentId: "v1",
        words: [
          { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g1" },
          { text: "ti", begin: 0.3, end: 0.6, syllableGroupId: "g1" },
          { text: "ful", begin: 0.6, end: 0.9, syllableGroupId: "g1" },
        ],
      },
    ]);
    const before = useProjectStore.getState().lines[0];

    useProjectStore.getState().snapSyllablesFlush("line-1", "words");

    expect(useProjectStore.getState().lines[0]).toBe(before);
  });

  it("works on the background track", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b1" },
          { text: "oh", begin: 1.5, end: 1.7, syllableGroupId: "b1" },
        ],
        backgroundText: "oooh",
      },
    ]);

    useProjectStore.getState().snapSyllablesFlush("line-1", "backgroundWords");

    const bg = useProjectStore.getState().lines[0].backgroundWords ?? [];
    expect(bg[0].end).toBe(bg[1].begin);
    expect(bg[0].begin).toBe(1);
    expect(bg[1].begin).toBe(1.5);
  });

  it("does not touch a linked sibling", () => {
    useProjectStore.getState().addGroup({ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 });
    useProjectStore.getState().setLines([
      {
        id: "a0",
        text: "beau|ti|ful",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g_a0" },
          { text: "ti", begin: 0.5, end: 0.8, syllableGroupId: "g_a0" },
          { text: "ful", begin: 1.0, end: 1.3, syllableGroupId: "g_a0" },
        ],
      },
      {
        id: "a1",
        text: "beau|ti|ful",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "beau", begin: 10, end: 10.3, syllableGroupId: "g_a1" },
          { text: "ti", begin: 10.5, end: 10.8, syllableGroupId: "g_a1" },
          { text: "ful", begin: 11.0, end: 11.3, syllableGroupId: "g_a1" },
        ],
      },
    ]);
    const a1Before = useProjectStore.getState().lines.find((l) => l.id === "a1");

    useProjectStore.getState().snapSyllablesFlush("a0", "words");

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");
    const a0Words = a0?.words ?? [];
    expect(a0Words[0].end).toBe(a0Words[1].begin);
    expect(a0Words[1].end).toBe(a0Words[2].begin);
    expect(a1).toBe(a1Before);
  });

  it("is undoable", () => {
    useProjectStore.getState().setLines([seedGappedGroupLine()]);
    const before = useProjectStore.getState().lines[0].words?.map((w) => ({ begin: w.begin, end: w.end }));

    useProjectStore.getState().snapSyllablesFlush("line-1", "words");
    expect(useProjectStore.getState().canUndo()).toBe(true);

    useProjectStore.getState().undo();
    const restored = useProjectStore.getState().lines[0].words?.map((w) => ({ begin: w.begin, end: w.end }));
    expect(restored).toEqual(before);
  });
});

describe("snapSyllablesFlush · background provenance", () => {
  function seedGappedBgLine() {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundWords: [
          { text: "oo", begin: 1, end: 1.2, syllableGroupId: "b1" },
          { text: "oh", begin: 1.5, end: 1.7, syllableGroupId: "b1" },
        ],
        backgroundText: "oooh",
        backgroundTextSource: "extraction",
      },
    ]);
  }

  it("flips backgroundTextSource to manual after a background-track snap", () => {
    seedGappedBgLine();
    useProjectStore.getState().snapSyllablesFlush("line-1", "backgroundWords");
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("manual");
    expect(line.backgroundWords?.[0].end).toBe(line.backgroundWords?.[1].begin);
    expect(line.backgroundText).toBe("oo|oh");
  });

  it("leaves backgroundTextSource untouched when snapping the main track", () => {
    useProjectStore.getState().setLines([
      {
        id: "line-1",
        text: "beautiful",
        agentId: "v1",
        words: [
          { text: "beau", begin: 0, end: 0.3, syllableGroupId: "g1" },
          { text: "ti", begin: 0.5, end: 0.8, syllableGroupId: "g1" },
          { text: "ful", begin: 1.0, end: 1.3, syllableGroupId: "g1" },
        ],
        backgroundWords: [{ text: "ooh", begin: 2, end: 2.5 }],
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);
    useProjectStore.getState().snapSyllablesFlush("line-1", "words");
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });

  it("undo restores the prior extraction provenance", () => {
    seedGappedBgLine();
    useProjectStore.getState().clearHistory();
    useProjectStore.getState().snapSyllablesFlush("line-1", "backgroundWords");
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("manual");
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });
});
