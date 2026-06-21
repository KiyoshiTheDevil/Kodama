import { describe, expect, it } from "vitest";
import LrcToTtmlPage from "@/pages/converters/lrc-to-ttml";

describe("LrcToTtmlPage", () => {
  it("exports a default component", () => {
    expect(typeof LrcToTtmlPage).toBe("function");
  });
});
