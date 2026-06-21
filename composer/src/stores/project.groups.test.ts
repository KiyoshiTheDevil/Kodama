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

function seedGroup(id: string, overrides: Partial<LinkGroup> = {}): LinkGroup {
  return { id, label: "Chorus", color: "#f472b6", templateVersion: 1, ...overrides };
}

describe("project store · group types", () => {
  it("ProjectState includes empty groups array initially", () => {
    expect(useProjectStore.getState().groups).toEqual([]);
  });

  it("LyricLine accepts optional group fields", () => {
    const line: LyricLine = {
      id: "l1",
      text: "I love you",
      agentId: "v1",
      groupId: "g1",
      instanceIdx: 0,
      templateLineIdx: 0,
      detached: false,
    };
    expect(line.groupId).toBe("g1");
    expect(line.instanceIdx).toBe(0);
    expect(line.templateLineIdx).toBe(0);
    expect(line.detached).toBe(false);
  });

  it("LinkGroup has the expected shape", () => {
    const g: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };
    expect(g.id).toBe("g1");
    expect(g.label).toBe("Chorus");
    expect(g.color).toBe("#f472b6");
    expect(g.templateVersion).toBe(1);
  });
});

describe("project store · history captures groups", () => {
  it("undo restores groups alongside lines", () => {
    const initialGroups = [seedGroup("g1")];
    useProjectStore.setState({ groups: initialGroups, lines: [] });

    useProjectStore.getState().setLinesWithHistory([{ id: "l1", text: "test", agentId: "v1", groupId: "g1" }]);

    useProjectStore.setState({ groups: [] });

    useProjectStore.getState().setLinesWithHistory([{ id: "l2", text: "test2", agentId: "v1" }]);

    useProjectStore.getState().undo();

    expect(useProjectStore.getState().groups).toEqual(initialGroups);
  });

  it("redo restores the post-edit groups", () => {
    useProjectStore.setState({ groups: [seedGroup("g1")], lines: [] });

    useProjectStore.getState().setLinesWithHistory([{ id: "l1", text: "a", agentId: "v1" }]);

    useProjectStore.setState({ groups: [seedGroup("g1"), seedGroup("g2", { label: "Verse" })] });

    useProjectStore.getState().setLinesWithHistory([{ id: "l2", text: "b", agentId: "v1" }]);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().groups.map((g) => g.id)).toEqual(["g1"]);

    useProjectStore.getState().redo();
    expect(useProjectStore.getState().groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("commitHistory snapshots groups (verified through moveWordToBg path)", () => {
    useProjectStore.setState({ groups: [seedGroup("g1")] });
    const before = useProjectStore.getState().groups;

    useProjectStore.setState({
      lines: [
        {
          id: "l1",
          text: "hi there",
          agentId: "v1",
          words: [
            { text: "hi ", begin: 0, end: 1 },
            { text: "there", begin: 1, end: 2 },
          ],
        },
      ],
    });

    useProjectStore.getState().moveWordToBg("l1", [0], 0, 60);
    useProjectStore.getState().undo();

    expect(useProjectStore.getState().groups).toEqual(before);
  });
});

describe("project store · group registry mutators", () => {
  it("addGroup pushes to registry with history", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().groups[0].label).toBe("Chorus");
    expect(useProjectStore.getState().canUndo()).toBe(true);
  });

  it("addGroup is undoable", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().groups).toHaveLength(0);
  });

  it("addGroupWithLines undoes group + lines in a single step (no residue)", () => {
    useProjectStore.setState({
      lines: [
        { id: "l1", text: "a", agentId: "v1" },
        { id: "l2", text: "b", agentId: "v1" },
      ],
    });

    useProjectStore.getState().addGroupWithLines(seedGroup("g1"), [
      { id: "l1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "l2", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    ]);

    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().lines[0].groupId).toBe("g1");

    useProjectStore.getState().undo();

    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines[0].groupId).toBeUndefined();
    expect(useProjectStore.getState().lines[1].groupId).toBeUndefined();
  });

  it("updateGroup merges fields", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.getState().updateGroup("g1", { label: "Refrain", color: "#60a5fa" });

    const g = useProjectStore.getState().groups[0];
    expect(g.label).toBe("Refrain");
    expect(g.color).toBe("#60a5fa");
    expect(g.templateVersion).toBe(1);
  });

  it("updateGroup leaves other groups untouched", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.getState().addGroup(seedGroup("g2", { label: "Verse" }));

    useProjectStore.getState().updateGroup("g1", { label: "Refrain" });

    const groups = useProjectStore.getState().groups;
    expect(groups.find((g) => g.id === "g1")?.label).toBe("Refrain");
    expect(groups.find((g) => g.id === "g2")?.label).toBe("Verse");
  });

  it("removeGroup deletes registry entry and clears group fields on lines", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "l1",
          text: "test",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
        },
        {
          id: "l2",
          text: "untouched",
          agentId: "v1",
        },
      ],
    });

    useProjectStore.getState().removeGroup("g1");

    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines[0].groupId).toBeUndefined();
    expect(useProjectStore.getState().lines[0].instanceIdx).toBeUndefined();
    expect(useProjectStore.getState().lines[0].templateLineIdx).toBeUndefined();
    expect(useProjectStore.getState().lines[1].text).toBe("untouched");
  });

  it("removeGroup is undoable (group + line fields restored together)", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore
      .getState()
      .setLinesWithHistory([
        { id: "l1", text: "test", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      ]);

    useProjectStore.getState().removeGroup("g1");
    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines[0].groupId).toBeUndefined();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().lines[0].groupId).toBe("g1");
    expect(useProjectStore.getState().lines[0].instanceIdx).toBe(0);
  });
});

describe("project store · instance mutators", () => {
  function templateOf(text: string, words: Array<[string, number, number]>): LineTemplate {
    return {
      text,
      agentId: "v1",
      relativeBegin: words[0]?.[1] ?? 0,
      relativeEnd: words[words.length - 1]?.[2] ?? 0,
      words: words.map(([t, b, e]) => ({ text: t, relativeBegin: b, relativeEnd: e })),
    };
  }

  it("addInstance creates lines with shifted absolute timing", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [
      templateOf("I love you", [
        ["I ", 0, 0.4],
        ["love ", 0.4, 0.8],
        ["you", 0.8, 1.2],
      ]),
    ];

    useProjectStore.getState().addInstance("g1", structure, 30);

    const created = useProjectStore.getState().lines.filter((l) => l.groupId === "g1");
    expect(created).toHaveLength(1);
    expect(created[0].instanceIdx).toBe(0);
    expect(created[0].templateLineIdx).toBe(0);
    expect(created[0].begin).toBeUndefined();
    expect(created[0].words?.[0].begin).toBeCloseTo(30);
    expect(created[0].words?.[1].begin).toBeCloseTo(30.4);
    expect(created[0].words?.[2].end).toBeCloseTo(31.2);
  });

  it("addInstance carries backgroundText/backgroundWords/backgroundTextSource from the template", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [
      {
        text: "main",
        agentId: "v1",
        words: [{ text: "main", relativeBegin: 0, relativeEnd: 1 }],
        backgroundText: "ooh",
        backgroundWords: [{ text: "ooh", relativeBegin: 0, relativeEnd: 0.5 }],
        backgroundTextSource: "extraction",
      },
    ];

    useProjectStore.getState().addInstance("g1", structure, 30);

    const created = useProjectStore.getState().lines.filter((l) => l.groupId === "g1");
    expect(created).toHaveLength(1);
    expect(created[0].backgroundText).toBe("ooh");
    expect(created[0].backgroundWords?.[0].begin).toBeCloseTo(30);
    expect(created[0].backgroundTextSource).toBe("extraction");
  });

  it("addInstance carries a manual-sourced background flag", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [
      {
        text: "main",
        agentId: "v1",
        words: [{ text: "main", relativeBegin: 0, relativeEnd: 1 }],
        backgroundText: "ooh",
        backgroundTextSource: "manual",
      },
    ];

    useProjectStore.getState().addInstance("g1", structure, 0);

    const created = useProjectStore.getState().lines.filter((l) => l.groupId === "g1");
    expect(created[0].backgroundTextSource).toBe("manual");
  });

  it("addInstance leaves backgroundTextSource undefined for a template with no background", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [templateOf("a", [["a", 0, 0.5]])];

    useProjectStore.getState().addInstance("g1", structure, 0);

    const created = useProjectStore.getState().lines.filter((l) => l.groupId === "g1");
    expect(created[0].backgroundTextSource).toBeUndefined();
  });

  it("addInstance picks the next unused instanceIdx", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [templateOf("a", [["a", 0, 0.5]])];

    useProjectStore.getState().addInstance("g1", structure, 10);
    useProjectStore.getState().addInstance("g1", structure, 20);
    useProjectStore.getState().addInstance("g1", structure, 30);

    const indices = useProjectStore
      .getState()
      .lines.flatMap((l) => (l.groupId === "g1" ? [l.instanceIdx] : []))
      .toSorted();
    expect(indices).toEqual([0, 1, 2]);
  });

  it("removeInstance strips group fields from matching lines and leaves siblings", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        { id: "a0", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
        { id: "a1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
        { id: "b0", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
      ],
    });

    useProjectStore.getState().removeInstance("g1", 0);

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.groupId).toBeUndefined();
    expect(lines.find((l) => l.id === "b0")?.groupId).toBeUndefined();
    expect(lines.find((l) => l.id === "a1")?.groupId).toBe("g1");
    expect(lines.find((l) => l.id === "a1")?.instanceIdx).toBe(1);
    expect(useProjectStore.getState().groups).toHaveLength(1);
  });

  it("removeInstance dissolves the group when removing the last instance", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [{ id: "a", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }],
    });

    useProjectStore.getState().removeInstance("g1", 0);

    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines[0].groupId).toBeUndefined();
  });

  it("detachLine clears group fields on a single line and preserves text/timing", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.8 },
            { text: "you", begin: 30.8, end: 31.2 },
          ],
        },
      ],
    });

    useProjectStore.getState().detachLine("a");

    const line = useProjectStore.getState().lines[0];
    expect(line.groupId).toBeUndefined();
    expect(line.instanceIdx).toBeUndefined();
    expect(line.templateLineIdx).toBeUndefined();
    expect(line.text).toBe("I love you");
    expect(line.words?.[0].begin).toBeCloseTo(30);
  });

  it("instance mutators are undoable", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    const structure: LineTemplate[] = [templateOf("a", [["a", 0, 0.5]])];
    useProjectStore.getState().addInstance("g1", structure, 5);

    expect(useProjectStore.getState().lines).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines).toHaveLength(0);
  });
});

describe("project store · shiftInstance", () => {
  it("shifts begin/end on lines and words for the target instance only", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "hi ", begin: 30, end: 31 },
            { text: "there", begin: 31, end: 32 },
          ],
        },
        {
          id: "a1",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "hi ", begin: 60, end: 61 },
            { text: "there", begin: 61, end: 62 },
          ],
        },
      ],
    });

    useProjectStore.getState().shiftInstance("g1", 1, 5);

    const lines = useProjectStore.getState().lines;
    const i0 = lines.find((l) => l.id === "a0");
    const i1 = lines.find((l) => l.id === "a1");

    expect(i0?.words?.[0].begin).toBeCloseTo(30);
    expect(i0?.words?.[1].end).toBeCloseTo(32);

    expect(i1?.words?.[0].begin).toBeCloseTo(65);
    expect(i1?.words?.[1].end).toBeCloseTo(67);
  });

  it("shifts background words too", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "yeah",
          backgroundWords: [{ text: "yeah", begin: 30, end: 31 }],
        },
      ],
    });

    useProjectStore.getState().shiftInstance("g1", 0, 2);

    const bg = useProjectStore.getState().lines[0].backgroundWords?.[0];
    expect(bg?.begin).toBeCloseTo(32);
    expect(bg?.end).toBeCloseTo(33);
  });

  it("is undoable", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          begin: 10,
          end: 11,
        },
      ],
    });
    useProjectStore.getState().clearHistory();

    useProjectStore.getState().shiftInstance("g1", 0, 5);
    expect(useProjectStore.getState().lines[0].begin).toBeCloseTo(15);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].begin).toBeCloseTo(10);
  });

  it("does not shift a line whose link metadata still matches but detached=true (defense-in-depth)", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "live",
          text: "x",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [{ text: "x", begin: 10, end: 11 }],
        },
        {
          id: "stale-detached",
          text: "y",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 1,
          detached: true,
          words: [{ text: "y", begin: 10, end: 11 }],
        },
      ],
    });
    useProjectStore.getState().clearHistory();

    useProjectStore.getState().shiftInstance("g1", 0, 0.5);
    const after = useProjectStore.getState().lines;
    expect(after.find((l) => l.id === "live")?.words?.[0].begin).toBeCloseTo(10.5);
    expect(after.find((l) => l.id === "stale-detached")?.words?.[0].begin).toBeCloseTo(10);
  });
});

describe("project store · updateLineWithHistory auto-propagation", () => {
  function seedTwoInstancesWithTimings() {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
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
    });
  }

  it("propagates text edits to linked siblings", () => {
    seedTwoInstancesWithTimings();
    useProjectStore.getState().updateLineWithHistory("a0", { text: "I really love you" });

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.text).toBe("I really love you");
    expect(lines.find((l) => l.id === "a1")?.text).toBe("I really love you");
  });

  it("propagates agentId edits", () => {
    seedTwoInstancesWithTimings();
    useProjectStore.getState().updateLineWithHistory("a0", { agentId: "v1000" });

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.agentId).toBe("v1000");
    expect(lines.find((l) => l.id === "a1")?.agentId).toBe("v1000");
  });

  it("does NOT propagate per-instance fields like begin/end", () => {
    seedTwoInstancesWithTimings();
    useProjectStore.getState().updateLineWithHistory("a0", { begin: 25, end: 27 });

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.begin).toBe(25);
    expect(lines.find((l) => l.id === "a0")?.end).toBe(27);
    expect(lines.find((l) => l.id === "a1")?.begin).toBe(60);
    expect(lines.find((l) => l.id === "a1")?.end).toBe(62);
  });

  it("skips detached siblings", () => {
    seedTwoInstancesWithTimings();
    useProjectStore.setState((state) => ({
      lines: state.lines.map((l) => (l.id === "a1" ? { ...l, detached: true } : l)),
    }));

    useProjectStore.getState().updateLineWithHistory("a0", { text: "new text" });

    const lines = useProjectStore.getState().lines;
    expect(lines.find((l) => l.id === "a0")?.text).toBe("new text");
    expect(lines.find((l) => l.id === "a1")?.text).toBe("I love you");
  });

  it("does not affect lines from other groups", () => {
    seedTwoInstancesWithTimings();
    useProjectStore.setState((state) => ({
      lines: [
        ...state.lines,
        { id: "x", text: "other group", agentId: "v1", groupId: "g2", instanceIdx: 0, templateLineIdx: 0 },
      ],
    }));

    useProjectStore.getState().updateLineWithHistory("a0", { text: "changed" });

    expect(useProjectStore.getState().lines.find((l) => l.id === "x")?.text).toBe("other group");
  });

  it("standalone (non-grouped) edits work as before (regression)", () => {
    useProjectStore.setState({
      lines: [{ id: "s", text: "standalone", agentId: "v1" }],
    });

    useProjectStore.getState().updateLineWithHistory("s", { text: "edited" });

    expect(useProjectStore.getState().lines[0].text).toBe("edited");
  });

  it("propagates word text edits to siblings while preserving sibling timing", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.8 },
            { text: "you", begin: 30.8, end: 31.2 },
          ],
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 60, end: 60.5 },
            { text: "love ", begin: 60.5, end: 61.0 },
            { text: "you", begin: 61.0, end: 61.5 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      words: [
        { text: "I ", begin: 30, end: 30.4 },
        { text: "really ", begin: 30.4, end: 30.8 },
        { text: "you", begin: 30.8, end: 31.2 },
      ],
    });

    const lines = useProjectStore.getState().lines;
    const a1 = lines.find((l) => l.id === "a1");
    expect(a1?.words?.[1].text).toBe("really ");
    expect(a1?.words?.[1].begin).toBe(60.5);
    expect(a1?.words?.[1].end).toBe(61.0);
    expect(a1?.words?.[0].begin).toBe(60);
    expect(a1?.words?.[2].end).toBe(61.5);
  });

  it("propagates background word text edits to siblings", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "ohh ahh",
          backgroundWords: [
            { text: "ohh ", begin: 30, end: 30.5 },
            { text: "ahh", begin: 30.5, end: 31 },
          ],
        },
        {
          id: "a1",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          backgroundText: "ohh ahh",
          backgroundWords: [
            { text: "ohh ", begin: 60, end: 60.7 },
            { text: "ahh", begin: 60.7, end: 61.4 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      backgroundWords: [
        { text: "ooh ", begin: 30, end: 30.5 },
        { text: "yeah", begin: 30.5, end: 31 },
      ],
    });

    const a1 = useProjectStore.getState().lines.find((l) => l.id === "a1");
    expect(a1?.backgroundWords?.[0].text).toBe("ooh ");
    expect(a1?.backgroundWords?.[1].text).toBe("yeah");
    expect(a1?.backgroundWords?.[0].begin).toBe(60);
    expect(a1?.backgroundWords?.[1].end).toBe(61.4);
  });

  it("propagates word splits to siblings, scaling timing to sibling span", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "loving you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "loving ", begin: 0, end: 1 },
            { text: "you", begin: 1, end: 2 },
          ],
        },
        {
          id: "a1",
          text: "loving you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "loving ", begin: 10, end: 12 },
            { text: "you", begin: 12, end: 14 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      words: [
        { text: "lov", begin: 0, end: 0.5 },
        { text: "ing ", begin: 0.5, end: 1 },
        { text: "you", begin: 1, end: 2 },
      ],
    });

    const a1 = useProjectStore.getState().lines.find((l) => l.id === "a1");
    expect(a1?.words?.length).toBe(3);
    expect(a1?.words?.map((w) => w.text)).toEqual(["lov", "ing ", "you"]);
    expect(a1?.words?.[0].begin).toBe(10);
    expect(a1?.words?.[0].end).toBe(11);
    expect(a1?.words?.[1].begin).toBe(11);
    expect(a1?.words?.[1].end).toBe(12);
    expect(a1?.words?.[2].begin).toBe(12);
    expect(a1?.words?.[2].end).toBe(14);
  });

  it("propagates word merges (count decreases) to siblings", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "lov ing you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "lov", begin: 0, end: 0.5 },
            { text: "ing ", begin: 0.5, end: 1 },
            { text: "you", begin: 1, end: 2 },
          ],
        },
        {
          id: "a1",
          text: "lov ing you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "lov", begin: 10, end: 11 },
            { text: "ing ", begin: 11, end: 12 },
            { text: "you", begin: 12, end: 14 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      words: [
        { text: "loving ", begin: 0, end: 1 },
        { text: "you", begin: 1, end: 2 },
      ],
    });

    const a1 = useProjectStore.getState().lines.find((l) => l.id === "a1");
    expect(a1?.words?.length).toBe(2);
    expect(a1?.words?.map((w) => w.text)).toEqual(["loving ", "you"]);
    expect(a1?.words?.[0].begin).toBe(10);
    expect(a1?.words?.[0].end).toBe(12);
    expect(a1?.words?.[1].begin).toBe(12);
    expect(a1?.words?.[1].end).toBe(14);
  });

  it("does not propagate structural changes to detached siblings", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [{ text: "hi", begin: 0, end: 1 }],
        },
        {
          id: "a1",
          text: "hi",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          detached: true,
          words: [{ text: "hi", begin: 10, end: 11 }],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      words: [
        { text: "h", begin: 0, end: 0.5 },
        { text: "i", begin: 0.5, end: 1 },
      ],
    });

    const a1 = useProjectStore.getState().lines.find((l) => l.id === "a1");
    expect(a1?.words?.length).toBe(1);
    expect(a1?.words?.[0].text).toBe("hi");
  });

  it("clears sibling words/begin/end when source explicitly clears them with a text edit", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.8 },
            { text: "you", begin: 30.8, end: 31.2 },
          ],
        },
        {
          id: "a1",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 60, end: 60.5 },
            { text: "love ", begin: 60.5, end: 61.0 },
            { text: "you", begin: 61.0, end: 61.5 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      text: "I luv you",
      words: undefined,
      begin: undefined,
      end: undefined,
    });

    const lines = useProjectStore.getState().lines;
    const a0 = lines.find((l) => l.id === "a0");
    const a1 = lines.find((l) => l.id === "a1");
    expect(a0?.text).toBe("I luv you");
    expect(a0?.words).toBeUndefined();
    expect(a0?.begin).toBeUndefined();
    expect(a0?.end).toBeUndefined();
    expect(a1?.text).toBe("I luv you");
    expect(a1?.words).toBeUndefined();
    expect(a1?.begin).toBeUndefined();
    expect(a1?.end).toBeUndefined();
  });

  it("clears sibling backgroundWords when source clears them with a text edit", () => {
    useProjectStore.getState().addGroup(seedGroup("g1"));
    useProjectStore.setState({
      lines: [
        {
          id: "a0",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "ohh ahh",
          backgroundWords: [
            { text: "ohh ", begin: 30, end: 30.5 },
            { text: "ahh", begin: 30.5, end: 31 },
          ],
        },
        {
          id: "a1",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          backgroundText: "ohh ahh",
          backgroundWords: [
            { text: "ohh ", begin: 60, end: 60.5 },
            { text: "ahh", begin: 60.5, end: 61 },
          ],
        },
      ],
    });

    useProjectStore.getState().updateLineWithHistory("a0", {
      backgroundText: "yeah",
      backgroundWords: undefined,
    });

    const a1 = useProjectStore.getState().lines.find((l) => l.id === "a1");
    expect(a1?.backgroundText).toBe("yeah");
    expect(a1?.backgroundWords).toBeUndefined();
  });
});

// -- Smart word-count propagation regression tests ----------------------------
//
// These pin the fix for the silent-retiming bug. Before the fix, a split or
// merge on chorus 1 would proportionally rewrite every sibling's per-word
// timing, including words that didn't structurally change. Smart propagation
// preserves the timing of unchanged words on each sibling.

describe("propagateWordChanges · smart sync preserves unchanged-word timing", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
    useProjectStore.getState().clearHistory();
  });

  it("split on source: sibling 'I' and 'you' keep their original begin/end (different rhythm than source)", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love ", begin: 0.3, end: 0.6 },
            { text: "you", begin: 0.6, end: 1 },
          ],
        },
        {
          id: "B",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            // Sibling B has DIFFERENT rhythm from source A
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.7 },
            { text: "you", begin: 30.7, end: 31.2 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });

    useProjectStore.getState().updateLineWithHistory("A", {
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "lo", begin: 0.3, end: 0.45 },
        { text: "ve ", begin: 0.45, end: 0.6 },
        { text: "you", begin: 0.6, end: 1 },
      ],
    });

    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.words).toHaveLength(4);
    // Sibling B's "I" preserved exactly
    expect(b?.words?.[0]).toEqual({ text: "I ", begin: 30, end: 30.4 });
    // Sibling B's "you" preserved exactly
    expect(b?.words?.[3]).toEqual({ text: "you", begin: 30.7, end: 31.2 });
    // The split lands inside B's love-slot proportionally
    expect(b?.words?.[1].text).toBe("lo");
    expect(b?.words?.[1].begin).toBeCloseTo(30.4);
    expect(b?.words?.[1].end).toBeCloseTo(30.55);
    expect(b?.words?.[2].text).toBe("ve ");
    expect(b?.words?.[2].begin).toBeCloseTo(30.55);
    expect(b?.words?.[2].end).toBeCloseTo(30.7);
  });

  it("merge on source: sibling unchanged words keep their original timings", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love ", begin: 0.3, end: 0.6 },
            { text: "you", begin: 0.6, end: 1 },
          ],
        },
        {
          id: "B",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.7 },
            { text: "you", begin: 30.7, end: 31.2 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });

    useProjectStore.getState().updateLineWithHistory("A", {
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "loveyou", begin: 0.3, end: 1 },
      ],
    });

    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.words).toHaveLength(2);
    expect(b?.words?.[0]).toEqual({ text: "I ", begin: 30, end: 30.4 });
    expect(b?.words?.[1]).toEqual({ text: "loveyou", begin: 30.4, end: 31.2 });
  });

  it("identical-rhythm siblings: unchanged-word timing preserved (matches source rhythm)", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love ", begin: 0.3, end: 0.6 },
            { text: "you", begin: 0.6, end: 1 },
          ],
        },
        {
          id: "B",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.3 },
            { text: "love ", begin: 30.3, end: 30.6 },
            { text: "you", begin: 30.6, end: 31 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });

    useProjectStore.getState().updateLineWithHistory("A", {
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "lo", begin: 0.3, end: 0.45 },
        { text: "ve ", begin: 0.45, end: 0.6 },
        { text: "you", begin: 0.6, end: 1 },
      ],
    });

    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.words).toHaveLength(4);
    expect(b?.words?.[0]).toEqual({ text: "I ", begin: 30, end: 30.3 });
    expect(b?.words?.[3]).toEqual({ text: "you", begin: 30.6, end: 31 });
  });

  it("BG word split on source: sibling BG words preserve unchanged-word timings", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "ah ah",
          backgroundWords: [
            { text: "ah ", begin: 0, end: 0.3 },
            { text: "ah", begin: 0.3, end: 0.6 },
          ],
        },
        {
          id: "B",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          backgroundText: "ah ah",
          backgroundWords: [
            { text: "ah ", begin: 30, end: 30.4 },
            { text: "ah", begin: 30.4, end: 30.8 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });

    useProjectStore.getState().updateLineWithHistory("A", {
      backgroundWords: [
        { text: "ah ", begin: 0, end: 0.3 },
        { text: "a", begin: 0.3, end: 0.45 },
        { text: "h", begin: 0.45, end: 0.6 },
      ],
    });

    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.backgroundWords).toHaveLength(3);
    // First "ah" preserved on sibling B
    expect(b?.backgroundWords?.[0]).toEqual({ text: "ah ", begin: 30, end: 30.4 });
    // The new "a" + "h" split inside B's old second-ah slot
    expect(b?.backgroundWords?.[1].text).toBe("a");
    expect(b?.backgroundWords?.[1].begin).toBeCloseTo(30.4);
    expect(b?.backgroundWords?.[1].end).toBeCloseTo(30.6);
    expect(b?.backgroundWords?.[2].text).toBe("h");
    expect(b?.backgroundWords?.[2].begin).toBeCloseTo(30.6);
    expect(b?.backgroundWords?.[2].end).toBeCloseTo(30.8);
  });

  it("detached siblings are NOT touched by structural propagation", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love ", begin: 0.3, end: 0.6 },
            { text: "you", begin: 0.6, end: 1 },
          ],
        },
        {
          id: "B",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          detached: true,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.7 },
            { text: "you", begin: 30.7, end: 31.2 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });

    useProjectStore.getState().updateLineWithHistory("A", {
      words: [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "lo", begin: 0.3, end: 0.45 },
        { text: "ve ", begin: 0.45, end: 0.6 },
        { text: "you", begin: 0.6, end: 1 },
      ],
    });

    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    // Detached sibling untouched: original 3-word array preserved
    expect(b?.words).toHaveLength(3);
    expect(b?.words?.[1].text).toBe("love ");
    expect(b?.detached).toBe(true);
  });
});

// -- applyWordCountChange mutator (modal resolutions) -------------------------

describe("applyWordCountChange · resolutions", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
    useProjectStore.getState().clearHistory();
  });

  function setupChorus() {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love ", begin: 0.3, end: 0.6 },
            { text: "you", begin: 0.6, end: 1 },
          ],
        },
        {
          id: "B",
          text: "I love you",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          words: [
            { text: "I ", begin: 30, end: 30.4 },
            { text: "love ", begin: 30.4, end: 30.7 },
            { text: "you", begin: 30.7, end: 31.2 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });
  }

  const splitWords = [
    { text: "I ", begin: 0, end: 0.3 },
    { text: "lo", begin: 0.3, end: 0.45 },
    { text: "ve ", begin: 0.45, end: 0.6 },
    { text: "you", begin: 0.6, end: 1 },
  ];

  it("'apply' propagates the structural change with smart-sync to all linked siblings", () => {
    setupChorus();
    useProjectStore.getState().applyWordCountChange("A", splitWords, "words", "apply");
    const after = useProjectStore.getState().lines;
    const a = after.find((l) => l.id === "A");
    const b = after.find((l) => l.id === "B");
    expect(a?.words).toHaveLength(4);
    expect(b?.words).toHaveLength(4);
    // Sibling B's "I" and "you" preserved
    expect(b?.words?.[0]).toEqual({ text: "I ", begin: 30, end: 30.4 });
    expect(b?.words?.[3]).toEqual({ text: "you", begin: 30.7, end: 31.2 });
    // Neither is detached
    expect(a?.detached).toBeUndefined();
    expect(b?.detached).toBeUndefined();
  });

  it("'detach' fully unlinks source (clears groupId/instanceIdx/templateLineIdx) and leaves siblings untouched", () => {
    setupChorus();
    useProjectStore.getState().applyWordCountChange("A", splitWords, "words", "detach");
    const after = useProjectStore.getState().lines;
    const a = after.find((l) => l.id === "A");
    const b = after.find((l) => l.id === "B");
    expect(a?.groupId).toBeUndefined();
    expect(a?.instanceIdx).toBeUndefined();
    expect(a?.templateLineIdx).toBeUndefined();
    expect(a?.detached).toBeUndefined();
    expect(a?.words).toHaveLength(4);
    expect(b?.words).toHaveLength(3);
    expect(b?.words?.[0]).toEqual({ text: "I ", begin: 30, end: 30.4 });
  });

  it("'detach' clears stale begin/end when promoting a line-synced row to word-synced", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "L1",
          text: "verse",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          begin: 5,
          end: 7,
        },
        {
          id: "L2",
          text: "verse",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          begin: 30,
          end: 32,
        },
      ],
      groups: [{ id: "g1", label: "Verse", color: "#aaa", templateVersion: 1 }],
    });
    const newWords = [{ text: "verse", begin: 5, end: 7 }];
    useProjectStore.getState().applyWordCountChange("L1", newWords, "words", "detach");
    const after = useProjectStore.getState().lines.find((l) => l.id === "L1");
    expect(after?.words).toEqual(newWords);
    expect(after?.begin).toBeUndefined();
    expect(after?.end).toBeUndefined();
  });

  it("'cancel' is a no-op", () => {
    setupChorus();
    const before = useProjectStore.getState().lines;
    useProjectStore.getState().applyWordCountChange("A", splitWords, "words", "cancel");
    expect(useProjectStore.getState().lines).toEqual(before);
  });

  it("apply with extraUpdates: text propagates as a linked field to siblings", () => {
    setupChorus();
    const mergedWords = [
      { text: "I ", begin: 0, end: 0.3 },
      { text: "loveyou", begin: 0.3, end: 1 },
    ];
    useProjectStore.getState().applyWordCountChange("A", mergedWords, "words", "apply", { text: "I loveyou" });
    const after = useProjectStore.getState().lines;
    expect(after.find((l) => l.id === "A")?.text).toBe("I loveyou");
    expect(after.find((l) => l.id === "B")?.text).toBe("I loveyou");
  });

  it("detach with extraUpdates: text only changes on source, not siblings", () => {
    setupChorus();
    const mergedWords = [
      { text: "I ", begin: 0, end: 0.3 },
      { text: "loveyou", begin: 0.3, end: 1 },
    ];
    useProjectStore.getState().applyWordCountChange("A", mergedWords, "words", "detach", { text: "I loveyou" });
    const after = useProjectStore.getState().lines;
    expect(after.find((l) => l.id === "A")?.text).toBe("I loveyou");
    expect(after.find((l) => l.id === "B")?.text).toBe("I love you"); // unchanged
  });

  it("detached siblings are skipped on apply", () => {
    setupChorus();
    // Mark B detached upfront
    useProjectStore.setState((s) => ({
      lines: s.lines.map((l) => (l.id === "B" ? { ...l, detached: true } : l)),
    }));
    useProjectStore.getState().applyWordCountChange("A", splitWords, "words", "apply");
    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.words).toHaveLength(3); // untouched, still 3 words
    expect(b?.detached).toBe(true);
  });

  it("non-linked source: apply just writes to source, no siblings touched", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "X",
          text: "I love",
          agentId: "v1",
          words: [
            { text: "I ", begin: 0, end: 0.3 },
            { text: "love", begin: 0.3, end: 1 },
          ],
        },
      ],
      groups: [],
    });
    useProjectStore.getState().applyWordCountChange(
      "X",
      [
        { text: "I ", begin: 0, end: 0.3 },
        { text: "lo", begin: 0.3, end: 0.6 },
        { text: "ve", begin: 0.6, end: 1 },
      ],
      "words",
      "apply",
    );
    const x = useProjectStore.getState().lines.find((l) => l.id === "X");
    expect(x?.words).toHaveLength(3);
  });

  it("backgroundWords field: 'apply' propagates BG structural change with smart-sync", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          backgroundText: "ah ah",
          backgroundWords: [
            { text: "ah ", begin: 0, end: 0.3 },
            { text: "ah", begin: 0.3, end: 0.6 },
          ],
        },
        {
          id: "B",
          text: "main",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 1,
          templateLineIdx: 0,
          backgroundText: "ah ah",
          backgroundWords: [
            { text: "ah ", begin: 30, end: 30.4 },
            { text: "ah", begin: 30.4, end: 30.8 },
          ],
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });
    useProjectStore.getState().applyWordCountChange(
      "A",
      [
        { text: "ah ", begin: 0, end: 0.3 },
        { text: "a", begin: 0.3, end: 0.45 },
        { text: "h", begin: 0.45, end: 0.6 },
      ],
      "backgroundWords",
      "apply",
    );
    const b = useProjectStore.getState().lines.find((l) => l.id === "B");
    expect(b?.backgroundWords).toHaveLength(3);
    expect(b?.backgroundWords?.[0]).toEqual({ text: "ah ", begin: 30, end: 30.4 });
  });

  it("apply produces a single history entry covering source + all siblings (single undo restores)", () => {
    setupChorus();
    useProjectStore.getState().applyWordCountChange("A", splitWords, "words", "apply");
    const before = useProjectStore.getState().lines;
    expect(before.find((l) => l.id === "A")?.words).toHaveLength(4);
    expect(before.find((l) => l.id === "B")?.words).toHaveLength(4);
    useProjectStore.getState().undo();
    const after = useProjectStore.getState().lines;
    expect(after.find((l) => l.id === "A")?.words).toHaveLength(3);
    expect(after.find((l) => l.id === "B")?.words).toHaveLength(3);
  });
});
