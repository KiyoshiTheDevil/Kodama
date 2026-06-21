import { scrubPreview } from "@/audio/scrub-preview";
import { useSettingsStore } from "@/stores/settings";
import { makeSineBuffer } from "@/test/audio-fixtures";
import { createPlayheadDrag, type PlayheadDragConfig } from "@/views/timeline/playhead-drag";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeConfig(overrides: Partial<PlayheadDragConfig> = {}): PlayheadDragConfig {
  return {
    getContainerRect: () => new DOMRect(0, 0, 1000, 100),
    getScrollContainer: () => null,
    getDuration: () => 10,
    getZoom: () => 100,
    getStoreScrollLeft: () => 0,
    getCurrentTime: () => 1,
    setIsPlaying: () => undefined,
    setDraggingPlayhead: () => undefined,
    setDragTime: () => undefined,
    seekTo: () => undefined,
    ...overrides,
  };
}

function makeFakeMouseEvent(clientX: number): React.MouseEvent {
  return { button: 0, clientX, preventDefault: () => undefined } as unknown as React.MouseEvent;
}

describe("playhead-drag scrub preview", () => {
  beforeEach(() => {
    scrubPreview.useBuffer(makeSineBuffer(10));
  });

  afterEach(() => {
    scrubPreview.stop();
    scrubPreview.useBuffer(null);
  });

  it("schedules scrub-preview snippets during a drag", async () => {
    const drag = createPlayheadDrag(makeConfig());
    drag.onMouseDown(makeFakeMouseEvent(200));

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, bubbles: true }));

    await expect.poll(() => scrubPreview.getActiveSnippet()).not.toBeNull();

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 500, bubbles: true }));

    await expect.poll(() => scrubPreview.getActiveSnippet()).toBeNull();
    drag.dispose();
  });

  it("is silent when the audioScrubPreview setting is off", async () => {
    useSettingsStore.setState({ audioScrubPreview: false });
    const drag = createPlayheadDrag(makeConfig());
    drag.onMouseDown(makeFakeMouseEvent(200));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, bubbles: true }));

    await expect.poll(() => scrubPreview.getActiveSnippet(), { timeout: 200 }).toBeNull();
    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 500, bubbles: true }));
    drag.dispose();
  });

  it("stops scrub preview on dispose mid-drag", async () => {
    const drag = createPlayheadDrag(makeConfig());
    drag.onMouseDown(makeFakeMouseEvent(200));

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, bubbles: true }));

    await expect.poll(() => scrubPreview.getActiveSnippet()).not.toBeNull();

    drag.dispose();

    await expect.poll(() => scrubPreview.getActiveSnippet()).toBeNull();
  });
});
