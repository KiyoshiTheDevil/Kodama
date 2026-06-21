import { describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { GeneralSection } from "@/ui/settings/general-section";

describe("GeneralSection", () => {
  it("renders a switch for each toggle setting", async () => {
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    expect(screen.container.querySelectorAll('[role="switch"]').length).toBe(5);
  });

  it("renders the background vocal toggles", async () => {
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    await expect.element(screen.getByRole("switch", { name: "Auto-extract background vocals" })).toBeInTheDocument();
    await expect.element(screen.getByRole("switch", { name: "Merge standalone background lines" })).toBeInTheDocument();
    await expect.element(screen.getByRole("switch", { name: "Preserve brackets when extracting" })).toBeInTheDocument();
  });

  it("flips preserveBracketsOnExtraction when its switch is clicked", async () => {
    useSettingsStore.setState({ preserveBracketsOnExtraction: false });
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    await screen.getByRole("switch", { name: "Preserve brackets when extracting" }).click();
    await expect.poll(() => useSettingsStore.getState().preserveBracketsOnExtraction).toBe(true);
  });

  it("flips autoExtractBackgroundVocals when its switch is clicked", async () => {
    useSettingsStore.setState({ autoExtractBackgroundVocals: true });
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    await screen.getByRole("switch", { name: "Auto-extract background vocals" }).click();
    await expect.poll(() => useSettingsStore.getState().autoExtractBackgroundVocals).toBe(false);
  });

  it("flips mergeStandaloneBackgroundLines when its switch is clicked", async () => {
    useSettingsStore.setState({ mergeStandaloneBackgroundLines: true });
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    await screen.getByRole("switch", { name: "Merge standalone background lines" }).click();
    await expect.poll(() => useSettingsStore.getState().mergeStandaloneBackgroundLines).toBe(false);
  });

  it("calls onResetTour and onClose when Reset tour is clicked", async () => {
    let resetTour = false;
    let closed = false;
    const screen = await render(
      <GeneralSection
        onResetTour={() => {
          resetTour = true;
        }}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    await screen.getByRole("button", { name: /Reset tour/ }).click();
    await expect.poll(() => resetTour).toBe(true);
    await expect.poll(() => closed).toBe(true);
  });

  it("restores settings to defaults when Reset all is confirmed", async () => {
    useSettingsStore.setState({ defaultZoom: 999, confirmResetSettings: false });
    const screen = await render(<GeneralSection onResetTour={() => {}} onClose={() => {}} />);
    await screen.getByRole("button", { name: /Reset all/ }).click();
    await expect.poll(() => useSettingsStore.getState().defaultZoom).toBe(100);
  });
});
