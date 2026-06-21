import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { SelectSetting, SliderSetting, ToggleSetting } from "@/ui/settings/setting-controls";

// -- Helpers ------------------------------------------------------------------

function setRangeValue(input: HTMLInputElement, value: number): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// -- Tests --------------------------------------------------------------------

describe("SliderSetting", () => {
  it("displays the formatted current value from the store", async () => {
    useSettingsStore.setState({ defaultZoom: 100 });
    const screen = await render(
      <SliderSetting
        label="Zoom"
        description="Initial zoom level"
        settingKey="defaultZoom"
        min={20}
        max={500}
        step={20}
        format={(v) => `${v} px/s`}
      />,
    );
    await expect.element(screen.getByText("100 px/s")).toBeInTheDocument();
  });

  it("writes the new value to the store on change", async () => {
    useSettingsStore.setState({ defaultZoom: 100 });
    const screen = await render(
      <SliderSetting
        label="Zoom"
        description="Initial zoom level"
        settingKey="defaultZoom"
        min={20}
        max={500}
        step={20}
      />,
    );
    setRangeValue(screen.getByRole("slider").element() as HTMLInputElement, 260);
    await expect.poll(() => useSettingsStore.getState().defaultZoom).toBe(260);
  });

  it("labels the slider with the provided label prop", async () => {
    useSettingsStore.setState({ defaultZoom: 100 });
    const screen = await render(
      <SliderSetting
        label="Zoom"
        description="Initial zoom level"
        settingKey="defaultZoom"
        min={20}
        max={500}
        step={20}
      />,
    );
    await expect.element(screen.getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
  });

  it("invokes the action callback when the action button is clicked", async () => {
    let invoked = false;
    const screen = await render(
      <SliderSetting
        label="Zoom"
        description="Initial zoom level"
        settingKey="defaultZoom"
        min={20}
        max={500}
        step={20}
        action={{
          label: "Use current",
          onClick: () => {
            invoked = true;
          },
        }}
      />,
    );
    await screen.getByRole("button", { name: "Use current" }).click();
    await expect.poll(() => invoked).toBe(true);
  });
});

describe("ToggleSetting", () => {
  it("reflects the store value via aria-checked", async () => {
    useSettingsStore.setState({ followPlayhead: true });
    const screen = await render(<ToggleSetting label="Follow" description="Auto-scroll" settingKey="followPlayhead" />);
    await expect.element(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("flips the store value when clicked", async () => {
    useSettingsStore.setState({ followPlayhead: true });
    const screen = await render(<ToggleSetting label="Follow" description="Auto-scroll" settingKey="followPlayhead" />);
    await screen.getByRole("switch").click();
    await expect.poll(() => useSettingsStore.getState().followPlayhead).toBe(false);
  });
});

describe("SelectSetting", () => {
  const granularityOptions = [
    { value: "word", label: "Word" },
    { value: "line", label: "Line" },
  ];

  it("reflects the store value as the selected option", async () => {
    useSettingsStore.setState({ defaultGranularity: "line" });
    const screen = await render(
      <SelectSetting
        label="Granularity"
        description="Timing mode"
        settingKey="defaultGranularity"
        options={granularityOptions}
      />,
    );
    await expect.element(screen.getByRole("combobox")).toHaveValue("line");
  });

  it("writes the chosen option to the store", async () => {
    useSettingsStore.setState({ defaultGranularity: "word" });
    const screen = await render(
      <SelectSetting
        label="Granularity"
        description="Timing mode"
        settingKey="defaultGranularity"
        options={granularityOptions}
      />,
    );
    await userEvent.selectOptions(screen.getByRole("combobox").element(), "line");
    await expect.poll(() => useSettingsStore.getState().defaultGranularity).toBe("line");
  });
});
