import { describe, expect, it } from "vitest";
import { PageHead } from "@/seo/page-head";

describe("PageHead", () => {
  it("exports a component", () => {
    expect(typeof PageHead).toBe("function");
  });
});
