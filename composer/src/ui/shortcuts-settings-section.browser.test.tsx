import { describe, expect, it } from "vitest";
import { ShortcutsSettingsSection } from "@/ui/shortcuts-settings-section";
import { useShortcutBindingsStore } from "@/stores/shortcut-bindings";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";

describe("ShortcutsSettingsSection", () => {
  it("renders the search input and section headings from the registry", async () => {
    const screen = await render(<ShortcutsSettingsSection />);
    await expect.element(screen.getByPlaceholder("Search shortcuts")).toBeInTheDocument();
    await expect.element(screen.getByText("General")).toBeInTheDocument();
  });

  it("labels the search input", async () => {
    const screen = await render(<ShortcutsSettingsSection />);
    await expect.element(screen.getByRole("textbox", { name: "Search shortcuts" })).toBeInTheDocument();
  });

  it("filters shortcuts by description as the user types", async () => {
    const screen = await render(<ShortcutsSettingsSection />);
    const input = screen.getByPlaceholder("Search shortcuts");
    await input.fill("settings");
    expect(document.body.textContent).toContain("Open settings");
    expect(document.body.textContent).not.toContain("Play / Pause");
  });

  it("shows an empty state when no shortcuts match", async () => {
    const screen = await render(<ShortcutsSettingsSection />);
    const input = screen.getByPlaceholder("Search shortcuts");
    await input.fill("thiswillmatchnothing");
    await expect.element(screen.getByText(/No shortcuts match/)).toBeInTheDocument();
  });

  it("disables 'Reset all' when there are no overrides", async () => {
    const screen = await render(<ShortcutsSettingsSection />);
    const resetButton = screen.getByRole("button", { name: /Reset all$/ });
    expect((resetButton.element() as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables 'Reset all' when at least one binding is overridden", async () => {
    useShortcutBindingsStore.setState({ overrides: { "global.help": { key: "x" } } });
    const screen = await render(<ShortcutsSettingsSection />);
    const resetButton = screen.getByRole("button", { name: /Reset all$/ });
    expect((resetButton.element() as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears all overrides when Reset all is confirmed", async () => {
    useShortcutBindingsStore.setState({ overrides: { "global.help": { key: "x" } } });
    useSettingsStore.setState({ confirmResetShortcuts: false });
    const screen = await render(<ShortcutsSettingsSection />);
    await screen.getByRole("button", { name: /Reset all$/ }).click();
    expect(Object.keys(useShortcutBindingsStore.getState().overrides).length).toBe(0);
  });
});
