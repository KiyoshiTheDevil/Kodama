/**
 * @vitest-environment node
 */
import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { decideEditTextAction } from "./decide-edit-text-action";

const groupChorus: LinkGroup = { id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 };

function chorusLines(): LyricLine[] {
  return [
    { id: "c1a", text: "I love you", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    { id: "c1b", text: "more than words", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    { id: "v1", text: "verse line", agentId: "v1" },
    { id: "c2a", text: "I love you", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    { id: "c2b", text: "more than words", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 1 },
  ];
}

const baseText = (lines: LyricLine[]) => lines.map((l) => l.text).join("\n");

describe("decideEditTextAction", () => {
  it("returns ignore-modal-pending when modal already open and skips all computation", () => {
    const lines = chorusLines();
    const action = decideEditTextAction({
      text: "totally\ndifferent\nstuff",
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: true,
    });
    expect(action.kind).toBe("ignore-modal-pending");
  });

  it("returns noop when text is unchanged", () => {
    const lines = chorusLines();
    const action = decideEditTextAction({
      text: baseText(lines),
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("noop");
  });

  it("returns apply for content-only edits (typo fix)", () => {
    const lines = chorusLines();
    const text = baseText(lines).replace("I love you", "I luv you");
    const action = decideEditTextAction({
      text,
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("apply");
    if (action.kind !== "apply") return;
    expect(action.finalLines.find((l) => l.id === "c1a")?.text).toBe("I luv you");
    expect(action.finalLines.find((l) => l.id === "c2a")?.text).toBe("I luv you");
  });

  it("returns apply for structural changes outside any group (no confirm)", () => {
    const lines = chorusLines();
    const text = `${baseText(lines)}\nbrand new outro`;
    const action = decideEditTextAction({
      text,
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("apply");
    if (action.kind !== "apply") return;
    expect(action.finalLines.length).toBe(lines.length + 1);
    expect(action.finalLines[action.finalLines.length - 1].text).toBe("brand new outro");
  });

  it("returns needs-confirm when a chorus instance loses a row", () => {
    const lines = chorusLines();
    // Drop a chorus line from the textarea. textToLyricLines greedily reassigns the matching
    // existing line, so the LAST chorus instance is the one detected as impacted (c2b is orphaned).
    const text = ["I love you", "verse line", "I love you", "more than words"].join("\n");
    const action = decideEditTextAction({
      text,
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("needs-confirm");
    if (action.kind !== "needs-confirm") return;
    expect(action.impacted).toHaveLength(1);
    expect(action.impacted[0]).toEqual({ groupId: "g1", instanceIdx: 1 });
    expect(action.labels).toEqual(["Chorus"]);
  });

  it("returns needs-confirm but does NOT mutate input lines", () => {
    const lines = chorusLines();
    const before = JSON.parse(JSON.stringify(lines));
    decideEditTextAction({
      text: "totally\ndifferent\nstuff",
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(lines).toEqual(before);
  });

  it("dedups labels when multiple impacted instances share a group", () => {
    const lines: LyricLine[] = [
      { id: "a", text: "foo", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "b", text: "foo", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const action = decideEditTextAction({
      text: "",
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("needs-confirm");
    if (action.kind !== "needs-confirm") return;
    expect(action.labels).toEqual(["Chorus"]);
    expect(action.impacted).toHaveLength(2);
  });

  it("propagates a content edit to a sibling instance via apply", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 0, end: 0.4 },
          { text: "love ", begin: 0.4, end: 0.8 },
          { text: "you", begin: 0.8, end: 1.2 },
        ],
      },
      {
        id: "b",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.5 },
          { text: "love ", begin: 30.5, end: 31.0 },
          { text: "you", begin: 31.0, end: 31.5 },
        ],
      },
    ];
    const action = decideEditTextAction({
      text: "I luv you\nI love you",
      defaultAgentId: "v1",
      lines,
      groups: [groupChorus],
      modalPending: false,
    });
    expect(action.kind).toBe("apply");
    if (action.kind !== "apply") return;
    const a = action.finalLines.find((l) => l.id === "a");
    const b = action.finalLines.find((l) => l.id === "b");
    expect(a?.text).toBe("I luv you");
    expect(a?.words?.[1].text).toBe("luv ");
    expect(a?.words?.[1].begin).toBe(0.4);
    expect(b?.text).toBe("I luv you");
    expect(b?.words?.[1].text).toBe("luv ");
    expect(b?.words?.[1].begin).toBe(30.5);
  });

  it("returns apply (with empty group cleanup unrelated) when impacted is empty even on length change outside group", () => {
    const lines: LyricLine[] = [{ id: "a", text: "first", agentId: "v1" }];
    const action = decideEditTextAction({
      text: "first\nsecond",
      defaultAgentId: "v1",
      lines,
      groups: [],
      modalPending: false,
    });
    expect(action.kind).toBe("apply");
  });
});
