/**
 * @vitest-environment node
 */
import type { LinkGroup } from "@/domain/group/template";
import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import {
  createGroupFromSelection,
  instanceToTemplate,
  lineIdsAreContiguous,
  selectionTouchesAnyGroup,
} from "./group-ops";

const lines = (overrides: Partial<LooseLine>[]): LyricLine[] =>
  overrides.map((o, i) => reconcileLine({ id: `l${i}`, text: `t${i}`, agentId: "v1", ...o }));

describe("lineIdsAreContiguous", () => {
  it("true when selection is consecutive", () => {
    const ls = lines([{}, {}, {}, {}]);
    expect(lineIdsAreContiguous(ls, new Set(["l1", "l2"]))).toBe(true);
  });

  it("false when selection has a gap", () => {
    const ls = lines([{}, {}, {}, {}]);
    expect(lineIdsAreContiguous(ls, new Set(["l0", "l2"]))).toBe(false);
  });

  it("false on empty selection", () => {
    expect(lineIdsAreContiguous(lines([{}]), new Set())).toBe(false);
  });
});

describe("createGroupFromSelection", () => {
  it("creates a new group with sequential templateLineIdx", () => {
    const ls = lines([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const result = createGroupFromSelection(ls, new Set(["a", "b"]), []);
    expect(result).not.toBeNull();
    expect(result?.group.label).toMatch(/Group/);
    expect(result?.updatedLines.find((l) => l.id === "a")?.templateLineIdx).toBe(0);
    expect(result?.updatedLines.find((l) => l.id === "b")?.templateLineIdx).toBe(1);
    expect(result?.updatedLines.find((l) => l.id === "c")?.groupId).toBeUndefined();
  });

  it("rejects non-contiguous selection", () => {
    const ls = lines([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const result = createGroupFromSelection(ls, new Set(["a", "c"]), []);
    expect(result).toBeNull();
  });

  it("rejects selection overlapping existing groups", () => {
    const ls = lines([{ id: "a", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }, { id: "b" }]);
    expect(selectionTouchesAnyGroup(ls, new Set(["a"]))).toBe(true);
    expect(createGroupFromSelection(ls, new Set(["a", "b"]), [])).toBeNull();
  });
});

describe("instanceToTemplate", () => {
  it("converts an instance's lines into relative-offset templates", () => {
    const ls: LyricLine[] = [
      {
        id: "a",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.4 },
          { text: "love ", begin: 30.4, end: 30.9 },
          { text: "you", begin: 30.9, end: 32 },
        ],
      },
      {
        id: "b",
        text: "yeah",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 1,
        words: [{ text: "yeah", begin: 32, end: 33 }],
      },
    ];

    const tpl = instanceToTemplate(ls, "g1", 0);
    expect(tpl).toHaveLength(2);
    expect(tpl[0].relativeBegin).toBeCloseTo(0);
    expect(tpl[0].relativeEnd).toBeCloseTo(2);
    expect(tpl[0].words?.[2].relativeEnd).toBeCloseTo(2);
    expect(tpl[1].relativeBegin).toBeCloseTo(2);
    expect(tpl[1].words?.[0].relativeEnd).toBeCloseTo(3);
  });

  it("uses earliest bg-word begin as the start anchor when bg precedes main", () => {
    const ls: LyricLine[] = [
      {
        id: "a",
        text: "hi",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        backgroundWords: [{ text: "yeah", begin: 28, end: 29 }],
        words: [{ text: "hi", begin: 30, end: 31 }],
      },
    ];
    const tpl = instanceToTemplate(ls, "g1", 0);
    expect(tpl[0].words?.[0].relativeBegin).toBeCloseTo(2);
    expect(tpl[0].backgroundWords?.[0].relativeBegin).toBeCloseTo(0);
  });

  it("carries backgroundTextSource from a real line into the template", () => {
    const ls: LyricLine[] = [
      {
        id: "a",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 30, end: 31 }],
        backgroundText: "ooh",
        backgroundWords: [{ text: "ooh", begin: 30, end: 30.5 }],
        backgroundTextSource: "extraction",
      },
    ];
    const tpl = instanceToTemplate(ls, "g1", 0);
    expect(tpl[0].backgroundTextSource).toBe("extraction");
  });

  it("carries a manual-sourced background flag into the template", () => {
    const ls: LyricLine[] = [
      {
        id: "a",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 30, end: 31 }],
        backgroundText: "ooh",
        backgroundTextSource: "manual",
      },
    ];
    const tpl = instanceToTemplate(ls, "g1", 0);
    expect(tpl[0].backgroundTextSource).toBe("manual");
  });

  it("leaves backgroundTextSource undefined for a line with no background", () => {
    const ls: LyricLine[] = [
      {
        id: "a",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 30, end: 31 }],
      },
    ];
    const tpl = instanceToTemplate(ls, "g1", 0);
    expect(tpl[0].backgroundTextSource).toBeUndefined();
  });

  it("uses word-derived start anchor even when line.begin/end is stale (regression)", () => {
    const ls: LyricLine[] = [
      {
        id: "L1",
        text: "x",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "hello ", begin: 5, end: 6 },
          { text: "world", begin: 6, end: 7 },
        ],
      },
    ];
    const template = instanceToTemplate(ls, "g1", 0);
    expect(template).toHaveLength(1);
    expect(template[0].words?.[0].relativeBegin).toBeCloseTo(0);
    expect(template[0].words?.[1].relativeEnd).toBeCloseTo(2);
  });
});

describe("createGroupFromSelection · group color", () => {
  it("picks an unused color from the palette", () => {
    const existing: LinkGroup[] = [{ id: "g1", label: "x", color: "#f472b6", templateVersion: 1 }];
    const ls = lines([{ id: "a" }]);
    const result = createGroupFromSelection(ls, new Set(["a"]), existing);
    expect(result?.group.color).not.toBe("#f472b6");
  });
});
