import { describe, expect, it } from "vitest";
import { LandingNav } from "@/pages/landing/sections/landing-nav";
import { render } from "@/test/render";

describe("LandingNav", () => {
  it("renders nav element with at least one link", async () => {
    const screen = await render(<LandingNav />, { withRouter: true });
    expect(screen.container.querySelector("nav, header")).not.toBeNull();
    expect(screen.container.querySelectorAll("a").length).toBeGreaterThan(0);
  });
});
