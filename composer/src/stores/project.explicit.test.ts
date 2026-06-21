/**
 * @vitest-environment node
 */
import { useProjectStore } from "@/stores/project";
import type { LineTemplate, LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
});

function seedSingleLine(line: LyricLine) {
  useProjectStore.getState().setLines([line]);
}

describe("toggleWordExplicit · single line", () => {
  it("sets explicit: true on a previously unmarked word", () => {
    seedSingleLine({
      id: "L1",
      text: "I fuck you",
      agentId: "v1",
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "fuck ", begin: 0.3, end: 0.6 },
        { text: "you", begin: 0.6, end: 1 },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [1]);
    const updated = useProjectStore.getState().lines[0];
    expect(updated.words![0].explicit).toBeUndefined();
    expect(updated.words![1].explicit).toBe(true);
    expect(updated.words![2].explicit).toBeUndefined();
  });

  it("removes the explicit key (does not store false) when toggling a marked word", () => {
    seedSingleLine({
      id: "L1",
      text: "fuck",
      agentId: "v1",
      words: [{ text: "fuck", begin: 0, end: 1, explicit: true }],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [0]);
    const word = useProjectStore.getState().lines[0].words![0];
    expect("explicit" in word).toBe(false);
  });

  it("marks all targeted words when at least one is unmarked", () => {
    seedSingleLine({
      id: "L1",
      text: "a b c",
      agentId: "v1",
      words: [
        { text: "a ", begin: 0, end: 0.3 },
        { text: "b ", begin: 0.3, end: 0.6, explicit: true },
        { text: "c", begin: 0.6, end: 1 },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [0, 1, 2]);
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[0].explicit).toBe(true);
    expect(words[1].explicit).toBe(true);
    expect(words[2].explicit).toBe(true);
  });

  it("unmarks all targeted words when every one is already marked", () => {
    seedSingleLine({
      id: "L1",
      text: "a b c",
      agentId: "v1",
      words: [
        { text: "a ", begin: 0, end: 0.3, explicit: true },
        { text: "b ", begin: 0.3, end: 0.6, explicit: true },
        { text: "c", begin: 0.6, end: 1 },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [0, 1]);
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[1].explicit).toBeUndefined();
  });

  it("operates on backgroundWords when field='backgroundWords'", () => {
    seedSingleLine({
      id: "L1",
      text: "main",
      agentId: "v1",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "oh shit",
      backgroundWords: [
        { text: "oh ", begin: 1, end: 1.25 },
        { text: "shit", begin: 1.25, end: 1.5 },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "backgroundWords", [1]);
    const line = useProjectStore.getState().lines[0];
    expect(line.words![0].explicit).toBeUndefined();
    expect(line.backgroundWords![0].explicit).toBeUndefined();
    expect(line.backgroundWords![1].explicit).toBe(true);
  });
});

describe("toggleWordExplicit · linked-line propagation", () => {
  function seedLinkedGroup() {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "fuck ", begin: 0.3, end: 0.6 },
          { text: "you", begin: 0.6, end: 1 },
        ],
      },
      {
        id: "B",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.4 },
          { text: "fuck ", begin: 30.4, end: 30.7 },
          { text: "you", begin: 30.7, end: 31.2 },
        ],
      },
    ]);
  }

  it("propagates the flag to linked siblings while preserving sibling timing", () => {
    seedLinkedGroup();
    useProjectStore.getState().toggleWordExplicit("A", "words", [1]);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![1].explicit).toBe(true);
    expect(lines[1].words![1].explicit).toBe(true);
    expect(lines[1].words![1].begin).toBeCloseTo(30.4);
    expect(lines[1].words![1].end).toBeCloseTo(30.7);
  });

  it("does not propagate to detached siblings", () => {
    seedLinkedGroup();
    useProjectStore
      .getState()
      .setLines(useProjectStore.getState().lines.map((l) => (l.id === "B" ? { ...l, detached: true } : l)));
    useProjectStore.getState().toggleWordExplicit("A", "words", [1]);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![1].explicit).toBe(true);
    expect(lines[1].words![1].explicit).toBeUndefined();
  });

  it("clears the flag on siblings when source unmarks", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "fuck ", begin: 0.3, end: 0.6, explicit: true },
          { text: "you", begin: 0.6, end: 1 },
        ],
      },
      {
        id: "B",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.4 },
          { text: "fuck ", begin: 30.4, end: 30.7, explicit: true },
          { text: "you", begin: 30.7, end: 31.2 },
        ],
      },
    ]);
    useProjectStore.getState().toggleWordExplicit("A", "words", [1]);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![1].explicit).toBeUndefined();
    expect(lines[1].words![1].explicit).toBeUndefined();
  });
});

describe("addInstance · template materialization carries explicit", () => {
  it("carries explicit from WordTemplate onto the materialized WordTiming (words)", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    const structure: LineTemplate[] = [
      {
        text: "I fuck you",
        agentId: "v1",
        relativeBegin: 0,
        relativeEnd: 1,
        words: [
          { text: "I ", relativeBegin: 0, relativeEnd: 0.3 },
          { text: "fuck ", relativeBegin: 0.3, relativeEnd: 0.6, explicit: true },
          { text: "you", relativeBegin: 0.6, relativeEnd: 1 },
        ],
      },
    ];
    useProjectStore.getState().addInstance("g1", structure, 30);
    const line = useProjectStore.getState().lines.find((l) => l.groupId === "g1");
    expect(line).toBeDefined();
    expect(line!.words![0].explicit).toBeUndefined();
    expect(line!.words![1].explicit).toBe(true);
    expect(line!.words![1].begin).toBeCloseTo(30.3);
    expect(line!.words![2].explicit).toBeUndefined();
  });

  it("carries explicit from WordTemplate onto backgroundWords", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    const structure: LineTemplate[] = [
      {
        text: "main",
        agentId: "v1",
        relativeBegin: 0,
        relativeEnd: 1,
        words: [{ text: "main", relativeBegin: 0, relativeEnd: 1 }],
        backgroundText: "oh shit",
        backgroundWords: [
          { text: "oh ", relativeBegin: 0, relativeEnd: 0.5 },
          { text: "shit", relativeBegin: 0.5, relativeEnd: 1, explicit: true },
        ],
      },
    ];
    useProjectStore.getState().addInstance("g1", structure, 10);
    const line = useProjectStore.getState().lines.find((l) => l.groupId === "g1");
    expect(line!.backgroundWords![0].explicit).toBeUndefined();
    expect(line!.backgroundWords![1].explicit).toBe(true);
    expect(line!.backgroundWords![1].begin).toBeCloseTo(10.5);
  });
});

describe("toggleWordExplicit · history", () => {
  it("creates a history entry so undo restores the previous flag state", () => {
    seedSingleLine({
      id: "L1",
      text: "fuck",
      agentId: "v1",
      words: [{ text: "fuck", begin: 0, end: 1 }],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [0]);
    expect(useProjectStore.getState().lines[0].words![0].explicit).toBe(true);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].words![0].explicit).toBeUndefined();
  });
});

describe("toggleWordExplicit · syllable expansion (issue #62)", () => {
  it("marks every syllable of a multi-syllable word when one syllable is targeted", () => {
    seedSingleLine({
      id: "L1",
      text: "I fu|cking love it",
      agentId: "v1",
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "fu", begin: 0.3, end: 0.4 },
        { text: "cking ", begin: 0.4, end: 0.6 },
        { text: "love ", begin: 0.6, end: 0.8 },
        { text: "it", begin: 0.8, end: 1 },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [1]);
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[1].explicit).toBe(true);
    expect(words[2].explicit).toBe(true);
    expect(words[0].explicit).toBeUndefined();
    expect(words[3].explicit).toBeUndefined();
  });

  it("unmarks every syllable of a multi-syllable word when all are marked", () => {
    seedSingleLine({
      id: "L1",
      text: "fu|cking",
      agentId: "v1",
      words: [
        { text: "fu", begin: 0, end: 0.5, explicit: true },
        { text: "cking", begin: 0.5, end: 1, explicit: true },
      ],
    });
    useProjectStore.getState().toggleWordExplicit("L1", "words", [1]);
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[1].explicit).toBeUndefined();
  });

  it("expansion propagates to every syllable on linked siblings", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "fu|cking yeah",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "fu", begin: 0, end: 0.2 },
          { text: "cking ", begin: 0.2, end: 0.5 },
          { text: "yeah", begin: 0.5, end: 1 },
        ],
      },
      {
        id: "B",
        text: "fu|cking yeah",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "fu", begin: 30, end: 30.2 },
          { text: "cking ", begin: 30.2, end: 30.5 },
          { text: "yeah", begin: 30.5, end: 31 },
        ],
      },
    ]);
    useProjectStore.getState().toggleWordExplicit("A", "words", [0]);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![0].explicit).toBe(true);
    expect(lines[0].words![1].explicit).toBe(true);
    expect(lines[1].words![0].explicit).toBe(true);
    expect(lines[1].words![1].explicit).toBe(true);
  });
});

describe("markWordsExplicit · syllable + batch (issue #62)", () => {
  it("expands a single syllable target to the whole word", () => {
    seedSingleLine({
      id: "L1",
      text: "fu|cking yeah",
      agentId: "v1",
      words: [
        { text: "fu", begin: 0, end: 0.2 },
        { text: "cking ", begin: 0.2, end: 0.5 },
        { text: "yeah", begin: 0.5, end: 1 },
      ],
    });
    useProjectStore.getState().markWordsExplicit([{ lineId: "L1", field: "words", wordIndex: 0 }], true);
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[0].explicit).toBe(true);
    expect(words[1].explicit).toBe(true);
    expect(words[2].explicit).toBeUndefined();
  });

  it("preserves a previously-set explicit flag on another word when batch-marking across linked siblings", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "fuck this shit",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "fuck ", begin: 0, end: 0.3 },
          { text: "this ", begin: 0.3, end: 0.6 },
          { text: "shit", begin: 0.6, end: 1, explicit: true },
        ],
      },
      {
        id: "B",
        text: "fuck this shit",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "fuck ", begin: 30, end: 30.3 },
          { text: "this ", begin: 30.3, end: 30.6 },
          { text: "shit", begin: 30.6, end: 31, explicit: true },
        ],
      },
    ]);
    useProjectStore.getState().markWordsExplicit(
      [
        { lineId: "A", field: "words", wordIndex: 0 },
        { lineId: "B", field: "words", wordIndex: 0 },
      ],
      true,
    );
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![0].explicit).toBe(true);
    expect(lines[0].words![2].explicit).toBe(true);
    expect(lines[1].words![0].explicit).toBe(true);
    expect(lines[1].words![2].explicit).toBe(true);
  });
});

describe("toggleWordExplicit · background provenance", () => {
  function seedExtractionBgLine() {
    seedSingleLine({
      id: "L1",
      text: "main",
      agentId: "v1",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "oh shit",
      backgroundTextSource: "extraction",
      backgroundWords: [
        { text: "oh ", begin: 1, end: 1.25 },
        { text: "shit", begin: 1.25, end: 1.5 },
      ],
    });
  }

  it("flips backgroundTextSource to manual after a background-word edit", () => {
    seedExtractionBgLine();
    useProjectStore.getState().toggleWordExplicit("L1", "backgroundWords", [1]);
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("manual");
    expect(line.backgroundWords![1].explicit).toBe(true);
    expect(line.backgroundWords![0].explicit).toBeUndefined();
    expect(line.backgroundText).toBe("oh shit");
  });

  it("leaves backgroundTextSource untouched when editing the main words field", () => {
    seedExtractionBgLine();
    useProjectStore.getState().toggleWordExplicit("L1", "words", [0]);
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("extraction");
    expect(line.words![0].explicit).toBe(true);
  });

  it("flips linked siblings to manual when a background-word edit propagates", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "oh shit",
        backgroundTextSource: "extraction",
        backgroundWords: [
          { text: "oh ", begin: 1, end: 1.25 },
          { text: "shit", begin: 1.25, end: 1.5 },
        ],
      },
      {
        id: "B",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 30, end: 31 }],
        backgroundText: "oh shit",
        backgroundTextSource: "extraction",
        backgroundWords: [
          { text: "oh ", begin: 31, end: 31.25 },
          { text: "shit", begin: 31.25, end: 31.5 },
        ],
      },
    ]);
    useProjectStore.getState().toggleWordExplicit("A", "backgroundWords", [1]);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].backgroundTextSource).toBe("manual");
    expect(lines[1].backgroundTextSource).toBe("manual");
    expect(lines[0].backgroundWords![1].explicit).toBe(true);
    expect(lines[1].backgroundWords![1].explicit).toBe(true);
    expect(lines[1].backgroundWords![1].begin).toBeCloseTo(31.25);
  });

  it("undo restores the prior extraction provenance", () => {
    seedExtractionBgLine();
    useProjectStore.getState().toggleWordExplicit("L1", "backgroundWords", [1]);
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("manual");
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });
});

describe("markWordsExplicit · background provenance", () => {
  it("flips backgroundTextSource to manual after a background-word edit", () => {
    seedSingleLine({
      id: "L1",
      text: "main",
      agentId: "v1",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "oh shit",
      backgroundTextSource: "extraction",
      backgroundWords: [
        { text: "oh ", begin: 1, end: 1.25 },
        { text: "shit", begin: 1.25, end: 1.5 },
      ],
    });
    useProjectStore.getState().markWordsExplicit([{ lineId: "L1", field: "backgroundWords", wordIndex: 0 }], true);
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("manual");
    expect(line.backgroundWords![0].explicit).toBe(true);
    expect(line.backgroundText).toBe("oh shit");
  });

  it("leaves backgroundTextSource untouched when marking the main words field", () => {
    seedSingleLine({
      id: "L1",
      text: "main",
      agentId: "v1",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "oh shit",
      backgroundTextSource: "extraction",
      backgroundWords: [
        { text: "oh ", begin: 1, end: 1.25 },
        { text: "shit", begin: 1.25, end: 1.5 },
      ],
    });
    useProjectStore.getState().markWordsExplicit([{ lineId: "L1", field: "words", wordIndex: 0 }], true);
    const line = useProjectStore.getState().lines[0];
    expect(line.backgroundTextSource).toBe("extraction");
    expect(line.words![0].explicit).toBe(true);
  });

  it("flips linked siblings to manual when a background-word edit propagates", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "oh shit",
        backgroundTextSource: "extraction",
        backgroundWords: [
          { text: "oh ", begin: 1, end: 1.25 },
          { text: "shit", begin: 1.25, end: 1.5 },
        ],
      },
      {
        id: "B",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 30, end: 31 }],
        backgroundText: "oh shit",
        backgroundTextSource: "extraction",
        backgroundWords: [
          { text: "oh ", begin: 31, end: 31.25 },
          { text: "shit", begin: 31.25, end: 31.5 },
        ],
      },
    ]);
    useProjectStore.getState().markWordsExplicit([{ lineId: "A", field: "backgroundWords", wordIndex: 0 }], true);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].backgroundTextSource).toBe("manual");
    expect(lines[1].backgroundTextSource).toBe("manual");
    expect(lines[0].backgroundWords![0].explicit).toBe(true);
    expect(lines[1].backgroundWords![0].explicit).toBe(true);
  });
});

describe("markWordsExplicit · batch action", () => {
  it("applies multiple targets in a single history entry so one undo reverts them all", () => {
    useProjectStore.getState().setLines([
      {
        id: "L1",
        text: "fuck this",
        agentId: "v1",
        words: [
          { text: "fuck ", begin: 0, end: 0.5 },
          { text: "this", begin: 0.5, end: 1 },
        ],
      },
      {
        id: "L2",
        text: "shit happens",
        agentId: "v1",
        words: [
          { text: "shit ", begin: 1, end: 1.5 },
          { text: "happens", begin: 1.5, end: 2 },
        ],
      },
      {
        id: "L3",
        text: "damn cool",
        agentId: "v1",
        words: [
          { text: "damn ", begin: 2, end: 2.5 },
          { text: "cool", begin: 2.5, end: 3 },
        ],
      },
    ]);

    useProjectStore.getState().markWordsExplicit(
      [
        { lineId: "L1", field: "words", wordIndex: 0 },
        { lineId: "L2", field: "words", wordIndex: 0 },
        { lineId: "L3", field: "words", wordIndex: 0 },
      ],
      true,
    );

    const after = useProjectStore.getState().lines;
    expect(after[0].words![0].explicit).toBe(true);
    expect(after[1].words![0].explicit).toBe(true);
    expect(after[2].words![0].explicit).toBe(true);

    useProjectStore.getState().undo();
    const undone = useProjectStore.getState().lines;
    expect(undone[0].words![0].explicit).toBeUndefined();
    expect(undone[1].words![0].explicit).toBeUndefined();
    expect(undone[2].words![0].explicit).toBeUndefined();
  });

  it("propagates to linked siblings for each target", () => {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines([
      {
        id: "A",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "fuck ", begin: 0.3, end: 0.6 },
          { text: "you", begin: 0.6, end: 1 },
        ],
      },
      {
        id: "B",
        text: "I fuck you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.4 },
          { text: "fuck ", begin: 30.4, end: 30.7 },
          { text: "you", begin: 30.7, end: 31.2 },
        ],
      },
    ]);

    useProjectStore.getState().markWordsExplicit([{ lineId: "A", field: "words", wordIndex: 1 }], true);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words![1].explicit).toBe(true);
    expect(lines[1].words![1].explicit).toBe(true);
  });

  it("is a no-op when targets is empty", () => {
    seedSingleLine({
      id: "L1",
      text: "fuck",
      agentId: "v1",
      words: [{ text: "fuck", begin: 0, end: 1 }],
    });
    const before = useProjectStore.getState().lines;
    useProjectStore.getState().markWordsExplicit([], true);
    expect(useProjectStore.getState().lines).toBe(before);
  });

  it("can clear flags when value=false", () => {
    seedSingleLine({
      id: "L1",
      text: "fuck this",
      agentId: "v1",
      words: [
        { text: "fuck ", begin: 0, end: 0.5, explicit: true },
        { text: "this", begin: 0.5, end: 1, explicit: true },
      ],
    });
    useProjectStore.getState().markWordsExplicit(
      [
        { lineId: "L1", field: "words", wordIndex: 0 },
        { lineId: "L1", field: "words", wordIndex: 1 },
      ],
      false,
    );
    const words = useProjectStore.getState().lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[1].explicit).toBeUndefined();
  });
});
