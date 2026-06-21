import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { AdvancedSection } from "@/ui/settings/advanced-section";

describe("AdvancedSection", () => {
  it("renders the preview renderer select and the built-in Cobalt instance", async () => {
    const screen = await render(<AdvancedSection />);
    await expect.element(screen.getByRole("combobox")).toBeInTheDocument();
    await expect.element(screen.getByText("Composer", { exact: true })).toBeInTheDocument();
  });

  it("updates the preview renderer setting from the select", async () => {
    useSettingsStore.setState({ previewRenderer: "braccato" });
    const screen = await render(<AdvancedSection />);
    await userEvent.selectOptions(screen.getByRole("combobox").element(), "am-lyrics");
    await expect.poll(() => useSettingsStore.getState().previewRenderer).toBe("am-lyrics");
  });

  it("adds a Cobalt instance through the add form", async () => {
    const screen = await render(<AdvancedSection />);
    await screen.getByPlaceholder("Name").fill("My Box");
    await screen.getByPlaceholder(/your-cobalt-instance/).fill("https://cobalt.example.com");
    await screen.getByRole("button", { name: "Add" }).click();
    await expect.poll(() => useSettingsStore.getState().cobaltInstances.length).toBe(1);
    await expect.poll(() => useSettingsStore.getState().cobaltInstances[0]?.label).toBe("My Box");
  });
});
