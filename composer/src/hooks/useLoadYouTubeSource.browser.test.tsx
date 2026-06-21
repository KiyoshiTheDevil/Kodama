import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useLoadYouTubeSource } from "@/hooks/useLoadYouTubeSource";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";

const VIDEO_ID = "dQw4w9WgXcQ";
const OTHER_VIDEO_ID = "9bZkp7q19f0";

function createAudioFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], `${name}.opus`, { type: "audio/ogg" });
}

describe("useLoadYouTubeSource", () => {
  it("resolves when the tunnel populates source.file for the requested videoId", async () => {
    const { result } = await renderHook(() => useLoadYouTubeSource());
    const loadYouTubeSource = result.current;

    const pending = loadYouTubeSource(VIDEO_ID);
    useAudioStore.getState().setYouTubeFile(createAudioFile(VIDEO_ID));
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects when youtubeLoadError is set after kickoff", async () => {
    const { result } = await renderHook(() => useLoadYouTubeSource());
    const loadYouTubeSource = result.current;

    const pending = loadYouTubeSource(VIDEO_ID);
    useAudioStore.getState().setYouTubeLoadError("Could not load that video. Try again.");
    await expect(pending).rejects.toThrow("Could not load that video. Try again.");
  });

  it("rejects when source is replaced before the file lands", async () => {
    const { result } = await renderHook(() => useLoadYouTubeSource());
    const loadYouTubeSource = result.current;

    const pending = loadYouTubeSource(VIDEO_ID);
    useAudioStore.getState().setSource(null);
    await expect(pending).rejects.toThrow("youtube_load_superseded");
  });

  it("handles concurrent calls for different videoIds without cross-talk", async () => {
    const { result } = await renderHook(() => useLoadYouTubeSource());
    const loadYouTubeSource = result.current;

    const firstPending = loadYouTubeSource(VIDEO_ID);
    const secondPending = loadYouTubeSource(OTHER_VIDEO_ID);

    await expect(firstPending).rejects.toThrow("youtube_load_superseded");

    useAudioStore.getState().setYouTubeFile(createAudioFile(OTHER_VIDEO_ID));
    await expect(secondPending).resolves.toBeUndefined();
  });

  it("preserves the project title when one already exists and the videoId is unchanged", async () => {
    useAudioStore.getState().setYouTubeSource(VIDEO_ID);
    useProjectStore.getState().setMetadata({ title: "Custom Title" });

    const { result } = await renderHook(() => useLoadYouTubeSource());
    const pending = result.current(VIDEO_ID);
    pending.catch(() => {});

    expect(useProjectStore.getState().metadata.title).toBe("Custom Title");
  });

  it("sets the project title to the videoId on a fresh load", async () => {
    useProjectStore.getState().setMetadata({ title: "" });

    const { result } = await renderHook(() => useLoadYouTubeSource());
    const pending = result.current(VIDEO_ID);
    pending.catch(() => {});

    expect(useProjectStore.getState().metadata.title).toBe(VIDEO_ID);
  });
});
