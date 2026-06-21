import { describe, expect, it } from "vitest";
import { AudioPlayer } from "@/audio/audio-player";
import { useAudioStore } from "@/stores/audio";
import { createAudioFile } from "@/test/audio-fixtures";
import { render } from "@/test/render";

function setupAudioSource() {
  const file = createAudioFile("track.wav");
  useAudioStore.setState({
    source: { type: "file", file },
    duration: 60,
    currentTime: 5,
    isPlaying: false,
    playbackRate: 1,
    volume: 0.8,
    isMuted: false,
  });
}

describe("AudioPlayer", () => {
  it("renders nothing when there is no audio source", async () => {
    useAudioStore.setState({ source: null });
    const screen = await render(<AudioPlayer />);
    expect(screen.container.querySelector("button")).toBeNull();
  });

  it("renders play/pause and time display when a source is loaded", async () => {
    setupAudioSource();
    const screen = await render(<AudioPlayer />);
    await expect.element(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(document.body.textContent).toContain("0:05");
  });

  it("toggles play state when the play button is clicked", async () => {
    setupAudioSource();
    const screen = await render(<AudioPlayer />);
    expect(useAudioStore.getState().isPlaying).toBe(false);
    await screen.getByRole("button", { name: "Play" }).click();
    expect(useAudioStore.getState().isPlaying).toBe(true);
    await screen.getByRole("button", { name: "Pause" }).click();
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });

  it("opens the playback rate popover and applies a preset", async () => {
    setupAudioSource();
    const screen = await render(<AudioPlayer />);
    await screen.getByRole("button", { name: /1\.00x/ }).click();
    await screen.getByRole("button", { name: "1.5x" }).click();
    expect(useAudioStore.getState().playbackRate).toBeCloseTo(1.5, 5);
  });

  it("opens the volume popover and toggles mute", async () => {
    setupAudioSource();
    const screen = await render(<AudioPlayer />);
    await screen.getByRole("button", { name: "Volume" }).click();
    await screen.getByRole("button", { name: "Mute" }).click();
    expect(useAudioStore.getState().isMuted).toBe(true);
  });
});
