import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { ImportSection } from "@/ui/help-sections/importing";

describe("ImportSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<ImportSection />);
    await expect.element(screen.getByRole("heading", { name: "Audio files" })).toBeInTheDocument();
  });

  it("renders inline shortcut key badges", async () => {
    const screen = await render(<ImportSection />);
    await expect.poll(() => screen.container.querySelectorAll("[data-inline-key-badge]").length).toBeGreaterThan(0);
  });
});
