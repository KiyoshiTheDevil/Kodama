import { describe, expect, it } from "vitest";
import { BetterLyricsLogo } from "@/ui/icons/better-lyrics-logo";
import { render } from "@/test/render";

describe("BetterLyricsLogo", () => {
  it("renders an SVG element with default size", async () => {
    const screen = await render(<BetterLyricsLogo />);
    const svg = screen.container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("respects a custom size", async () => {
    const screen = await render(<BetterLyricsLogo size={48} />);
    const svg = screen.container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
  });

  it("marks the SVG as decorative via aria-hidden", async () => {
    const screen = await render(<BetterLyricsLogo />);
    const svg = screen.container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards arbitrary SVG props (e.g. className)", async () => {
    const screen = await render(<BetterLyricsLogo className="text-red-500" />);
    const svg = screen.container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("text-red-500");
  });
});
