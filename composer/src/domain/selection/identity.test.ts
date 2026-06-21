import type { WordSelection } from "@/domain/selection/model";
import { describe, expect, it } from "vitest";
import { isWordSelected, sameWordSelection } from "@/domain/selection/identity";

// -- Helpers ------------------------------------------------------------------

function sel(extras: Partial<WordSelection> = {}): WordSelection {
  return { lineId: "l1", lineIndex: 0, wordIndex: 0, type: "word", ...extras };
}

// -- sameWordSelection --------------------------------------------------------

describe("sameWordSelection", () => {
  it("is true when lineId, wordIndex, and type all match", () => {
    expect(sameWordSelection(sel(), sel())).toBe(true);
  });

  it("ignores lineIndex, which is not part of selection identity", () => {
    expect(sameWordSelection(sel({ lineIndex: 0 }), sel({ lineIndex: 7 }))).toBe(true);
  });

  it("is false when lineId differs", () => {
    expect(sameWordSelection(sel({ lineId: "l1" }), sel({ lineId: "l2" }))).toBe(false);
  });

  it("is false when wordIndex differs", () => {
    expect(sameWordSelection(sel({ wordIndex: 0 }), sel({ wordIndex: 1 }))).toBe(false);
  });

  it("is false when type differs", () => {
    expect(sameWordSelection(sel({ type: "word" }), sel({ type: "bg" }))).toBe(false);
  });
});

// -- isWordSelected -----------------------------------------------------------

describe("isWordSelected", () => {
  it("is true when a matching selection is present", () => {
    expect(isWordSelected([sel({ wordIndex: 2 })], "l1", 2, "word")).toBe(true);
  });

  it("is false for an empty selection list", () => {
    expect(isWordSelected([], "l1", 0, "word")).toBe(false);
  });

  it("distinguishes a bg-track query from a word-track selection at the same index", () => {
    expect(isWordSelected([sel({ type: "word" })], "l1", 0, "bg")).toBe(false);
  });

  it("is false when no selection matches the query", () => {
    expect(isWordSelected([sel({ wordIndex: 0 }), sel({ wordIndex: 1 })], "l1", 5, "word")).toBe(false);
  });
});
