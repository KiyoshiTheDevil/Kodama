import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { RecoverySection } from "@/ui/help-sections/recovery";

describe("RecoverySection", () => {
  it("renders the section content", async () => {
    const screen = await render(<RecoverySection />);
    await expect.element(screen.getByRole("heading", { name: "The app is frozen" })).toBeInTheDocument();
  });

  it("renders inline shortcut key badges", async () => {
    const screen = await render(<RecoverySection />);
    await expect.poll(() => screen.container.querySelectorAll("[data-inline-key-badge]").length).toBeGreaterThan(0);
  });
});
