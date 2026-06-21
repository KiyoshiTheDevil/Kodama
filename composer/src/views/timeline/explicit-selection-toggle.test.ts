/**
 * @vitest-environment node
 */
import { useProjectStore } from "@/stores/project";
import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { resolveExplicitSelectionToggle } from "@/views/timeline/explicit-selection-toggle";
import type { WordSelection } from "@/domain/selection/model";
import { beforeEach, describe, expect, it } from "vitest";

function sel(lineId: string, wordIndex: number, type: "word" | "bg" = "word"): WordSelection {
  return { lineId, lineIndex: 0, wordIndex, type };
}

describe("resolveExplicitSelectionToggle", () => {
  it("marks the whole word when a partially-marked syllable group is selected via one syllable", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "fu|cking yeah",
        agentId: "v1",
        words: [
          { text: "fu", begin: 0, end: 0.2, explicit: true },
          { text: "cking ", begin: 0.2, end: 0.5 },
          { text: "yeah", begin: 0.5, end: 1 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("L1", 0)]);
    expect(result.value).toBe(true);
    expect(result.targets.map((t) => t.wordIndex).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("unmarks when every syllable of the selected word is already marked", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "fu|cking yeah",
        agentId: "v1",
        words: [
          { text: "fu", begin: 0, end: 0.2, explicit: true },
          { text: "cking ", begin: 0.2, end: 0.5, explicit: true },
          { text: "yeah", begin: 0.5, end: 1 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("L1", 1)]);
    expect(result.value).toBe(false);
    expect(result.targets.map((t) => t.wordIndex).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("marks when the selected word is fully unmarked", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "fuck this",
        agentId: "v1",
        words: [
          { text: "fuck ", begin: 0, end: 0.5 },
          { text: "this", begin: 0.5, end: 1 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("L1", 0)]);
    expect(result.value).toBe(true);
    expect(result.targets).toEqual([{ lineId: "L1", field: "words", wordIndex: 0 }]);
  });

  it("treats a multi-line selection as marked-only-if every expanded index is marked", () => {
    const lines: LyricLine[] = [
      {
        id: "A",
        text: "fuck this",
        agentId: "v1",
        words: [
          { text: "fuck ", begin: 0, end: 0.5, explicit: true },
          { text: "this", begin: 0.5, end: 1 },
        ],
      },
      {
        id: "B",
        text: "shit happens",
        agentId: "v1",
        words: [
          { text: "shit ", begin: 1, end: 1.5 },
          { text: "happens", begin: 1.5, end: 2 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("A", 0), sel("B", 0)]);
    expect(result.value).toBe(true);
    expect(result.targets).toEqual([
      { lineId: "A", field: "words", wordIndex: 0 },
      { lineId: "B", field: "words", wordIndex: 0 },
    ]);
  });

  it("maps a bg-type selection to the backgroundWords field", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "oh shit",
        backgroundWords: [
          { text: "oh ", begin: 1, end: 1.25 },
          { text: "shit", begin: 1.25, end: 1.5 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("L1", 1, "bg")]);
    expect(result.value).toBe(true);
    expect(result.targets).toEqual([{ lineId: "L1", field: "backgroundWords", wordIndex: 1 }]);
  });

  it("drops out-of-range and unknown-line selections", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "fuck this",
        agentId: "v1",
        words: [
          { text: "fuck ", begin: 0, end: 0.5 },
          { text: "this", begin: 0.5, end: 1 },
        ],
      },
    ];
    const result = resolveExplicitSelectionToggle(lines, [sel("L1", 9), sel("ghost", 0), sel("L1", 0)]);
    expect(result.targets).toEqual([{ lineId: "L1", field: "words", wordIndex: 0 }]);
  });

  it("returns an empty target list for an empty selection", () => {
    const result = resolveExplicitSelectionToggle([], []);
    expect(result.targets).toEqual([]);
  });
});

describe("resolveExplicitSelectionToggle → markWordsExplicit (keyboard flow, issue #62 Bug 2)", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
    useProjectStore.getState().clearHistory();
  });

  function seedLinkedChorus(explicit = false) {
    const group: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    useProjectStore.getState().setGroups([group]);
    useProjectStore.getState().setLines(
      [0, 1, 2].map((idx) => ({
        id: `inst-${idx}`,
        text: "fuck this",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: idx,
        templateLineIdx: 0,
        words: [
          { text: "fuck ", begin: idx * 30, end: idx * 30 + 0.5, ...(explicit ? { explicit: true as const } : {}) },
          { text: "this", begin: idx * 30 + 0.5, end: idx * 30 + 1 },
        ],
      })),
    );
  }

  function runToggle(): void {
    const selection: WordSelection[] = [sel("inst-0", 0), sel("inst-1", 0), sel("inst-2", 0)];
    const { targets, value } = resolveExplicitSelectionToggle(useProjectStore.getState().lines, selection);
    useProjectStore.getState().markWordsExplicit(targets, value);
  }

  it("marks the word across every linked instance instead of flip-flopping", () => {
    seedLinkedChorus();
    runToggle();
    const lines = useProjectStore.getState().lines;
    expect(lines.every((l) => l.words?.[0].explicit === true)).toBe(true);
  });

  it("reverts the whole batch with a single undo", () => {
    seedLinkedChorus();
    runToggle();
    useProjectStore.getState().undo();
    const lines = useProjectStore.getState().lines;
    expect(lines.every((l) => l.words?.[0].explicit === undefined)).toBe(true);
  });

  it("unmarks the batch when every selected word is already explicit", () => {
    seedLinkedChorus(true);
    runToggle();
    const lines = useProjectStore.getState().lines;
    expect(lines.every((l) => l.words?.[0].explicit === undefined)).toBe(true);
  });
});
