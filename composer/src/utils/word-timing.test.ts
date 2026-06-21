/**
 * @vitest-environment node
 */
import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { cloneWord, splitSourceWord, synthesizeBracketedWord } from "./word-timing";

describe("cloneWord", () => {
  it("carries every input field through, overrides apply", () => {
    const source: WordTiming = {
      text: "ev",
      begin: 0,
      end: 0.3,
      explicit: true,
      syllableGroupId: "g1",
    };
    const result = cloneWord(source, { begin: 5, end: 5.3 });
    expect(result).toEqual({
      text: "ev",
      begin: 5,
      end: 5.3,
      explicit: true,
      syllableGroupId: "g1",
    });
  });

  it("returns a fresh object (no aliasing)", () => {
    const source: WordTiming = { text: "ev", begin: 0, end: 1 };
    const result = cloneWord(source, {});
    expect(result).not.toBe(source);
    expect(result).toEqual(source);
  });
});

describe("synthesizeBracketedWord", () => {
  it("inherits syllableGroupId when both brackets share the same id", () => {
    const result = synthesizeBracketedWord({
      text: "e",
      begin: 0,
      end: 0.1,
      leftBracket: { text: "x", begin: -0.1, end: 0, syllableGroupId: "g1" },
      rightBracket: { text: "y", begin: 0.1, end: 0.2, syllableGroupId: "g1" },
    });
    expect(result.syllableGroupId).toBe("g1");
  });

  it("inherits from left bracket when right bracket is undefined", () => {
    const result = synthesizeBracketedWord({
      text: "e",
      begin: 0,
      end: 0.1,
      leftBracket: { text: "x", begin: -0.1, end: 0, syllableGroupId: "g1" },
    });
    expect(result.syllableGroupId).toBe("g1");
  });

  it("inherits from right bracket when left bracket is undefined", () => {
    const result = synthesizeBracketedWord({
      text: "e",
      begin: 0,
      end: 0.1,
      rightBracket: { text: "y", begin: 0.1, end: 0.2, syllableGroupId: "g1" },
    });
    expect(result.syllableGroupId).toBe("g1");
  });

  it("leaves syllableGroupId undefined when brackets disagree", () => {
    const result = synthesizeBracketedWord({
      text: "e",
      begin: 0,
      end: 0.1,
      leftBracket: { text: "x", begin: -0.1, end: 0, syllableGroupId: "g1" },
      rightBracket: { text: "y", begin: 0.1, end: 0.2, syllableGroupId: "g2" },
    });
    expect(result.syllableGroupId).toBeUndefined();
  });

  it("leaves syllableGroupId undefined when no bracket has an id", () => {
    const result = synthesizeBracketedWord({
      text: "e",
      begin: 0,
      end: 0.1,
      leftBracket: { text: "x", begin: -0.1, end: 0 },
      rightBracket: { text: "y", begin: 0.1, end: 0.2 },
    });
    expect(result.syllableGroupId).toBeUndefined();
  });

  it("leaves syllableGroupId undefined when no brackets exist", () => {
    const result = synthesizeBracketedWord({ text: "e", begin: 0, end: 0.1 });
    expect(result.syllableGroupId).toBeUndefined();
  });

  it("sets explicit when explicit=true is passed", () => {
    const result = synthesizeBracketedWord({ text: "e", begin: 0, end: 0.1, explicit: true });
    expect(result.explicit).toBe(true);
  });

  it("omits explicit when explicit=false or absent", () => {
    const result = synthesizeBracketedWord({ text: "e", begin: 0, end: 0.1, explicit: false });
    expect(result.explicit).toBeUndefined();
  });
});

describe("splitSourceWord", () => {
  it("returns N words, each inheriting source fields except text/begin/end", () => {
    const source: WordTiming = {
      text: "every",
      begin: 0,
      end: 0.9,
      explicit: true,
      syllableGroupId: "g1",
    };
    const result = splitSourceWord(source, [
      { text: "ev", begin: 0, end: 0.3 },
      { text: "er", begin: 0.3, end: 0.6 },
      { text: "y", begin: 0.6, end: 0.9 },
    ]);
    expect(result).toHaveLength(3);
    for (const w of result) {
      expect(w.explicit).toBe(true);
      expect(w.syllableGroupId).toBe("g1");
    }
    expect(result.map((w) => w.text)).toEqual(["ev", "er", "y"]);
    expect(result[0].begin).toBe(0);
    expect(result[2].end).toBe(0.9);
  });

  it("works for a standalone source word (no syllableGroupId)", () => {
    const source: WordTiming = { text: "hello", begin: 0, end: 1 };
    const result = splitSourceWord(source, [
      { text: "hel", begin: 0, end: 0.5 },
      { text: "lo", begin: 0.5, end: 1 },
    ]);
    expect(result[0].syllableGroupId).toBeUndefined();
    expect(result[1].syllableGroupId).toBeUndefined();
  });
});
