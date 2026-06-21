import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { GroupsSection } from "@/ui/help-sections/groups";

describe("GroupsSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<GroupsSection />);
    await expect.element(screen.getByRole("heading", { name: "Creating a group" })).toBeInTheDocument();
  });

  it("renders inline shortcut key badges", async () => {
    const screen = await render(<GroupsSection />);
    await expect.poll(() => screen.container.querySelectorAll("[data-inline-key-badge]").length).toBeGreaterThan(0);
  });
});
