import { beforeEach, describe, expect, it } from "vitest";
import { INITIAL_STATE, useProjectStore } from "@/stores/project";
import type { LyricLine } from "@/domain/line/model";

describe("setAgents", () => {
  beforeEach(() => useProjectStore.setState(INITIAL_STATE));

  it("replaces the agents list entirely", () => {
    useProjectStore.getState().setAgents([
      { id: "v1", type: "person", name: "Lead Vocals" },
      { id: "v2", type: "person", name: "Backing" },
    ]);
    const agents = useProjectStore.getState().agents;
    expect(agents).toEqual([
      { id: "v1", type: "person", name: "Lead Vocals" },
      { id: "v2", type: "person", name: "Backing" },
    ]);
  });

  it("overwrites the name of an agent that shared an id with the previous list", () => {
    useProjectStore.getState().setAgents([{ id: "v1", type: "person", name: "Lead Vocals" }]);
    expect(useProjectStore.getState().agents[0].name).toBe("Lead Vocals");
  });

  it("removes agents that are not in the new list", () => {
    useProjectStore.getState().addAgent({ id: "vNew", type: "person", name: "Custom" });
    useProjectStore.getState().setAgents([{ id: "v1", type: "person", name: "Singer" }]);
    expect(useProjectStore.getState().agents.find((a) => a.id === "vNew")).toBeUndefined();
  });
});

describe("groupRepeatingSections", () => {
  beforeEach(() => useProjectStore.setState(INITIAL_STATE));

  function plain(id: string, text: string): LyricLine {
    return { id, text, agentId: "v1" };
  }

  it("creates one group with one instance per start", () => {
    const lines: LyricLine[] = [
      plain("a1", "verse"),
      plain("c1", "chorus 1"),
      plain("c2", "chorus 2"),
      plain("a2", "verse 2"),
      plain("d1", "chorus 1"),
      plain("d2", "chorus 2"),
    ];
    useProjectStore.getState().setLines(lines);
    useProjectStore.getState().groupRepeatingSections([1, 4], 2, { label: "Chorus" });

    const state = useProjectStore.getState();
    expect(state.groups).toHaveLength(1);
    const group = state.groups[0];
    expect(group.label).toBe("Chorus");

    const c1 = state.lines[1];
    const c2 = state.lines[2];
    const d1 = state.lines[4];
    const d2 = state.lines[5];
    expect(c1.groupId).toBe(group.id);
    expect(c1.instanceIdx).toBe(0);
    expect(c1.templateLineIdx).toBe(0);
    expect(c2.instanceIdx).toBe(0);
    expect(c2.templateLineIdx).toBe(1);
    expect(d1.instanceIdx).toBe(1);
    expect(d1.templateLineIdx).toBe(0);
    expect(d2.instanceIdx).toBe(1);
    expect(d2.templateLineIdx).toBe(1);
  });

  it("undo reverts both the group and the line group attrs in one step", () => {
    const lines: LyricLine[] = [
      plain("c1", "chorus 1"),
      plain("c2", "chorus 2"),
      plain("d1", "chorus 1"),
      plain("d2", "chorus 2"),
    ];
    useProjectStore.getState().setLines(lines);
    useProjectStore.getState().groupRepeatingSections([0, 2], 2);

    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().lines[0].groupId).toBeDefined();

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines[0].groupId).toBeUndefined();
  });

  it("does nothing if any covered line is already grouped", () => {
    const lines: LyricLine[] = [
      { id: "a", text: "x", agentId: "v1", groupId: "gExisting", instanceIdx: 0, templateLineIdx: 0 },
      plain("b", "y"),
      plain("c", "x"),
      plain("d", "y"),
    ];
    useProjectStore.getState().setLines(lines);
    useProjectStore.getState().groupRepeatingSections([0, 2], 2);
    expect(useProjectStore.getState().groups).toHaveLength(0);
  });
});
