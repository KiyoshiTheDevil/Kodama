import { hasOnlyFiniteSamples } from "@/audio/separation/validate-channels";
import { describe, expect, it } from "vitest";

describe("hasOnlyFiniteSamples", () => {
  it("returns true for finite audio samples", () => {
    expect(hasOnlyFiniteSamples([Float32Array.from([0, -0.5, 1])])).toBe(true);
  });

  it("returns false for NaN and infinity", () => {
    expect(hasOnlyFiniteSamples([Float32Array.from([0, Number.NaN])])).toBe(false);
    expect(hasOnlyFiniteSamples([Float32Array.from([Number.POSITIVE_INFINITY])])).toBe(false);
  });
});
