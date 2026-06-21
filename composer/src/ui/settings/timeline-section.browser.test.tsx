import { describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { TimelineSection } from "@/ui/settings/timeline-section";
import { useTimelineStore } from "@/views/timeline/timeline-store";

describe("TimelineSection", () => {
  it("renders sliders and toggles for the timeline settings", async () => {
    const screen = await render(<TimelineSection />);
    expect(screen.container.querySelectorAll('input[type="range"]').length).toBe(3);
    expect(screen.container.querySelectorAll('[role="switch"]').length).toBe(3);
  });

  it("flips the snap setting when its toggle is clicked", async () => {
    useSettingsStore.setState({ timelineSnap: true });
    const screen = await render(<TimelineSection />);
    const row = screen.getByText("Snap (magnet)").element().closest('[class*="justify-between"]');
    const toggle = row?.querySelector('[role="switch"]') as HTMLElement;
    toggle.click();
    await expect.poll(() => useSettingsStore.getState().timelineSnap).toBe(false);
  });

  it("adopts the live timeline zoom when its Use current action is clicked", async () => {
    useTimelineStore.setState({ zoom: 260 });
    const screen = await render(<TimelineSection />);
    await screen.getByRole("button", { name: "Use current" }).first().click();
    await expect.poll(() => useSettingsStore.getState().defaultZoom).toBe(260);
  });

  it("flips the horizontal-scroll setting when its toggle is clicked", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: false });
    const screen = await render(<TimelineSection />);
    const toggle = screen.getByRole("switch", { name: "Scroll wheel scrolls timeline" });
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect.poll(() => useSettingsStore.getState().timelineHorizontalScroll).toBe(true);
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");
  });
});
