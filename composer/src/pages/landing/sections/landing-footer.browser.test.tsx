import { describe, expect, it } from "vitest";
import { LandingFooter } from "@/pages/landing/sections/landing-footer";
import { render } from "@/test/render";

describe("LandingFooter", () => {
  it("renders a footer with at least one link", async () => {
    const screen = await render(<LandingFooter />, { withRouter: true });
    expect(screen.container.querySelector("footer")).not.toBeNull();
    expect(screen.container.querySelectorAll("a").length).toBeGreaterThan(0);
  });
});
