import { describe, expect, it } from "vitest";
import { Popover } from "@/ui/popover";
import { render } from "@/test/render";

describe("Popover", () => {
  it("renders the trigger and keeps the popover content hidden initially", async () => {
    const screen = await render(
      <Popover trigger={<button type="button">Open</button>}>
        <div>Popover body</div>
      </Popover>,
    );
    await expect.element(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Popover body");
  });

  it("opens the popover when the trigger is clicked", async () => {
    const screen = await render(
      <Popover trigger={<button type="button">Open</button>}>
        <div>Popover body</div>
      </Popover>,
    );
    await screen.getByRole("button", { name: "Open" }).click();
    await expect.element(screen.getByText("Popover body")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", async () => {
    const screen = await render(
      <Popover trigger={<button type="button">Open</button>}>
        <div>Popover body</div>
      </Popover>,
    );
    await screen.getByRole("button", { name: "Open" }).click();
    await expect.element(screen.getByText("Popover body")).toBeInTheDocument();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await expect.element(screen.getByText("Popover body")).not.toBeInTheDocument();
  });

  it("invokes the children render-prop with a close handler", async () => {
    let closes = 0;
    const screen = await render(
      <Popover trigger={<button type="button">Open</button>}>
        {(close) => (
          <button
            type="button"
            onClick={() => {
              closes++;
              close();
            }}
          >
            Dismiss
          </button>
        )}
      </Popover>,
    );
    await screen.getByRole("button", { name: "Open" }).click();
    await screen.getByRole("button", { name: "Dismiss" }).click();
    expect(closes).toBe(1);
    await expect.element(screen.getByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });
});
