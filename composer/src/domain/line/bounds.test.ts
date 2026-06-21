import { reconcileLine, type LooseLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { bgBounds, effectiveBounds, mainBounds } from "@/domain/line/bounds";

// -- Helpers ------------------------------------------------------------------

function line(extras: Partial<LooseLine> = {}) {
  return reconcileLine({ id: "l1", text: "Hello", agentId: "v1", ...extras });
}

// -- mainBounds ---------------------------------------------------------------

describe("mainBounds", () => {
  it("returns first.begin and last.end from words", () => {
    expect(
      mainBounds(
        line({
          words: [
            { text: "a", begin: 2, end: 5 },
            { text: "b", begin: 5, end: 8 },
          ],
        }),
      ),
    ).toEqual({ begin: 2, end: 8 });
  });

  it("returns line-synced begin/end when no words", () => {
    expect(mainBounds(line({ begin: 3, end: 7 }))).toEqual({ begin: 3, end: 7 });
  });

  it("returns null when no main timing", () => {
    expect(mainBounds(line())).toBeNull();
  });

  it("returns null for a word-synced line with an empty words array", () => {
    expect(mainBounds(line({ words: [] }))).toBeNull();
  });

  it("ignores stale line.begin/end when words present (regression: TTML import populates both)", () => {
    expect(
      mainBounds(
        line({
          begin: 0,
          end: 999,
          words: [{ text: "a", begin: 2, end: 5 }],
        }),
      ),
    ).toEqual({ begin: 2, end: 5 });
  });

  it("returns null when only begin is set (incomplete)", () => {
    expect(mainBounds(line({ begin: 3 }))).toBeNull();
  });
});

// -- bgBounds -----------------------------------------------------------------

describe("bgBounds", () => {
  it("returns first.begin and last.end from backgroundWords", () => {
    expect(
      bgBounds(
        line({
          backgroundWords: [
            { text: "a", begin: 6, end: 9 },
            { text: "b", begin: 9, end: 12 },
          ],
        }),
      ),
    ).toEqual({ begin: 6, end: 12 });
  });

  it("returns null when backgroundWords is undefined", () => {
    expect(bgBounds(line())).toBeNull();
  });

  it("returns null when backgroundWords is empty array", () => {
    expect(bgBounds(line({ backgroundWords: [] }))).toBeNull();
  });
});

// -- effectiveBounds ----------------------------------------------------------

describe("effectiveBounds", () => {
  it("returns main bounds when only main timing", () => {
    expect(
      effectiveBounds(
        line({
          words: [
            { text: "a", begin: 2, end: 5 },
            { text: "b", begin: 5, end: 8 },
          ],
        }),
      ),
    ).toEqual({ begin: 2, end: 8 });
  });

  it("returns line-synced bounds when no words", () => {
    expect(effectiveBounds(line({ begin: 3, end: 7 }))).toEqual({ begin: 3, end: 7 });
  });

  it("returns null when no timing at all", () => {
    expect(effectiveBounds(line())).toBeNull();
  });

  it("extends end past main words when bg words end later", () => {
    expect(
      effectiveBounds(
        line({
          words: [
            { text: "a", begin: 2, end: 5 },
            { text: "b", begin: 5, end: 8 },
          ],
          backgroundWords: [
            { text: "c", begin: 6, end: 9 },
            { text: "d", begin: 9, end: 12 },
          ],
        }),
      ),
    ).toEqual({ begin: 2, end: 12 });
  });

  it("pulls begin earlier when bg words begin before main words", () => {
    expect(
      effectiveBounds(
        line({
          words: [{ text: "a", begin: 5, end: 8 }],
          backgroundWords: [{ text: "b", begin: 3, end: 6 }],
        }),
      ),
    ).toEqual({ begin: 3, end: 8 });
  });

  it("extends line-synced end when bg words extend past it", () => {
    expect(
      effectiveBounds(
        line({
          begin: 3,
          end: 7,
          backgroundWords: [{ text: "b", begin: 6, end: 10 }],
        }),
      ),
    ).toEqual({ begin: 3, end: 10 });
  });

  it("leaves bounds unchanged when bg sits fully inside main range", () => {
    expect(
      effectiveBounds(
        line({
          words: [{ text: "a", begin: 2, end: 10 }],
          backgroundWords: [{ text: "b", begin: 4, end: 7 }],
        }),
      ),
    ).toEqual({ begin: 2, end: 10 });
  });

  it("ignores empty bg words array", () => {
    expect(
      effectiveBounds(
        line({
          words: [{ text: "a", begin: 2, end: 5 }],
          backgroundWords: [],
        }),
      ),
    ).toEqual({ begin: 2, end: 5 });
  });

  it("returns null when bg exists but no main timing (matches legacy getLineTiming contract)", () => {
    expect(
      effectiveBounds(
        line({
          backgroundWords: [{ text: "b", begin: 3, end: 6 }],
        }),
      ),
    ).toBeNull();
  });

  it("returns null when only empty timing arrays", () => {
    expect(effectiveBounds(line({ words: [], backgroundWords: [] }))).toBeNull();
  });

  it("ignores stale line.begin/end when words present (regression test for incident memory)", () => {
    expect(
      effectiveBounds(
        line({
          begin: 0,
          end: 999,
          words: [{ text: "a", begin: 2, end: 5 }],
        }),
      ),
    ).toEqual({ begin: 2, end: 5 });
  });
});
