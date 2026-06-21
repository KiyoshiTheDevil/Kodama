import { describe, expect, it } from "vitest";
import { EmptyState } from "@/ui/empty-state";
import { Button } from "@/ui/button";
import { render } from "@/test/render";

describe("EmptyState", () => {
  it("renders the primary message", async () => {
    const screen = await render(<EmptyState message="No lyrics yet" hint="Try importing a file" />);
    await expect.element(screen.getByText("No lyrics yet")).toBeInTheDocument();
  });

  it("renders the hint beneath the message", async () => {
    const screen = await render(<EmptyState message="No lyrics yet" hint="Try importing a file" />);
    await expect.element(screen.getByText("Try importing a file")).toBeInTheDocument();
  });

  it("renders an optional action node", async () => {
    const screen = await render(
      <EmptyState message="No lyrics yet" hint="Try importing a file" action={<Button>Import</Button>} />,
    );
    await expect.element(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("omits the action region when none is provided", async () => {
    const screen = await render(<EmptyState message="Empty" hint="Nothing here yet" />);
    expect(screen.container.querySelectorAll("button")).toHaveLength(0);
  });
});
