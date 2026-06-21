import { describe, expect, it } from "vitest";
import { HelpSectionContent } from "@/ui/help-sections";
import { render } from "@/test/render";

const SECTION_IDS = [
  "getting-started",
  "keyboard-shortcuts",
  "importing",
  "editing",
  "syncing",
  "timeline",
  "groups",
  "preview",
  "exporting",
  "recovery",
  "ttml-standards",
  "about",
] as const;

describe("HelpSectionContent", () => {
  for (const id of SECTION_IDS) {
    it(`renders the "${id}" section without throwing`, async () => {
      const screen = await render(<HelpSectionContent section={id} />);
      expect(screen.container.textContent ?? "").not.toBe("");
    });
  }

  it("falls back to the getting-started section for an unknown id", async () => {
    const screen = await render(<HelpSectionContent section="not-a-real-section" />);
    expect(screen.container.textContent ?? "").not.toBe("");
  });

  it("recovery section covers the three escape hatches", async () => {
    const screen = await render(<HelpSectionContent section="recovery" />);
    const text = screen.container.textContent ?? "";
    expect(text).toMatch(/Download my work/);
    expect(text).toMatch(/\/recover/);
    const shortcutBadge = screen.container.querySelector("[data-inline-key-badge]");
    expect(shortcutBadge).not.toBeNull();
    expect(shortcutBadge?.textContent).toContain("E");
  });
});
