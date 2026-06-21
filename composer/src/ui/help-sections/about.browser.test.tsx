import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { AboutSection } from "@/ui/help-sections/about";

describe("AboutSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<AboutSection />);
    await expect.element(screen.getByRole("heading", { name: "What it is" })).toBeInTheDocument();
  });

  it("links to the source repository", async () => {
    const screen = await render(<AboutSection />);
    await expect.element(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
  });

  it("documents commercial licensing with a contact link", async () => {
    const screen = await render(<AboutSection />);
    await expect.element(screen.getByRole("heading", { name: "Commercial use" })).toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "composer@boidu.dev" }))
      .toHaveAttribute("href", "mailto:composer@boidu.dev");
  });
});
