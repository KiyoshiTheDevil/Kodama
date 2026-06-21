import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scrubPreview } from "@/audio/scrub-preview";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createAudioFile, makeSineBuffer } from "@/test/audio-fixtures";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";
import { TimelinePanel } from "@/views/timeline/timeline-panel";
import { useTimelineStore } from "@/views/timeline/timeline-store";

// -- Helpers ------------------------------------------------------------------

function getScrollContainer(): HTMLDivElement {
  return document.querySelector("[data-scroll-container]") as HTMLDivElement;
}

function makeScrollable(container: HTMLDivElement): void {
  container.style.width = "400px";
  container.style.height = "300px";
  container.style.overflow = "auto";
}

function dispatchWheel(container: HTMLElement, init: { deltaY: number; clientX: number; clientY: number }): void {
  container.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: init.deltaY,
      clientX: init.clientX,
      clientY: init.clientY,
      cancelable: true,
      bubbles: true,
    }),
  );
}

function seedTimeline(): void {
  useAudioStore.setState({ source: { type: "file", file: createAudioFile() }, duration: 10, currentTime: 5 });
  useTimelineStore.setState({ zoom: 100, scrollLeft: 0 });
  useProjectStore.setState({
    activeTab: "timeline",
    lines: Array.from({ length: 10 }, (_, i) =>
      createLine({
        id: `line-${i}`,
        text: `lyric ${i}`,
        words: [createWord({ text: `lyric${i}`, begin: i, end: i + 0.5 })],
      }),
    ),
  });
}

// -- Tests --------------------------------------------------------------------

describe("wheel scrub-preview", () => {
  beforeEach(() => {
    useSettingsStore.setState({ timelineHorizontalScroll: false, audioScrubPreview: true });
    seedTimeline();
    scrubPreview.useBuffer(makeSineBuffer(10));
  });

  afterEach(() => {
    scrubPreview.stop();
    scrubPreview.useBuffer(null);
  });

  it("schedules a snippet per wheel event and stops after idle", async () => {
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);

    const rect = container.getBoundingClientRect();
    const clientY = rect.top + 20;
    const clientX = rect.left + 200;

    dispatchWheel(container, { deltaY: 200, clientX, clientY });
    dispatchWheel(container, { deltaY: 200, clientX, clientY });

    await expect.poll(() => scrubPreview.getActiveSnippet()).not.toBeNull();

    await expect.poll(() => scrubPreview.getActiveSnippet(), { timeout: 1000, interval: 30 }).toBeNull();
  });

  it("does not schedule when the audioScrubPreview setting is off", async () => {
    useSettingsStore.setState({ audioScrubPreview: false });
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();
    dispatchWheel(container, { deltaY: 200, clientX: rect.left + 200, clientY: rect.top + 20 });
    dispatchWheel(container, { deltaY: 200, clientX: rect.left + 200, clientY: rect.top + 20 });
    await expect.poll(() => scrubPreview.getActiveSnippet(), { timeout: 200 }).toBeNull();
  });
});
