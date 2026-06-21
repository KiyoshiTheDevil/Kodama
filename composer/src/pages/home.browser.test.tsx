import { describe, expect, it } from "vitest";
import HomePage from "@/pages/home";

describe("HomePage", () => {
  it("exports a default component function", () => {
    expect(typeof HomePage).toBe("function");
  });
});
