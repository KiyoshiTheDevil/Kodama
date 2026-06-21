/**
 * @vitest-environment node
 */
import { getExplicitSnippet } from "@/utils/explicit-snippet";
import { describe, expect, it } from "vitest";

describe("getExplicitSnippet", () => {
  it("returns the full source when it fits under max", () => {
    const result = getExplicitSnippet("I fuck you", [1], 80);
    expect(result).not.toBeNull();
    expect(result?.before).toBe("I ");
    expect(result?.word).toBe("fuck");
    expect(result?.after).toBe(" you");
    expect(result?.leadingEllipsis).toBe(false);
    expect(result?.trailingEllipsis).toBe(false);
  });

  it("centers the snippet around the word when source overflows", () => {
    const source =
      "this is a very long lyric line that goes on and on and contains the word fuck buried way past any reasonable truncation boundary and continues for a while after";
    const wordIndex = source.split(/\s+/).indexOf("fuck");
    const result = getExplicitSnippet(source, [wordIndex], 60);
    expect(result).not.toBeNull();
    expect(result?.word).toBe("fuck");
    const total = result!.before.length + result!.word.length + result!.after.length;
    expect(total).toBeLessThanOrEqual(60);
    expect(result?.leadingEllipsis).toBe(true);
    expect(result?.trailingEllipsis).toBe(true);
  });

  it("no leading ellipsis when word is near the start", () => {
    const source = "fuck this entire long sentence that keeps on going forever and ever beyond reason";
    const result = getExplicitSnippet(source, [0], 40);
    expect(result?.leadingEllipsis).toBe(false);
    expect(result?.word).toBe("fuck");
    expect(result?.trailingEllipsis).toBe(true);
  });

  it("no trailing ellipsis when word is near the end", () => {
    const source = "this is a long opening that runs and runs and finally ends with shit";
    const wordIndex = source.split(/\s+/).indexOf("shit");
    const result = getExplicitSnippet(source, [wordIndex], 40);
    expect(result?.trailingEllipsis).toBe(false);
    expect(result?.word).toBe("shit");
    expect(result?.leadingEllipsis).toBe(true);
  });

  it("returns null when any wordIndex is out of range", () => {
    expect(getExplicitSnippet("hello world", [5], 80)).toBeNull();
    expect(getExplicitSnippet("hello world", [-1], 80)).toBeNull();
  });

  it("returns null for an empty index list", () => {
    expect(getExplicitSnippet("hello world", [], 80)).toBeNull();
  });

  it("handles punctuation attached to the word", () => {
    const source = "you ain't really doin' this shit, like who you doin' it with?";
    const wordIndex = source.split(/\s+/).indexOf("shit,");
    const result = getExplicitSnippet(source, [wordIndex], 80);
    expect(result?.word).toBe("shit,");
  });

  it("spans every syllable of a syllable-split word", () => {
    const result = getExplicitSnippet("I fu|cking love it", [1, 2], 80);
    expect(result).not.toBeNull();
    expect(result?.before).toBe("I ");
    expect(result?.word).toBe("fu|cking");
    expect(result?.after).toBe(" love it");
  });
});
