import { describe, expect, it } from "vitest";
import { IconStar } from "@tabler/icons-react";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { render } from "@/test/render";

describe("FeatureGrid", () => {
  it("renders title and one card per feature", async () => {
    const features = [
      { icon: IconStar, title: "Fast", description: "Quick" },
      { icon: IconStar, title: "Accurate", description: "Precise" },
      { icon: IconStar, title: "Free", description: "Open" },
    ];
    const screen = await render(<FeatureGrid title="Why us" features={features} />);
    await expect.element(screen.getByText("Why us")).toBeInTheDocument();
    expect(screen.container.textContent).toContain("Fast");
    expect(screen.container.textContent).toContain("Accurate");
    expect(screen.container.textContent).toContain("Free");
  });
});
