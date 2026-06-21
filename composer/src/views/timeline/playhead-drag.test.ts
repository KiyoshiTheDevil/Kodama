import { describe, expect, it } from "vitest";
import { createPlayheadDrag } from "@/views/timeline/playhead-drag";

function buildHarness() {
  const container = document.createElement("div");
  const scrollContainer = document.createElement("div");
  const calls = { play: [] as boolean[], dragging: [] as boolean[], dragTime: [] as number[], seek: [] as number[] };
  const drag = createPlayheadDrag({
    getContainerRect: () => container.getBoundingClientRect(),
    getScrollContainer: () => scrollContainer,
    getDuration: () => 60,
    getZoom: () => 50,
    getStoreScrollLeft: () => 0,
    getCurrentTime: () => 3,
    setIsPlaying: (v) => calls.play.push(v),
    setDraggingPlayhead: (v) => calls.dragging.push(v),
    setDragTime: (t) => calls.dragTime.push(t),
    seekTo: (t) => calls.seek.push(t),
  });
  return { drag, calls };
}

describe("createPlayheadDrag", () => {
  it("pauses playback and enters dragging state on mousedown", () => {
    const { drag, calls } = buildHarness();
    drag.onMouseDown({ button: 0, clientX: 200, preventDefault() {} } as unknown as React.MouseEvent);
    expect(calls.play).toEqual([false]);
    expect(calls.dragging).toEqual([true]);
    drag.dispose();
  });

  it("ignores non-primary mouse buttons", () => {
    const { drag, calls } = buildHarness();
    drag.onMouseDown({ button: 2, clientX: 200, preventDefault() {} } as unknown as React.MouseEvent);
    expect(calls.play).toEqual([]);
    expect(calls.dragging).toEqual([]);
  });

  it("seeks and leaves dragging state on mouseup", () => {
    const { drag, calls } = buildHarness();
    drag.onMouseDown({ button: 0, clientX: 200, preventDefault() {} } as unknown as React.MouseEvent);
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 200 }));
    expect(calls.seek.length).toBe(1);
    expect(calls.dragging).toEqual([true, false]);
  });

  it("dispose ends an in-flight drag without seeking", () => {
    const { drag, calls } = buildHarness();
    drag.onMouseDown({ button: 0, clientX: 200, preventDefault() {} } as unknown as React.MouseEvent);
    drag.dispose();
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 200 }));
    expect(calls.seek).toEqual([]);
  });
});
