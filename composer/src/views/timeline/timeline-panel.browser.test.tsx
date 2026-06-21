import { describe, expect, it, vi } from "vitest";
import type { WordSelection } from "@/domain/selection/model";
import { TimelinePanel } from "@/views/timeline/timeline-panel";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createAudioFile } from "@/test/audio-fixtures";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

// -- Helpers ------------------------------------------------------------------

function seedPlayheadTime(time: number): void {
  useAudioStore.setState({ currentTime: time });
  const audioElement = useAudioStore.getState().audioElement;
  if (audioElement) audioElement.currentTime = time;
}

function pressSelectWordAtPlayhead(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
}

function getScrollContainer(): HTMLDivElement {
  return document.querySelector("[data-scroll-container]") as HTMLDivElement;
}

function makeScrollable(container: HTMLDivElement): void {
  container.style.width = "400px";
  container.style.height = "300px";
  container.style.overflow = "auto";
}

function dispatchWheel(
  container: HTMLElement,
  init: {
    deltaX?: number;
    deltaY: number;
    deltaMode?: number;
    clientX: number;
    clientY: number;
    ctrlKey?: boolean;
    shiftKey?: boolean;
  },
): WheelEvent {
  const event = new WheelEvent("wheel", {
    deltaX: init.deltaX ?? 0,
    deltaY: init.deltaY,
    deltaMode: init.deltaMode ?? 0,
    clientX: init.clientX,
    clientY: init.clientY,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  container.dispatchEvent(event);
  return event;
}

describe("TimelinePanel", () => {
  it("shows the audio drop zone when no source is loaded", async () => {
    useAudioStore.setState({ source: null });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<TimelinePanel />);
    await expect.element(screen.getByText("Drop audio file here")).toBeInTheDocument();
  });

  it("renders the Timeline header once an audio source is set", async () => {
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() }, duration: 30 });
    useProjectStore.setState({
      lines: [createLine({ text: "first lyric", words: [createWord({ text: "first", begin: 0, end: 1 })] })],
    });
    const screen = await render(<TimelinePanel />);
    await expect.element(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
  });
});

describe("select word under playhead", () => {
  const lineId = "line-playhead";

  function seedTimelineWithWords(): void {
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() }, duration: 30 });
    useProjectStore.setState({
      activeTab: "timeline",
      lines: [
        createLine({
          id: lineId,
          text: "alpha beta",
          words: [createWord({ text: "alpha", begin: 0, end: 1 }), createWord({ text: "beta", begin: 1, end: 2 })],
          backgroundText: "echo",
          backgroundWords: [createWord({ text: "echo", begin: 0.4, end: 0.9 })],
        }),
      ],
    });
  }

  const mainWordZero: WordSelection = { lineId, lineIndex: 0, wordIndex: 0, type: "word" };
  const bgWordZero: WordSelection = { lineId, lineIndex: 0, wordIndex: 0, type: "bg" };

  it("selects the main word under the playhead, then cycles to the overlapping background word and wraps", async () => {
    seedTimelineWithWords();
    await render(<TimelinePanel />);
    seedPlayheadTime(0.5);

    pressSelectWordAtPlayhead();
    await expect.poll(() => useTimelineStore.getState().selectedWords).toEqual([mainWordZero]);

    pressSelectWordAtPlayhead();
    await expect.poll(() => useTimelineStore.getState().selectedWords).toEqual([bgWordZero]);

    pressSelectWordAtPlayhead();
    await expect.poll(() => useTimelineStore.getState().selectedWords).toEqual([mainWordZero]);
  });

  it("leaves the selection empty when the playhead is past every word", async () => {
    seedTimelineWithWords();
    await render(<TimelinePanel />);
    seedPlayheadTime(10);

    pressSelectWordAtPlayhead();
    await expect.poll(() => useTimelineStore.getState().selectedWords).toEqual([]);
  });
});

describe("timeline wheel behavior", () => {
  function seedTimeline(lineCount: number): void {
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() }, duration: 60 });
    useTimelineStore.setState({ zoom: 100 });
    useProjectStore.setState({
      activeTab: "timeline",
      lines: Array.from({ length: lineCount }, (_, i) =>
        createLine({
          id: `line-${i}`,
          text: `lyric ${i}`,
          words: [createWord({ text: `lyric${i}`, begin: i, end: i + 0.5 })],
        }),
      ),
    });
  }

  it("scrolls horizontally on a plain vertical wheel when the setting is on", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: true });
    seedTimeline(30);
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    const beforeLeft = container.scrollLeft;
    const beforeTop = container.scrollTop;
    dispatchWheel(container, { deltaY: 120, clientX: rect.left + 200, clientY: rect.top + 200 });

    await expect.poll(() => container.scrollLeft).toBeGreaterThan(beforeLeft);
    expect(container.scrollTop).toBe(beforeTop);
  });

  it("scales a line-mode wheel so one notch scrolls a usable distance", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: true });
    seedTimeline(30);
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    const beforeLeft = container.scrollLeft;
    dispatchWheel(container, { deltaY: 3, deltaMode: 1, clientX: rect.left + 200, clientY: rect.top + 200 });

    await expect.poll(() => container.scrollLeft).toBe(beforeLeft + 120);
  });

  it("scrolls vertically on a Shift wheel when the setting is on", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: true });
    seedTimeline(40);
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    const beforeLeft = container.scrollLeft;
    const beforeTop = container.scrollTop;
    dispatchWheel(container, {
      deltaX: 120,
      deltaY: 0,
      shiftKey: true,
      clientX: rect.left + 200,
      clientY: rect.top + 200,
    });

    await expect.poll(() => container.scrollTop).toBeGreaterThan(beforeTop);
    expect(container.scrollLeft).toBe(beforeLeft);
  });

  it("leaves native scrolling untouched when the setting is off", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: false });
    seedTimeline(30);
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    const event = dispatchWheel(container, { deltaY: 120, clientX: rect.left + 200, clientY: rect.top + 200 });

    expect(event.defaultPrevented).toBe(false);
  });

  it("binds the wheel listener when lyrics load after the audio source", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: true });
    useTimelineStore.setState({ zoom: 100 });
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() }, duration: 60 });
    useProjectStore.setState({ activeTab: "timeline", lines: [] });
    await render(<TimelinePanel />);
    expect(document.querySelector("[data-scroll-container]")).toBeNull();

    useProjectStore.setState({
      lines: Array.from({ length: 30 }, (_, i) =>
        createLine({
          id: `late-line-${i}`,
          text: `lyric ${i}`,
          words: [createWord({ text: `lyric${i}`, begin: i, end: i + 0.5 })],
        }),
      ),
    });

    const container = await vi.waitFor(() => {
      const found = getScrollContainer();
      if (!found) throw new Error("scroll container not mounted");
      return found;
    });
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    const beforeLeft = container.scrollLeft;
    dispatchWheel(container, { deltaY: 120, clientX: rect.left + 200, clientY: rect.top + 200 });

    await expect.poll(() => container.scrollLeft).toBeGreaterThan(beforeLeft);
  });

  it("scrubs the playhead forward and back when wheeling over the waveform strip", async () => {
    useSettingsStore.setState({ timelineHorizontalScroll: false });
    seedTimeline(10);
    seedPlayheadTime(20);
    await render(<TimelinePanel />);
    const container = getScrollContainer();
    makeScrollable(container);
    const rect = container.getBoundingClientRect();

    dispatchWheel(container, { deltaY: 200, clientX: rect.left + 100, clientY: rect.top + 40 });
    await expect.poll(() => useAudioStore.getState().currentTime).toBeGreaterThan(20);

    const afterForward = useAudioStore.getState().currentTime;
    seedPlayheadTime(1);
    dispatchWheel(container, { deltaY: -200, clientX: rect.left + 100, clientY: rect.top + 40 });
    await expect.poll(() => useAudioStore.getState().currentTime).toBe(0);
    expect(afterForward).toBeGreaterThan(20);
  });
});
