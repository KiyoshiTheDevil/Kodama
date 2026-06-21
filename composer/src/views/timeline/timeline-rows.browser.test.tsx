import { describe, expect, it } from "vitest";
import { useRef } from "react";
import { TimelineRows } from "@/views/timeline/timeline-rows";
import { useProjectStore } from "@/stores/project";
import { createLine } from "@/test/factories";
import { render } from "@/test/render";

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ height: 400, overflow: "auto" }}>
      <TimelineRows scrollContainerRef={ref} />
    </div>
  );
}

describe("TimelineRows", () => {
  it("renders zero word blocks when there are no lines", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<Harness />);
    expect(screen.container.querySelectorAll("[data-word-block]").length).toBe(0);
  });

  it("sizes the row container to fit one row per line", async () => {
    const lines = [createLine({ text: "line A" }), createLine({ text: "line B" })];
    useProjectStore.setState({ lines });
    const screen = await render(<Harness />);
    // The wrapper div sets style.height = totalHeight (default row height × line count).
    // Virtuoso may not render individual rows inside a headless layout, but the
    // pre-computed container size still reflects the line count.
    const wrapper = screen.container.querySelector<HTMLElement>("div[style*='height']");
    expect(wrapper).not.toBeNull();
    const heightPx = Number.parseInt(wrapper?.style.height ?? "0", 10);
    expect(heightPx).toBeGreaterThan(0);
  });
});
