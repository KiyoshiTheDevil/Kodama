import { describe, expect, it } from "vitest";
import { AnalyticsScripts } from "@/seo/analytics";

describe("AnalyticsScripts", () => {
  it("exports a component", () => {
    expect(typeof AnalyticsScripts).toBe("function");
  });
});
