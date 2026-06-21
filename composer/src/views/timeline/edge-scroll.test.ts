import { describe, expect, it } from "vitest";
import { computeEdgeScrollVelocity } from "@/views/timeline/edge-scroll";

const base = { contentLeft: 100, contentRight: 900, edgeSize: 60, maxSpeed: 20 };

describe("computeEdgeScrollVelocity", () => {
  it("returns 0 when the pointer sits in the middle", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 500 })).toBe(0);
  });

  it("returns 0 at the inner edge of the left zone", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 160 })).toBe(0);
  });

  it("returns 0 at the inner edge of the right zone", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 840 })).toBe(0);
  });

  it("scales negatively inside the left zone", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 130 })).toBeCloseTo(-10);
  });

  it("scales positively inside the right zone", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 870 })).toBeCloseTo(10);
  });

  it("clamps to -maxSpeed at and beyond the left content edge", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 100 })).toBe(-20);
    expect(computeEdgeScrollVelocity({ ...base, pointerX: -50 })).toBe(-20);
  });

  it("clamps to +maxSpeed at and beyond the right content edge", () => {
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 900 })).toBe(20);
    expect(computeEdgeScrollVelocity({ ...base, pointerX: 1200 })).toBe(20);
  });
});
