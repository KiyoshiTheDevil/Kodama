import { describe, expect, it } from "vitest";
import { SnapGuideline } from "@/views/timeline/snap-guideline";
import { GUTTER_WIDTH, useTimelineStore } from "@/views/timeline/timeline-store";
import { render } from "@/test/render";

describe("SnapGuideline", () => {
  it("renders nothing when no snap anchor is active", async () => {
    useTimelineStore.setState({ snappedAnchorTime: null });
    const screen = await render(<SnapGuideline />);
    expect(screen.container.firstChild).toBeNull();
  });

  it("renders a guideline when a snap anchor is set", async () => {
    useTimelineStore.setState({ snappedAnchorTime: 2, zoom: 100, scrollLeft: 0 });
    const screen = await render(<SnapGuideline />);
    expect(screen.container.firstChild).not.toBeNull();
  });

  it("positions the line at anchorTime * zoom - scrollLeft + GUTTER_WIDTH", async () => {
    useTimelineStore.setState({ snappedAnchorTime: 3, zoom: 100, scrollLeft: 50 });
    const screen = await render(<SnapGuideline />);
    const line = screen.container.querySelector(".absolute.top-0.bottom-0") as HTMLElement;
    const expected = 3 * 100 - 50 + GUTTER_WIDTH;
    expect(line.style.left).toBe(`${expected}px`);
  });

  it("uses a dashed yellow border for the line stroke", async () => {
    useTimelineStore.setState({ snappedAnchorTime: 1, zoom: 100, scrollLeft: 0 });
    const screen = await render(<SnapGuideline />);
    const line = screen.container.querySelector(".absolute.top-0.bottom-0") as HTMLElement;
    expect(line.style.borderLeft).toContain("dashed");
    expect(line.style.borderLeft).toContain("rgba(255, 214, 107");
  });
});
