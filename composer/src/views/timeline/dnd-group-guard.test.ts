/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { wouldDropCrossInstance } from "./dnd-group-guard";

const grouped = (id: string, gid: string, inst: number): LyricLine => ({
  id,
  text: "x",
  agentId: "v1",
  groupId: gid,
  instanceIdx: inst,
  templateLineIdx: 0,
});
const plain = (id: string): LyricLine => ({ id, text: "x", agentId: "v1" });

describe("wouldDropCrossInstance", () => {
  it("refuses move between two instances of the same group", () => {
    expect(wouldDropCrossInstance(grouped("a", "g1", 0), grouped("b", "g1", 1))).toBe(true);
  });

  it("refuses move between two different groups", () => {
    expect(wouldDropCrossInstance(grouped("a", "g1", 0), grouped("b", "g2", 0))).toBe(true);
  });

  it("refuses move from a group to a standalone row", () => {
    expect(wouldDropCrossInstance(grouped("a", "g1", 0), plain("b"))).toBe(true);
  });

  it("refuses move from a standalone row to a group", () => {
    expect(wouldDropCrossInstance(plain("a"), grouped("b", "g1", 0))).toBe(true);
  });

  it("allows move within the same instance", () => {
    expect(wouldDropCrossInstance(grouped("a", "g1", 0), grouped("b", "g1", 0))).toBe(false);
  });

  it("allows move between two standalone rows", () => {
    expect(wouldDropCrossInstance(plain("a"), plain("b"))).toBe(false);
  });

  it("treats a line with groupId but no instanceIdx as different from one with both", () => {
    // Edge case: a line that lost instanceIdx mid-edit shouldn't merge with a properly-grouped one
    const partial: LyricLine = { id: "a", text: "x", agentId: "v1", groupId: "g1" };
    expect(wouldDropCrossInstance(partial, grouped("b", "g1", 0))).toBe(true);
  });
});
