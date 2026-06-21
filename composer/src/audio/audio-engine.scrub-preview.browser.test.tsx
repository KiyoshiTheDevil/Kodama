import { AudioEngine } from "@/audio/audio-engine";
import { scrubPreview } from "@/audio/scrub-preview";
import { useAudioStore } from "@/stores/audio";
import { createAudioFile } from "@/test/audio-fixtures";
import { render } from "@/test/render";
import { afterEach, describe, expect, it } from "vitest";

async function waitForBufferInstalled(timeout = 3000): Promise<void> {
  await expect
    .poll(
      () => {
        scrubPreview.play(0.01, 1);
        const installed = scrubPreview.getActiveSnippet() !== null;
        if (installed) scrubPreview.stop();
        return installed;
      },
      { timeout },
    )
    .toBe(true);
}

describe("AudioEngine scrub-preview integration", () => {
  afterEach(() => {
    scrubPreview.stop();
    scrubPreview.useBuffer(null);
    useAudioStore.setState({ source: null });
  });

  it("installs a decoded buffer into scrub-preview when a file source loads", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitForBufferInstalled();
  });

  it("clears scrub-preview buffer when source is set to null", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitForBufferInstalled();

    useAudioStore.setState({ source: null });

    await expect
      .poll(
        () => {
          scrubPreview.play(0.01, 1);
          return scrubPreview.getActiveSnippet() === null;
        },
        { timeout: 200 },
      )
      .toBe(true);
  });
});
