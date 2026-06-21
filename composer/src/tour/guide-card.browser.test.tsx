import { describe, expect, it } from "vitest";
import { GuideCard } from "@/tour/guide-card";
import { render } from "@/test/render";

describe("GuideCard", () => {
  it("renders nothing when state is null", async () => {
    await render(<GuideCard state={null} onSkip={() => {}} />);
    expect(document.body.querySelector(".bg-composer-bg-dark")).toBeNull();
  });

  it("renders the current task and step label when state is provided", async () => {
    const screen = await render(
      <GuideCard state={{ task: "Click Import", stepLabel: "Step 1 of 3", isComplete: false }} onSkip={() => {}} />,
    );
    expect(screen.container.textContent).toContain("Click Import");
    expect(screen.container.textContent).toContain("Step 1 of 3");
  });

  it("calls onSkip when the Skip button is clicked", async () => {
    let skipped = 0;
    const screen = await render(
      <GuideCard state={{ task: "Do thing", stepLabel: "Step 1", isComplete: false }} onSkip={() => skipped++} />,
    );
    await screen.getByRole("button", { name: "Skip" }).click();
    expect(skipped).toBe(1);
  });
});
