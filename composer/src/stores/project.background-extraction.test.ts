/**
 * @vitest-environment node
 */
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { type LooseLine, reconcileLine } from "@/domain/line/model";
import { useProjectStore } from "@/stores/project";
import { extractInlineFromLine } from "@/utils/background-vocal-extraction";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
});

const CHORUS_GROUP = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 } as const;

// -- Per-line "Pull from ( )" action through the real store -------------------
//
// Replicates handleExtractLine from src/views/edit.tsx: classify the target
// line, extract its inline parentheses, and write { text, words, backgroundText }
// via updateLineWithHistory. The reviewer claimed this desyncs linked instance
// siblings. These tests run the real mutator and assert siblings stay in sync.

describe("project store · background extraction on linked lines", () => {
  function seedLinkedChorus(lines: LooseLine[]) {
    useProjectStore.setState({ groups: [CHORUS_GROUP], lines: lines.map(reconcileLine) });
    useProjectStore.getState().clearHistory();
  }

  function applyPullFromParens(lineId: string) {
    const target = useProjectStore.getState().lines.find((l) => l.id === lineId);
    if (!target) throw new Error(`line ${lineId} not found`);
    const extracted = extractInlineFromLine(target, { mergeStandaloneLines: false, preserveBrackets: false });
    useProjectStore.getState().updateLineWithHistory(target.id, {
      text: extracted.text,
      words: extracted.words,
      backgroundText: extracted.backgroundText,
    });
  }

  it("propagates an untimed inline extraction to the linked sibling", () => {
    seedLinkedChorus([
      { id: "a0", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "a1", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ]);

    applyPullFromParens("a0");

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");

    expect(a0?.text).toBe("Hello");
    expect(a0?.backgroundText).toBe("ooh");
    expect(a1?.text).toBe("Hello");
    expect(a1?.backgroundText).toBe("ooh");
    expect(a0?.text).not.toContain("(");
    expect(a1?.text).not.toContain("(");
  });

  it("keeps link metadata on both siblings after an untimed extraction", () => {
    seedLinkedChorus([
      { id: "a0", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "a1", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ]);

    applyPullFromParens("a0");

    const lines = useProjectStore.getState().lines;
    for (const id of ["a0", "a1"]) {
      const line = lines.find((l) => l.id === id);
      expect(line?.groupId).toBe("g1");
      expect(line?.templateLineIdx).toBe(0);
    }
    expect(lines.find((l) => l.id === "a0")?.instanceIdx).toBe(0);
    expect(lines.find((l) => l.id === "a1")?.instanceIdx).toBe(1);
  });

  it("propagates a word-synced inline extraction to the linked sibling, preserving sibling timing", () => {
    seedLinkedChorus([
      {
        id: "a0",
        text: "Hello (ooh)",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "Hello ", begin: 0, end: 1 },
          { text: "(ooh)", begin: 1, end: 2 },
        ],
      },
      {
        id: "a1",
        text: "Hello (ooh)",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "Hello ", begin: 30, end: 31.5 },
          { text: "(ooh)", begin: 31.5, end: 33 },
        ],
      },
    ]);

    applyPullFromParens("a0");

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");

    expect(a0?.text).toBe("Hello");
    expect(a1?.text).toBe("Hello");
    expect(a0?.backgroundText).toBe("ooh");
    expect(a1?.backgroundText).toBe("ooh");

    expect(a0?.words?.map((w) => w.text)).toEqual(["Hello"]);
    expect(a1?.words?.map((w) => w.text)).toEqual(["Hello"]);

    expect(a0?.words?.[0].begin).toBe(0);
    expect(a0?.words?.[0].end).toBe(1);
    expect(a1?.words?.[0].begin).toBe(30);
    expect(a1?.words?.[0].end).toBe(31.5);
  });

  it("leaves a detached sibling untouched when extracting on the source", () => {
    seedLinkedChorus([
      { id: "a0", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      {
        id: "a1",
        text: "Hello (ooh)",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        detached: true,
      },
    ]);

    applyPullFromParens("a0");

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.text).toBe("Hello");
    expect(lines.find((l) => l.id === "a1")?.text).toBe("Hello (ooh)");
  });

  it("propagates the background provenance flag to the linked sibling", () => {
    seedLinkedChorus([
      { id: "a0", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "a1", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ]);

    useProjectStore.getState().updateLineWithHistory("a0", {
      text: "Hello",
      backgroundText: "ooh",
      backgroundTextSource: "extraction",
    });

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");

    expect(a0?.backgroundText).toBe("ooh");
    expect(a0?.backgroundTextSource).toBe("extraction");
    expect(a1?.backgroundText).toBe("ooh");
    expect(a1?.backgroundTextSource).toBe("extraction");
  });

  it("propagates a cleared background provenance flag to the linked sibling", () => {
    seedLinkedChorus([
      {
        id: "a0",
        text: "Hello",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
      {
        id: "a1",
        text: "Hello",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ]);

    useProjectStore.getState().updateLineWithHistory("a0", {
      backgroundText: undefined,
      backgroundTextSource: undefined,
    });

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");

    expect(a0?.backgroundText).toBeUndefined();
    expect(a0?.backgroundTextSource).toBeUndefined();
    expect(a1?.backgroundText).toBeUndefined();
    expect(a1?.backgroundTextSource).toBeUndefined();
  });

  it("flips the linked sibling's provenance to manual when bg words are edited in the timeline", () => {
    seedLinkedChorus([
      {
        id: "a0",
        text: "Hello",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "Hello", begin: 0, end: 1 }],
        backgroundText: "ooh aah",
        backgroundWords: [
          { text: "ooh ", begin: 1, end: 1.5 },
          { text: "aah", begin: 1.5, end: 2 },
        ],
        backgroundTextSource: "extraction",
      },
      {
        id: "a1",
        text: "Hello",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "Hello", begin: 30, end: 31 }],
        backgroundText: "ooh aah",
        backgroundWords: [
          { text: "ooh ", begin: 31, end: 31.5 },
          { text: "aah", begin: 31.5, end: 32 },
        ],
        backgroundTextSource: "extraction",
      },
    ]);

    const edited = [
      { text: "ooh ", begin: 1, end: 1.5 },
      { text: "aah", begin: 1.5, end: 1.8 },
    ];
    useProjectStore.getState().updateLineWithHistory("a0", manualBackgroundWordEdit(edited));

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");

    expect(a0?.backgroundTextSource).toBe("manual");
    expect(a1?.backgroundTextSource).toBe("manual");
    expect(a0?.backgroundWords?.[1].end).toBe(1.8);
    // Sibling keeps its own instance-local timing, only the word structure mirrors.
    expect(a1?.backgroundWords?.[0].begin).toBe(31);
    expect(a1?.backgroundWords?.map((w) => w.text)).toEqual(["ooh ", "aah"]);
  });

  it("produces a single undoable history entry covering source + sibling", () => {
    seedLinkedChorus([
      { id: "a0", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "a1", text: "Hello (ooh)", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ]);

    applyPullFromParens("a0");
    expect(useProjectStore.getState().canUndo()).toBe(true);

    useProjectStore.getState().undo();
    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.text).toBe("Hello (ooh)");
    expect(lines.find((l) => l.id === "a1")?.text).toBe("Hello (ooh)");
  });
});
