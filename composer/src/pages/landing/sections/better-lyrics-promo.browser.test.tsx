import { describe, expect, it } from "vitest";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { render } from "@/test/render";

describe("BetterLyricsPromo", () => {
  it("renders the promo card with at least one outbound link", async () => {
    const screen = await render(<BetterLyricsPromo />, { withRouter: true });
    const links = screen.container.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
  });
});
