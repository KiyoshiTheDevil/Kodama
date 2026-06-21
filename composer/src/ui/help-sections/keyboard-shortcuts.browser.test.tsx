import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { KeyboardShortcutsSection } from "@/ui/help-sections/keyboard-shortcuts";

describe("KeyboardShortcutsSection", () => {
  it("renders a shortcut section", async () => {
    const screen = await render(<KeyboardShortcutsSection />);
    await expect.element(screen.getByRole("heading", { name: "Navigation" })).toBeInTheDocument();
  });

  it("lists shortcut descriptions", async () => {
    const screen = await render(<KeyboardShortcutsSection />);
    await expect.element(screen.getByText("Go to Import tab")).toBeInTheDocument();
  });

  it("lists the rolling edit and split word shortcuts", async () => {
    const screen = await render(<KeyboardShortcutsSection />);
    await expect.element(screen.getByText("Toggle rolling edit")).toBeInTheDocument();
    await expect.element(screen.getByText("Split word into words")).toBeInTheDocument();
    await expect.element(screen.getByText("Mark / unmark explicit")).toBeInTheDocument();
  });

  it("lists the select word under playhead shortcut", async () => {
    const screen = await render(<KeyboardShortcutsSection />);
    await expect.element(screen.getByText("Select word under playhead")).toBeInTheDocument();
  });
});
