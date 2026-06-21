/**
 * @vitest-environment node
 */
import type { LineTemplate } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { decidePasteInstanceAction } from "./decide-paste-instance-action";

const template: LineTemplate[] = [
  {
    text: "chorus a",
    agentId: "v1",
    relativeBegin: 0,
    relativeEnd: 1,
    words: [{ text: "chorus a", relativeBegin: 0, relativeEnd: 1 }],
  },
  {
    text: "chorus b",
    agentId: "v1",
    relativeBegin: 1,
    relativeEnd: 2,
    words: [{ text: "chorus b", relativeBegin: 1, relativeEnd: 2 }],
  },
];

describe("decidePasteInstanceAction · invariants both paste flows must respect", () => {
  it("returns no-target when dropped in midair (negative hoveredLineIndex)", () => {
    const lines: LyricLine[] = [{ id: "1", text: "x", agentId: "v1" }];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: -1,
      cursorTime: 5,
    });
    expect(result.kind).toBe("no-target");
  });

  it("fills in place when destination has N consecutive empty rows", () => {
    const lines: LyricLine[] = [
      { id: "intro", text: "intro", agentId: "v1", words: [{ text: "intro", begin: 0, end: 5 }] },
      { id: "empty1", text: "chorus a", agentId: "v1" },
      { id: "empty2", text: "chorus b", agentId: "v1" },
    ];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: 1,
      cursorTime: 10,
    });
    expect(result.kind).toBe("fill");
    if (result.kind !== "fill") return;
    expect(result.updatedLines).toHaveLength(3);
    expect(result.updatedLines[1].groupId).toBe("g1");
    expect(result.updatedLines[2].groupId).toBe("g1");
  });

  it("requests confirmation to insert when destination row is occupied (no destructive default)", () => {
    const lines: LyricLine[] = [
      {
        id: "synced",
        text: "chorus a",
        agentId: "v1",
        words: [{ text: "chorus a", begin: 0, end: 1 }],
      },
      { id: "empty", text: "chorus b", agentId: "v1" },
    ];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: 0,
      cursorTime: 10,
    });
    expect(result.kind).toBe("needs-confirm-insert");
    if (result.kind !== "needs-confirm-insert") return;
    expect(result.insertAt).toBe(0);
    expect(result.instanceStart).toBe(10);
  });

  it("requests confirmation to insert when destination is partially empty (some rows already grouped)", () => {
    const lines: LyricLine[] = [
      { id: "empty", text: "chorus a", agentId: "v1" },
      {
        id: "grouped",
        text: "chorus b",
        agentId: "v1",
        groupId: "other",
        instanceIdx: 0,
        templateLineIdx: 0,
      },
    ];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: 0,
      cursorTime: 0,
    });
    expect(result.kind).toBe("needs-confirm-insert");
  });

  it("clamps negative cursorTime to 0 in the instanceStart it returns", () => {
    const lines: LyricLine[] = [{ id: "x", text: "synced", agentId: "v1", begin: 0, end: 1 }];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: 0,
      cursorTime: -5,
    });
    expect(result.kind).toBe("needs-confirm-insert");
    if (result.kind !== "needs-confirm-insert") return;
    expect(result.instanceStart).toBe(0);
  });

  it("requests confirmation when destination range overflows the project", () => {
    const lines: LyricLine[] = [{ id: "empty1", text: "chorus a", agentId: "v1" }];
    const result = decidePasteInstanceAction({
      lines,
      groupId: "g1",
      template,
      hoveredLineIndex: 0,
      cursorTime: 0,
    });
    expect(result.kind).toBe("needs-confirm-insert");
  });
});
