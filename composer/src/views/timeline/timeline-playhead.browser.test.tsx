import { describe, expect, it } from "vitest";
import { useEffect, useRef, useState } from "react";
import { TimelinePlayhead } from "@/views/timeline/timeline-playhead";
import { useAudioStore } from "@/stores/audio";
import { useTimelineStore, GUTTER_WIDTH } from "@/views/timeline/timeline-store";
import { render } from "@/test/render";

function Harness({ containerHeight = 200 }: { containerHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <div
      ref={ref}
      data-test="scroll-container"
      style={{
        overflow: "auto",
        width: 600,
        height: containerHeight,
        position: "relative",
      }}
    >
      <div style={{ width: 2000, height: 800, position: "relative" }}>
        {ready && <TimelinePlayhead containerHeight={containerHeight} scrollContainerRef={ref} />}
      </div>
    </div>
  );
}

function waitForFrames(n = 2): Promise<void> {
  return new Promise((resolve) => {
    let remaining = n;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

describe("TimelinePlayhead", () => {
  it("translates the playhead based on currentTime × zoom", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 5 });
    useTimelineStore.setState({ zoom: 50, scrollLeft: 0, isDraggingPlayhead: false });
    const screen = await render(<Harness />);
    await waitForFrames(3);
    const playhead = screen.container.querySelector("[style*='translate3d']") as HTMLElement;
    expect(playhead).not.toBeNull();
    const expectedX = 5 * 50 - 0 + GUTTER_WIDTH - 1;
    expect(playhead.style.transform).toBe(`translate3d(${expectedX}px, 0px, 0px)`);
  });

  it("subtracts the scroll container's scrollLeft when positioning", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 10 });
    useTimelineStore.setState({ zoom: 50, scrollLeft: 100, isDraggingPlayhead: false });
    const screen = await render(<Harness />);
    const container = screen.container.querySelector<HTMLDivElement>("[data-test='scroll-container']");
    if (container) container.scrollLeft = 100;
    await waitForFrames(3);
    const playhead = screen.container.querySelector("[style*='translate3d']") as HTMLElement;
    const actualScrollLeft = container?.scrollLeft ?? 100;
    const expectedX = 10 * 50 - actualScrollLeft + GUTTER_WIDTH - 1;
    expect(playhead.style.transform).toBe(`translate3d(${expectedX}px, 0px, 0px)`);
  });

  it("uses dragTime instead of currentTime while the user is dragging the playhead", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 5 });
    useTimelineStore.setState({
      zoom: 50,
      scrollLeft: 0,
      isDraggingPlayhead: true,
      dragTime: 22,
    });
    const screen = await render(<Harness />);
    await waitForFrames(3);
    const playhead = screen.container.querySelector("[style*='translate3d']") as HTMLElement;
    const expectedX = 22 * 50 - 0 + GUTTER_WIDTH - 1;
    expect(playhead.style.transform).toBe(`translate3d(${expectedX}px, 0px, 0px)`);
  });

  it("matches the playhead height to the scroll container's scrollHeight", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 0 });
    useTimelineStore.setState({ zoom: 50, scrollLeft: 0, isDraggingPlayhead: false });
    const screen = await render(<Harness />);
    await waitForFrames(3);
    const playhead = screen.container.querySelector("[style*='translate3d']") as HTMLElement;
    expect(playhead.style.height).toBe("800px");
  });

  it("auto-scrolls right when the drag pointer enters the right edge zone", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 0 });
    useTimelineStore.setState({ zoom: 50, scrollLeft: 0, isDraggingPlayhead: false });
    const screen = await render(<Harness />);
    await waitForFrames(3);

    const container = screen.container.querySelector<HTMLDivElement>("[data-test='scroll-container']");
    const playhead = screen.container.querySelector("[role='separator']") as HTMLElement;
    if (!container || !playhead) throw new Error("missing harness elements");
    expect(container.scrollLeft).toBe(0);

    const rect = container.getBoundingClientRect();
    const rightEdgeX = rect.right - 5;

    playhead.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: rect.left + 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: rightEdgeX, clientY: rect.top + 20, bubbles: true }));

    await expect.poll(() => container.scrollLeft).toBeGreaterThan(0);

    const scrolledTo = container.scrollLeft;
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: rightEdgeX, clientY: rect.top + 20, bubbles: true }));

    await waitForFrames(6);
    expect(container.scrollLeft).toBeLessThanOrEqual(scrolledTo + 1);
  });

  it("auto-scrolls left when the drag pointer enters the left edge zone", async () => {
    useAudioStore.setState({ duration: 60, currentTime: 0 });
    useTimelineStore.setState({ zoom: 50, scrollLeft: 400, isDraggingPlayhead: false });
    const screen = await render(<Harness />);
    await waitForFrames(3);

    const container = screen.container.querySelector<HTMLDivElement>("[data-test='scroll-container']");
    const playhead = screen.container.querySelector("[role='separator']") as HTMLElement;
    if (!container || !playhead) throw new Error("missing harness elements");
    container.scrollLeft = 400;
    expect(container.scrollLeft).toBe(400);

    const rect = container.getBoundingClientRect();
    const leftEdgeX = rect.left + GUTTER_WIDTH + 5;

    playhead.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: rect.left + 200, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: leftEdgeX, clientY: rect.top + 20, bubbles: true }));

    await expect.poll(() => container.scrollLeft).toBeLessThan(400);

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: leftEdgeX, clientY: rect.top + 20, bubbles: true }));
  });
});
