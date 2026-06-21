import { describe, expect, it } from "vitest";
import { mergeWordText } from "@/utils/word-merge";

describe("mergeWordText", () => {
  it("drops spaces between merged words", () => {
    expect(mergeWordText(["every ", "day"])).toBe("everyday");
    expect(mergeWordText(["a ", "b ", "c"])).toBe("abc");
  });
  it("keeps the final word's trailing space", () => {
    expect(mergeWordText(["every ", "day "])).toBe("everyday ");
  });
});
