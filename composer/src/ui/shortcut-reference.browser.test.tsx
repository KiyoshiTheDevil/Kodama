import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { KeyBadge, ShortcutSection } from "@/ui/shortcut-reference";

describe("KeyBadge", () => {
  it("renders a formatted key symbol", async () => {
    const screen = await render(<KeyBadge keyName="Shift" />);
    await expect.element(screen.getByText("⇧")).toBeInTheDocument();
  });
});

describe("ShortcutSection", () => {
  it("renders the title and each shortcut description", async () => {
    const screen = await render(
      <ShortcutSection title="Test Section" shortcuts={[{ keys: ["A"], description: "do a thing" }]} />,
    );
    await expect.element(screen.getByRole("heading", { name: "Test Section" })).toBeInTheDocument();
    await expect.element(screen.getByText("do a thing")).toBeInTheDocument();
  });
});
