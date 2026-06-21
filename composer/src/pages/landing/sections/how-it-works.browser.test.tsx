import { describe, expect, it } from "vitest";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { render } from "@/test/render";

describe("HowItWorks", () => {
  it("renders title and a numbered list of steps", async () => {
    const screen = await render(
      <HowItWorks
        title="Three steps"
        steps={[
          { title: "Step A", description: "Do A" },
          { title: "Step B", description: "Do B" },
          { title: "Step C", description: "Do C" },
        ]}
      />,
    );
    await expect.element(screen.getByText("Three steps")).toBeInTheDocument();
    expect(screen.container.querySelectorAll("ol > li").length).toBe(3);
    expect(screen.container.textContent).toContain("Step A");
  });
});
