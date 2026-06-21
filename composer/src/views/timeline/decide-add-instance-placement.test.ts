/**
 * @vitest-environment node
 */
import type { LineTemplate } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { decideAddInstancePlacement, templateDuration } from "./decide-add-instance-placement";

const wt = (text: string, relativeBegin: number, relativeEnd: number) => ({ text, relativeBegin, relativeEnd });

const template: LineTemplate[] = [
  {
    text: "I love you",
    agentId: "v1",
    relativeBegin: 0,
    relativeEnd: 1,
    words: [wt("I ", 0, 0.3), wt("love ", 0.3, 0.6), wt("you", 0.6, 1)],
  },
];

const wordSyncedLine = (id: string, begin: number, end: number): LyricLine => ({
  id,
  text: "x",
  agentId: "v1",
  words: [{ text: "x", begin, end }],
});

// A grouped + word-timed line (a "real" group instance line): never fillable
const groupedTimedLine = (id: string, gid: string, instIdx: number, begin: number, end: number): LyricLine => ({
  id,
  text: "x",
  agentId: "v1",
  groupId: gid,
  instanceIdx: instIdx,
  templateLineIdx: 0,
  words: [{ text: "x", begin, end }],
});

// A standalone untimed empty placeholder (no groupId, no words, no begin/end): fillable
const emptyPlaceholderLine = (id: string, text = ""): LyricLine => ({ id, text, agentId: "v1" });

describe("templateDuration", () => {
  it("returns the span between earliest begin and latest end across all template words", () => {
    expect(templateDuration(template)).toBeCloseTo(1);
  });

  it("returns 0 for an empty template", () => {
    expect(templateDuration([])).toBe(0);
  });

  it("includes background words in the duration calculation", () => {
    const t: LineTemplate[] = [
      {
        text: "x",
        agentId: "v1",
        words: [wt("x", 0, 0.5)],
        backgroundWords: [wt("ah", 0.3, 0.9)],
      },
    ];
    expect(templateDuration(t)).toBeCloseTo(0.9);
  });

  it("uses line-level relativeBegin/End when no words present", () => {
    const t: LineTemplate[] = [{ text: "x", agentId: "v1", relativeBegin: 0, relativeEnd: 2 }];
    expect(templateDuration(t)).toBe(2);
  });
});

describe("decideAddInstancePlacement · fill path (matches paste-as-instance)", () => {
  it("fills empty placeholder rows immediately after a grouped instance when present", () => {
    // The user's reported scenario: a grouped instance ends at t=10s, then 1 empty
    // placeholder row exists, then more groups. Cmd+D at t=20 should FILL the
    // placeholder, not insert a new row.
    const lines: LyricLine[] = [
      groupedTimedLine("A1", "cannon", 0, 0, 10),
      emptyPlaceholderLine("P1", "I love you"),
      groupedTimedLine("B1", "donChorus", 0, 100, 110),
    ];
    const result = decideAddInstancePlacement({ lines, groupId: "cannon", template, playheadTime: 20 });
    expect(result.kind).toBe("fill");
    if (result.kind === "fill") {
      expect(result.updatedLines).toHaveLength(3); // no new rows added
      // The placeholder is now part of cannon as a new instance
      const filled = result.updatedLines[1];
      expect(filled.groupId).toBe("cannon");
      expect(filled.instanceIdx).toBe(1);
      expect(filled.words?.[0].begin).toBeCloseTo(20);
    }
  });

  it("fills an empty placeholder at row 0 when there's nothing before the playhead", () => {
    const lines: LyricLine[] = [emptyPlaceholderLine("P1", "I love you"), groupedTimedLine("B1", "g2", 0, 100, 110)];
    const result = decideAddInstancePlacement({ lines, groupId: "cannon", template, playheadTime: 5 });
    expect(result.kind).toBe("fill");
    if (result.kind === "fill") expect(result.updatedLines[0].groupId).toBe("cannon");
  });

  it("fills a multi-row template into multi-row placeholder rows", () => {
    const twoLineTemplate: LineTemplate[] = [
      { text: "line one", agentId: "v1", words: [wt("line one", 0, 0.5)] },
      { text: "line two", agentId: "v1", words: [wt("line two", 0.5, 1)] },
    ];
    const lines: LyricLine[] = [
      groupedTimedLine("A1", "cannon", 0, 0, 10),
      groupedTimedLine("A2", "cannon", 0, 10, 20),
      emptyPlaceholderLine("P1", "line one"),
      emptyPlaceholderLine("P2", "line two"),
    ];
    const result = decideAddInstancePlacement({
      lines,
      groupId: "cannon",
      template: twoLineTemplate,
      playheadTime: 30,
    });
    expect(result.kind).toBe("fill");
    if (result.kind === "fill") {
      expect(result.updatedLines).toHaveLength(4);
      expect(result.updatedLines[2].groupId).toBe("cannon");
      expect(result.updatedLines[3].groupId).toBe("cannon");
    }
  });

  it("does NOT fill if the next row already has a groupId (would clobber a real instance)", () => {
    const lines: LyricLine[] = [
      groupedTimedLine("A1", "cannon", 0, 0, 10),
      // Next row belongs to another group, should not be filled
      groupedTimedLine("B1", "verse", 0, 30, 40),
    ];
    const result = decideAddInstancePlacement({ lines, groupId: "cannon", template, playheadTime: 20 });
    // Falls through to insert path: gap from 10..30 fits a 1s template
    expect(result.kind).toBe("insert");
  });

  it("does NOT fill if the next row has words (real timed content)", () => {
    const lines: LyricLine[] = [groupedTimedLine("A1", "cannon", 0, 0, 10), wordSyncedLine("B", 30, 40)];
    const result = decideAddInstancePlacement({ lines, groupId: "cannon", template, playheadTime: 20 });
    expect(result.kind).toBe("insert");
  });

  it("does NOT fill if there aren't enough consecutive empty rows for the template", () => {
    const twoLineTemplate: LineTemplate[] = [
      { text: "line one", agentId: "v1", words: [wt("line one", 0, 0.5)] },
      { text: "line two", agentId: "v1", words: [wt("line two", 0.5, 1)] },
    ];
    const lines: LyricLine[] = [
      groupedTimedLine("A1", "cannon", 0, 0, 10),
      emptyPlaceholderLine("P1", "x"),
      // Only one empty row, then a real row: template needs 2 consecutive empties
      groupedTimedLine("B1", "verse", 0, 30, 40),
    ];
    const result = decideAddInstancePlacement({
      lines,
      groupId: "cannon",
      template: twoLineTemplate,
      playheadTime: 20,
    });
    expect(result.kind).toBe("insert");
  });
});

describe("decideAddInstancePlacement · insert path (no fill possible)", () => {
  it("inserts at start when project is empty", () => {
    const result = decideAddInstancePlacement({ lines: [], groupId: "g1", template, playheadTime: 5 });
    expect(result).toEqual({ kind: "insert", instanceStart: 5, insertAtIndex: 0 });
  });

  it("inserts in the gap between two grouped lines and after prev's list index", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 0, 2), groupedTimedLine("B", "g1", 1, 10, 12)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 5 });
    expect(result).toEqual({ kind: "insert", instanceStart: 5, insertAtIndex: 1 });
  });

  it("returns 'fallback: gap-too-small' when the gap can't fit the template duration", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 0, 2), groupedTimedLine("B", "g1", 1, 2.5, 4)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 2.2 });
    expect(result).toEqual({ kind: "fallback", reason: "gap-too-small" });
  });

  it("returns 'fallback: playhead-inside-line' when playhead is within a real timed line", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 0, 5), groupedTimedLine("B", "g1", 1, 10, 12)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 3 });
    expect(result).toEqual({ kind: "fallback", reason: "playhead-inside-line" });
  });

  it("returns 'fallback: past-last-line' when playhead is past every existing line's end", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 0, 5), groupedTimedLine("B", "g1", 1, 10, 12)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 50 });
    expect(result).toEqual({ kind: "fallback", reason: "past-last-line" });
  });

  it("inserts at index 0 when playhead is before any line", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 10, 12), groupedTimedLine("B", "g1", 1, 20, 22)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 5 });
    expect(result).toEqual({ kind: "insert", instanceStart: 5, insertAtIndex: 0 });
  });

  it("inserts after prev when multiple grouped lines exist on each side", () => {
    const lines = [
      groupedTimedLine("A", "g1", 0, 0, 1),
      groupedTimedLine("B", "g1", 1, 2, 3),
      groupedTimedLine("C", "g1", 2, 10, 11),
      groupedTimedLine("D", "g1", 3, 12, 13),
    ];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 5 });
    expect(result).toEqual({ kind: "insert", instanceStart: 5, insertAtIndex: 2 });
  });

  it("template duration affects the gap-fit decision", () => {
    const lines = [groupedTimedLine("A", "g1", 0, 0, 2), groupedTimedLine("B", "g1", 1, 4, 6)];
    expect(decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 2.5 })).toEqual({
      kind: "insert",
      instanceStart: 2.5,
      insertAtIndex: 1,
    });
    const longTemplate: LineTemplate[] = [
      { text: "x", agentId: "v1", relativeBegin: 0, relativeEnd: 4, words: [wt("x", 0, 4)] },
    ];
    expect(decideAddInstancePlacement({ lines, groupId: "g1", template: longTemplate, playheadTime: 2.5 })).toEqual({
      kind: "fallback",
      reason: "gap-too-small",
    });
  });

  it("treats playhead exactly at a gap boundary (== prev.end) as inside-line, not gap", () => {
    // Boundary equality: playhead == A.end. A's range is [0..5], inclusive on both sides.
    // No fillable empty row exists (B is grouped + word-timed at index 1), so fill fails;
    // then inside-line check kicks in because playhead <= A.end.
    const lines = [groupedTimedLine("A", "g1", 0, 0, 5), groupedTimedLine("B", "g1", 1, 10, 12)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 5 });
    expect(result).toEqual({ kind: "fallback", reason: "playhead-inside-line" });
  });

  it("uses time-order (not list-order) for prev/next resolution when list and time disagree", () => {
    // List order: B (later in time), A (earlier in time). Time-sorted: A then B.
    // Playhead in the gap before A's begin should land at insertAtIndex 0 (no prev in time order).
    const lines = [groupedTimedLine("B", "g1", 0, 10, 12), groupedTimedLine("A", "g1", 1, 5, 6)];
    const result = decideAddInstancePlacement({ lines, groupId: "g1", template, playheadTime: 2 });
    expect(result).toEqual({ kind: "insert", instanceStart: 2, insertAtIndex: 0 });
  });
});
