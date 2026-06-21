import type { WordSelection } from "@/domain/selection/model";
import { describe, expect, it } from "vitest";
import { contiguousSelectionRun } from "@/domain/selection/contiguous";

// -- Helpers ------------------------------------------------------------------

function sel(wordIndex: number, extras: Partial<WordSelection> = {}): WordSelection {
  return { lineId: "l1", lineIndex: 0, wordIndex, type: "word", ...extras };
}

// -- contiguousSelectionRun ---------------------------------------------------

describe("contiguousSelectionRun", () => {
  it("returns null for fewer than two selections", () => {
    expect(contiguousSelectionRun([])).toBeNull();
    expect(contiguousSelectionRun([sel(0)])).toBeNull();
  });

  it("returns the sorted run for consecutive same-line word selections", () => {
    expect(contiguousSelectionRun([sel(2), sel(0), sel(1)])).toEqual({
      lineId: "l1",
      type: "word",
      indices: [0, 1, 2],
    });
  });

  it("returns null when selections span different lines", () => {
    expect(contiguousSelectionRun([sel(0), sel(1, { lineId: "l2" })])).toBeNull();
  });

  it("returns null when selections span word and bg tracks", () => {
    expect(contiguousSelectionRun([sel(0), sel(1, { type: "bg" })])).toBeNull();
  });

  it("returns null when word indices are not consecutive", () => {
    expect(contiguousSelectionRun([sel(0), sel(2)])).toBeNull();
  });

  it("detects a run on the bg track", () => {
    expect(contiguousSelectionRun([sel(0, { type: "bg" }), sel(1, { type: "bg" })])).toEqual({
      lineId: "l1",
      type: "bg",
      indices: [0, 1],
    });
  });
});
