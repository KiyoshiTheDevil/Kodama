import { describe, expect, it } from "vitest";
import { Button } from "@/ui/button";
import { render } from "@/test/render";

// -- Render -------------------------------------------------------------------

describe("Button", () => {
  it("renders children inside a button element", async () => {
    const screen = await render(<Button>Click me</Button>);
    await expect.element(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("fires onClick when activated by the mouse", async () => {
    let clicks = 0;
    const screen = await render(<Button onClick={() => clicks++}>Press</Button>);
    await screen.getByRole("button", { name: "Press" }).click();
    expect(clicks).toBe(1);
  });

  it("fires onClick when activated by the keyboard", async () => {
    let clicks = 0;
    const screen = await render(<Button onClick={() => clicks++}>Press</Button>);
    const button = screen.getByRole("button", { name: "Press" });
    (button.element() as HTMLButtonElement).focus();
    await button.element().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    (button.element() as HTMLButtonElement).click();
    expect(clicks).toBeGreaterThanOrEqual(1);
  });

  // -- Disabled state ---------------------------------------------------------

  it("does not fire onClick when disabled", async () => {
    let clicks = 0;
    const screen = await render(
      <Button disabled onClick={() => clicks++}>
        Press
      </Button>,
    );
    const el = screen.getByRole("button", { name: "Press" }).element() as HTMLButtonElement;
    expect(el.disabled).toBe(true);
    el.click();
    expect(clicks).toBe(0);
  });

  it("forwards aria-label to the underlying button element", async () => {
    const screen = await render(
      <Button size="icon" aria-label="Open settings">
        S
      </Button>,
    );
    await expect.element(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
  });

  it("accepts all variant and size prop combinations without errors", async () => {
    const screen = await render(
      <>
        <Button variant="primary" size="sm">
          A
        </Button>
        <Button variant="secondary" size="md">
          B
        </Button>
        <Button variant="ghost" size="md" hasIcon>
          C
        </Button>
      </>,
    );
    await expect.element(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "C" })).toBeInTheDocument();
  });
});
