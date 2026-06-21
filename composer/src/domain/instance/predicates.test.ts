import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { belongsToInstance, isLinked } from "@/domain/instance/predicates";

// -- Helpers ------------------------------------------------------------------

function line(extras: Partial<LooseLine> = {}): LyricLine {
  return reconcileLine({ id: "l1", text: "Hello", agentId: "v1", ...extras });
}

// -- isLinked -----------------------------------------------------------------

describe("isLinked", () => {
  it("returns false for line without groupId or instanceIdx", () => {
    expect(isLinked(line())).toBe(false);
  });

  it("returns false when only groupId is set", () => {
    expect(isLinked(line({ groupId: "g1" }))).toBe(false);
  });

  it("returns false when only instanceIdx is set", () => {
    expect(isLinked(line({ instanceIdx: 0 }))).toBe(false);
  });

  it("returns true when both groupId and instanceIdx are set", () => {
    expect(isLinked(line({ groupId: "g1", instanceIdx: 0 }))).toBe(true);
  });

  it("narrows groupId and instanceIdx to non-undefined inside the guard", () => {
    const l = line({ groupId: "g1", instanceIdx: 3 });
    if (isLinked(l)) {
      const gid: string = l.groupId;
      const idx: number = l.instanceIdx;
      expect(gid).toBe("g1");
      expect(idx).toBe(3);
    }
  });
});

// -- belongsToInstance --------------------------------------------------------

describe("belongsToInstance", () => {
  it("returns true when both ids match", () => {
    expect(belongsToInstance(line({ groupId: "g1", instanceIdx: 0 }), "g1", 0)).toBe(true);
  });

  it("returns false when groupId differs", () => {
    expect(belongsToInstance(line({ groupId: "g2", instanceIdx: 0 }), "g1", 0)).toBe(false);
  });

  it("returns false when instanceIdx differs", () => {
    expect(belongsToInstance(line({ groupId: "g1", instanceIdx: 1 }), "g1", 0)).toBe(false);
  });

  it("returns false for standalone lines", () => {
    expect(belongsToInstance(line(), "g1", 0)).toBe(false);
  });
});
