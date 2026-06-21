import type { WordTiming } from "@/domain/word/timing";
import { splitIntoWordsWithMeta } from "@/utils/sync-helpers";
import { describe, expect, it } from "vitest";
import { reconstructLineText, wordContentSpans } from "@/domain/line/reconstruct-text";

// -- Helpers ------------------------------------------------------------------

function w(text: string): WordTiming {
  return { text, begin: 0, end: 1 };
}

// -- reconstructLineText ------------------------------------------------------

describe("reconstructLineText", () => {
  it("returns an empty string for no words", () => {
    expect(reconstructLineText([], "|")).toBe("");
  });

  it("returns a single word's text unchanged", () => {
    expect(reconstructLineText([w("world")], "|")).toBe("world");
  });

  it("joins space-separated words via their embedded trailing spaces", () => {
    expect(reconstructLineText([w("hello "), w("world")], "|")).toBe("hello world");
  });

  it("inserts the split character at a space-free joint (same-token syllables)", () => {
    expect(reconstructLineText([w("hel"), w("lo")], "|")).toBe("hel|lo");
  });

  it("mixes syllable joints and word spaces", () => {
    expect(reconstructLineText([w("hel"), w("lo "), w("world")], "|")).toBe("hel|lo world");
  });

  it("uses the provided split character", () => {
    expect(reconstructLineText([w("a"), w("b")], "/")).toBe("a/b");
  });

  it("never appends a split character after the final word", () => {
    expect(reconstructLineText([w("foo"), w("bar")], "|")).toBe("foo|bar");
  });
});

// -- Round-trip contract ------------------------------------------------------
//
// The whole point of reinserting the split character: reconstructed text must
// tokenize 1:1 back to the same word count it was built from.

describe("reconstructLineText round-trips through splitIntoWordsWithMeta", () => {
  for (const text of ["hello world", "hel|lo world", "one two three", "a|b|c", "single", "two|part"]) {
    it(`round-trips "${text}"`, () => {
      const { parts, trailingSpace } = splitIntoWordsWithMeta(text);
      const words = parts.map((part, i) => w(trailingSpace[i] ? `${part} ` : part));
      const reconstructed = reconstructLineText(words, "|");
      expect(reconstructed).toBe(text);
      expect(splitIntoWordsWithMeta(reconstructed).parts).toEqual(parts);
    });
  }
});

// -- wordContentSpans ---------------------------------------------------------

describe("wordContentSpans", () => {
  it("returns an empty array for no words", () => {
    expect(wordContentSpans([], "|")).toEqual([]);
  });

  it("maps plain space-separated words to their content ranges", () => {
    expect(wordContentSpans([w("Hello "), w("world")], "|")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it("excludes a trailing space from the span end", () => {
    const spans = wordContentSpans([w("Hello "), w("world")], "|");
    expect(spans[0]).toEqual({ start: 0, end: 5 });
  });

  it("skips a leading space in the span start", () => {
    const words = [w("hello "), w(" world")];
    const reconstructed = reconstructLineText(words, "|");
    const spans = wordContentSpans(words, "|");
    expect(reconstructed).toBe("hello  world");
    expect(spans[1]).toEqual({ start: 7, end: 12 });
    expect(reconstructed.slice(spans[1].start, spans[1].end)).toBe("world");
  });

  it("shifts subsequent offsets by the split character at a space-free joint", () => {
    const words = [w("hel"), w("lo world")];
    const reconstructed = reconstructLineText(words, "|");
    const spans = wordContentSpans(words, "|");
    expect(reconstructed).toBe("hel|lo world");
    expect(spans).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 12 },
    ]);
    for (let i = 0; i < words.length; i++) {
      expect(reconstructed.slice(spans[i].start, spans[i].end)).toBe(words[i].text.trim());
    }
  });

  it("accounts for a multi-character split string", () => {
    const words = [w("hel"), w("lo")];
    const reconstructed = reconstructLineText(words, "::");
    const spans = wordContentSpans(words, "::");
    expect(reconstructed).toBe("hel::lo");
    expect(spans).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 7 },
    ]);
  });

  it("cross-checks every span against reconstructLineText output", () => {
    const splitChar = "|";
    const words = [w("hel"), w("lo "), w("brave "), w("new"), w(" world")];
    const reconstructed = reconstructLineText(words, splitChar);
    const spans = wordContentSpans(words, splitChar);
    expect(spans).toHaveLength(words.length);
    for (let i = 0; i < words.length; i++) {
      expect(reconstructed.slice(spans[i].start, spans[i].end)).toBe(words[i].text.trim());
    }
  });
});
