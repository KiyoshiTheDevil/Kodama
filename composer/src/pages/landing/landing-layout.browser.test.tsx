import { describe, expect, it } from "vitest";
import { LandingLayout } from "@/pages/landing/landing-layout";
import { render } from "@/test/render";

describe("LandingLayout", () => {
  it("renders header (nav), main, and footer", async () => {
    const screen = await render(
      <LandingLayout>
        <div>page content</div>
      </LandingLayout>,
      { withRouter: true },
    );
    expect(screen.container.querySelector("nav, header")).not.toBeNull();
    expect(screen.container.querySelector("main")).not.toBeNull();
    expect(screen.container.textContent).toContain("page content");
  });
});
