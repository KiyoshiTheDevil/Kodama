import { describe, expect, it } from "vitest";
import { TimelineWaveform } from "@/views/timeline/timeline-waveform";
import { useAudioStore } from "@/stores/audio";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createAudioFile } from "@/test/audio-fixtures";
import { render } from "@/test/render";

function setupWaveformAudio(duration = 30) {
  useAudioStore.setState({
    source: { type: "file", file: createAudioFile() },
    duration,
  });
}

describe("TimelineWaveform", () => {
  it("renders nothing when there is no audio source", async () => {
    useAudioStore.setState({ source: null });
    await render(<TimelineWaveform />);
    expect(document.querySelector(".sticky")).toBeNull();
  });

  it("renders the sticky waveform container when an audio source exists", async () => {
    setupWaveformAudio();
    await render(<TimelineWaveform />);
    expect(document.querySelector(".sticky")).not.toBeNull();
  });

  it("sizes the click overlay to duration × zoom", async () => {
    setupWaveformAudio(30);
    useTimelineStore.setState({ zoom: 50 });
    const screen = await render(<TimelineWaveform />);
    const clickLayer = screen.container.querySelector(".cursor-pointer") as HTMLElement;
    expect(clickLayer).not.toBeNull();
    expect(clickLayer.style.width).toBe("1500px");
  });

  it("seeks to the clicked time on the waveform", async () => {
    setupWaveformAudio(30);
    useTimelineStore.setState({ zoom: 50 });
    let seeked = -1;
    useAudioStore.setState({
      seekTo: (time: number) => {
        seeked = time;
      },
    } as Parameters<typeof useAudioStore.setState>[0]);
    const screen = await render(<TimelineWaveform />);
    const clickLayer = screen.container.querySelector(".cursor-pointer") as HTMLElement;
    Object.defineProperty(clickLayer, "getBoundingClientRect", {
      value: () => ({
        left: 0,
        top: 0,
        right: 1500,
        bottom: 80,
        width: 1500,
        height: 80,
        x: 0,
        y: 0,
        toJSON: () => "",
      }),
    });
    clickLayer.dispatchEvent(new MouseEvent("click", { clientX: 750, clientY: 40, bubbles: true }));
    expect(seeked).toBeCloseTo(15, 3);
  });

  it("does NOT call seekTo when duration is zero", async () => {
    setupWaveformAudio(0);
    let seeked = -1;
    useAudioStore.setState({
      seekTo: (time: number) => {
        seeked = time;
      },
    } as Parameters<typeof useAudioStore.setState>[0]);
    const screen = await render(<TimelineWaveform />);
    const clickLayer = screen.container.querySelector(".cursor-pointer") as HTMLElement | null;
    clickLayer?.dispatchEvent(new MouseEvent("click", { clientX: 100, clientY: 40, bubbles: true }));
    expect(seeked).toBe(-1);
  });

  it("clamps the seek time to the duration when clicked past the right edge", async () => {
    setupWaveformAudio(20);
    useTimelineStore.setState({ zoom: 50 });
    let seeked = -1;
    useAudioStore.setState({
      seekTo: (time: number) => {
        seeked = time;
      },
    } as Parameters<typeof useAudioStore.setState>[0]);
    const screen = await render(<TimelineWaveform />);
    const clickLayer = screen.container.querySelector(".cursor-pointer") as HTMLElement;
    const width = 20 * 50;
    Object.defineProperty(clickLayer, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, right: width, bottom: 80, width, height: 80, x: 0, y: 0, toJSON: () => "" }),
    });
    clickLayer.dispatchEvent(new MouseEvent("click", { clientX: width, clientY: 40, bubbles: true }));
    expect(seeked).toBeCloseTo(20, 3);
  });
});
