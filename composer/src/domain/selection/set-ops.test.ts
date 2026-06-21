import type { WordSelection } from "@/domain/selection/model";
import { describe, expect, it } from "vitest";
import { mergeWordSelections, toggleWordSelection } from "@/domain/selection/set-ops";

// -- Helpers ------------------------------------------------------------------

function sel(extras: Partial<WordSelection> = {}): WordSelection {
  return { lineId: "l1", lineIndex: 0, wordIndex: 0, type: "word", ...extras };
}

// -- toggleWordSelection ------------------------------------------------------

describe("toggleWordSelection", () => {
  it("adds a selection that is not yet present", () => {
    expect(toggleWordSelection([], sel({ wordIndex: 1 }))).toEqual([sel({ wordIndex: 1 })]);
  });

  it("removes a selection that is already present", () => {
    expect(toggleWordSelection([sel({ wordIndex: 1 })], sel({ wordIndex: 1 }))).toEqual([]);
  });

  it("removes by identity, ignoring lineIndex", () => {
    expect(toggleWordSelection([sel({ wordIndex: 1, lineIndex: 3 })], sel({ wordIndex: 1, lineIndex: 9 }))).toEqual([]);
  });

  it("leaves other selections intact when removing one", () => {
    expect(toggleWordSelection([sel({ wordIndex: 0 }), sel({ wordIndex: 1 })], sel({ wordIndex: 0 }))).toEqual([
      sel({ wordIndex: 1 }),
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [sel({ wordIndex: 0 })];
    toggleWordSelection(input, sel({ wordIndex: 1 }));
    expect(input).toEqual([sel({ wordIndex: 0 })]);
  });
});

// -- mergeWordSelections ------------------------------------------------------

describe("mergeWordSelections", () => {
  it("returns the incoming selections when existing is empty", () => {
    expect(mergeWordSelections([], [sel()])).toEqual([sel()]);
  });

  it("appends only selections not already present", () => {
    expect(mergeWordSelections([sel({ wordIndex: 0 })], [sel({ wordIndex: 0 }), sel({ wordIndex: 1 })])).toEqual([
      sel({ wordIndex: 0 }),
      sel({ wordIndex: 1 }),
    ]);
  });

  it("does not mutate the existing array", () => {
    const existing = [sel({ wordIndex: 0 })];
    mergeWordSelections(existing, [sel({ wordIndex: 1 })]);
    expect(existing).toEqual([sel({ wordIndex: 0 })]);
  });

  it("dedupes duplicates within the incoming list", () => {
    expect(mergeWordSelections([], [sel({ wordIndex: 0 }), sel({ wordIndex: 0 }), sel({ wordIndex: 1 })])).toEqual([
      sel({ wordIndex: 0 }),
      sel({ wordIndex: 1 }),
    ]);
  });
});
