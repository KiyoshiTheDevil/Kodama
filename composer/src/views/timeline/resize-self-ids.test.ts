import { describe, expect, it } from "vitest";
import { resizeGestureSelfIds } from "@/views/timeline/resize-self-ids";
import { selfKey } from "@/views/timeline/snap";

describe("resizeGestureSelfIds", () => {
  it("includes the left neighbour when dragging a left edge", () => {
    const ids = resizeGestureSelfIds("line-1", 2, "left", 5, "word");
    expect(ids.has(selfKey("line-1", 2, "word"))).toBe(true);
    expect(ids.has(selfKey("line-1", 1, "word"))).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("includes the right neighbour when dragging a right edge", () => {
    const ids = resizeGestureSelfIds("line-1", 2, "right", 5, "word");
    expect(ids.has(selfKey("line-1", 3, "word"))).toBe(true);
  });

  it("omits a neighbour past the array bounds", () => {
    expect(resizeGestureSelfIds("l", 0, "left", 3, "word").size).toBe(1);
    expect(resizeGestureSelfIds("l", 2, "right", 3, "word").size).toBe(1);
  });

  it("keys the neighbour with the same track type", () => {
    const ids = resizeGestureSelfIds("l", 1, "left", 4, "bg");
    expect(ids.has(selfKey("l", 0, "bg"))).toBe(true);
  });
});
