import { describe, expect, it } from "vitest";
import SrtToTtmlPage from "@/pages/converters/srt-to-ttml";

describe("SrtToTtmlPage", () => {
  it("exports a default component", () => {
    expect(typeof SrtToTtmlPage).toBe("function");
  });
});
