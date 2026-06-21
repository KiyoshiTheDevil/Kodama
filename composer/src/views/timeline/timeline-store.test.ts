import { describe, expect, it } from "vitest";
import { useTimelineStore } from "@/views/timeline/timeline-store";

describe("rollingEditMode", () => {
  it("defaults to off and toggles", () => {
    useTimelineStore.setState({ rollingEditMode: false });
    expect(useTimelineStore.getState().rollingEditMode).toBe(false);
    useTimelineStore.getState().toggleRollingEditMode();
    expect(useTimelineStore.getState().rollingEditMode).toBe(true);
  });
});
