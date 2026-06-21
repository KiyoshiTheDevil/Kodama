import { describe, expect, it } from "vitest";
import { Tooltip } from "@/ui/tooltip";
import { render } from "@/test/render";

describe("Tooltip", () => {
  it("renders the trigger element", async () => {
    const screen = await render(
      <Tooltip content="More info" delay={0}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    await expect.element(screen.getByRole("button", { name: "Hover me" })).toBeInTheDocument();
  });

  it("does not show the tooltip content before interaction", async () => {
    // No delay={0}: the real hover delay keeps a stray harness mouseenter from opening the tooltip pre-assertion.
    await render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    expect(document.body.textContent).not.toContain("More info");
  });

  it("shows the tooltip on focus", async () => {
    const screen = await render(
      <Tooltip content="More info" delay={0}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Hover me" }).element() as HTMLElement;
    trigger.focus();
    await expect.element(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const screen = await render(
      <Tooltip content="More info" delay={0}>
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Hover me" }).element() as HTMLElement;
    trigger.focus();
    await expect.element(screen.getByRole("tooltip")).toBeInTheDocument();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
  });
});
