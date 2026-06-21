import { describe, expect, it } from "vitest";
import { computeInstrumental } from "@/audio/separation/derived-stems";

describe("computeInstrumental", () => {
  it("returns original − vocals per channel", () => {
    const original = [Float32Array.from([1, 2, 3, 4]), Float32Array.from([10, 20, 30, 40])];
    const vocals = [Float32Array.from([0.5, 0.5, 0.5, 0.5]), Float32Array.from([1, 2, 3, 4])];
    const out = computeInstrumental(original, vocals);
    expect(Array.from(out[0])).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(Array.from(out[1])).toEqual([9, 18, 27, 36]);
  });

  it("treats missing vocals channel as silence", () => {
    const original = [Float32Array.from([1, 2, 3])];
    const vocals: Float32Array[] = [];
    const out = computeInstrumental(original, vocals);
    expect(Array.from(out[0])).toEqual([1, 2, 3]);
  });
});
