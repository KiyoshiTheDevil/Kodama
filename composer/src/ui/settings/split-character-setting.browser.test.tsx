import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { SplitCharacterSetting } from "@/ui/settings/split-character-setting";

describe("SplitCharacterSetting", () => {
  it("shows the current split character", async () => {
    useSettingsStore.setState({ splitCharacter: "|" });
    const screen = await render(<SplitCharacterSetting />);
    await expect.element(screen.getByRole("button", { name: "|" })).toBeInTheDocument();
  });

  it("opens the capture modal when the character button is clicked", async () => {
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "|" }).click();
    await expect.element(screen.getByText(/Press a character/)).toBeInTheDocument();
  });

  it("captures an allowed character and stores it", async () => {
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "|" }).click();
    await expect.element(screen.getByText(/Press a character/)).toBeInTheDocument();
    await userEvent.keyboard("/");
    await expect.poll(() => useSettingsStore.getState().splitCharacter).toBe("/");
  });

  it("rejects letters and keeps the existing character", async () => {
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "|" }).click();
    await userEvent.keyboard("a");
    await expect.element(screen.getByText(/cannot be used/)).toBeInTheDocument();
    expect(useSettingsStore.getState().splitCharacter).toBe("|");
  });

  it("warns before accepting a character common in lyrics", async () => {
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "|" }).click();
    await userEvent.keyboard(",");
    await expect.element(screen.getByText(/commonly appears in lyrics/)).toBeInTheDocument();
    await screen.getByRole("button", { name: "Use anyway" }).click();
    await expect.poll(() => useSettingsStore.getState().splitCharacter).toBe(",");
  });

  it("cancels capture on Escape", async () => {
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "|" }).click();
    await expect.element(screen.getByText(/Press a character/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByText(/Press a character/)).not.toBeInTheDocument();
  });

  it("resets to the default character", async () => {
    useSettingsStore.setState({ splitCharacter: "/" });
    const screen = await render(<SplitCharacterSetting />);
    await screen.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => useSettingsStore.getState().splitCharacter).toBe("|");
  });
});
