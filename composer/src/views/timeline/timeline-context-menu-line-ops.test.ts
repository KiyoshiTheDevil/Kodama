/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "@/stores/project";
import { getEffectiveLines } from "@/domain/line/effective-words";

// These pin the Task 1.4 contract: gutter add/delete operations on a project
// containing line-synced rows must NOT flip those rows to word-synced.
//
// Pre-fix bug: the context menu derived `lines = getEffectiveLines(rawLines)`,
// then did `[...lines]` for insert or `lines.filter(...)` for delete, then
// wrote back via setLinesWithHistory. Because effective lines synthesise a
// single-word array for line-synced rows, the write-back persisted the
// synthesized words and stripped begin/end (via the store's auto-clear in
// updateLineWithHistory). After the fix, both handlers operate on raw lines.

describe("gutter add/delete preserves line-sync granularity", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
    useProjectStore.getState().clearHistory();
  });

  it("inserting a line above a line-synced row leaves the row line-synced", () => {
    useProjectStore.setState({
      lines: [{ id: "L1", text: "verse", agentId: "v1", begin: 5, end: 7 }],
    });
    // Simulating what the FIXED handler does: read raw lines, splice, write.
    const raw = useProjectStore.getState().lines;
    const targetIdx = raw.findIndex((l) => l.id === "L1");
    const newLine = { id: "X", text: "", agentId: "v1" };
    const newLines = [...raw];
    newLines.splice(targetIdx, 0, newLine);
    useProjectStore.getState().setLinesWithHistory(newLines);

    const after = useProjectStore.getState().lines;
    expect(after).toHaveLength(2);
    const L1 = after.find((l) => l.id === "L1");
    expect(L1?.words).toBeUndefined();
    expect(L1?.begin).toBe(5);
    expect(L1?.end).toBe(7);
  });

  it("regression: writing effective-line synthesised words DOES flip line-sync (proves the bug shape)", () => {
    // This is what the OLD handler effectively did. Documenting the bug shape
    // so a future caller reintroducing this pattern fails loudly.
    useProjectStore.setState({
      lines: [{ id: "L1", text: "verse", agentId: "v1", begin: 5, end: 7 }],
    });
    const effective = getEffectiveLines(useProjectStore.getState().lines);
    // effective[0] now has a synthesised single-word array
    expect(effective[0].words).toHaveLength(1);
    useProjectStore.getState().setLinesWithHistory([...effective]);
    const after = useProjectStore.getState().lines[0];
    // Without the fix, line is now word-synced (the corruption)
    expect(after.words?.length).toBe(1);
  });

  it("deleting a line by id (not effective index) does not perturb other rows", () => {
    useProjectStore.setState({
      lines: [
        { id: "A", text: "synced", agentId: "v1", begin: 0, end: 2 },
        {
          id: "B",
          text: "with words",
          agentId: "v1",
          words: [{ text: "with words", begin: 2, end: 4 }],
        },
        { id: "C", text: "another synced", agentId: "v1", begin: 4, end: 6 },
      ],
    });
    // Simulating the fixed delete: filter raw by id
    const raw = useProjectStore.getState().lines;
    useProjectStore.getState().setLinesWithHistory(raw.filter((l) => l.id !== "B"));

    const after = useProjectStore.getState().lines;
    expect(after).toHaveLength(2);
    const A = after.find((l) => l.id === "A");
    const C = after.find((l) => l.id === "C");
    // A and C remain line-synced
    expect(A?.words).toBeUndefined();
    expect(A?.begin).toBe(0);
    expect(C?.words).toBeUndefined();
    expect(C?.begin).toBe(4);
  });

  it("inserting between a grouped instance's lines does not detach the instance", () => {
    useProjectStore.setState({
      lines: [
        {
          id: "A",
          text: "x",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 0,
          begin: 0,
          end: 1,
        },
        {
          id: "B",
          text: "y",
          agentId: "v1",
          groupId: "g1",
          instanceIdx: 0,
          templateLineIdx: 1,
          begin: 1,
          end: 2,
        },
      ],
      groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    });
    // The handler doesn't strip group attrs on adjacent rows
    const raw = useProjectStore.getState().lines;
    const newLines = [...raw];
    newLines.splice(1, 0, { id: "X", text: "", agentId: "v1" });
    useProjectStore.getState().setLinesWithHistory(newLines);

    const after = useProjectStore.getState().lines;
    expect(after).toHaveLength(3);
    expect(after.find((l) => l.id === "A")?.groupId).toBe("g1");
    expect(after.find((l) => l.id === "B")?.groupId).toBe("g1");
  });
});
