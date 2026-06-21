import { beforeAll, describe, expect, it } from "vitest";
import { useAudioStore } from "@/stores/audio";
import { addGlobalAllowedConsolePattern } from "@/test/console-guard";
import { render } from "@/test/render";
import { buildSyncedTtml } from "@/test/ttml-fixtures";
import { AmLyricsRenderer } from "@/views/preview/am-lyrics-renderer";

// -- Constants ----------------------------------------------------------------

const SONG_DURATION_SECONDS = 35;

// -- Helpers ------------------------------------------------------------------

async function waitForAmLyrics(container: Element): Promise<Element> {
  await expect.poll(() => container.querySelector("am-lyrics") !== null).toBe(true);
  const el = container.querySelector("am-lyrics");
  if (!el) throw new Error("am-lyrics element not rendered");
  return el;
}

async function waitForLyrics(el: Element): Promise<void> {
  await expect
    .poll(() => el.shadowRoot?.querySelectorAll(".lyrics-line:not(.lyrics-gap)").length ?? 0)
    .toBeGreaterThan(0);
}

function activeLineText(el: Element): string {
  return el.shadowRoot?.querySelector(".lyrics-line.active:not(.lyrics-gap)")?.textContent ?? "";
}

function firstLyricLine(el: Element): HTMLElement | null {
  return el.shadowRoot?.querySelector<HTMLElement>(".lyrics-line:not(.lyrics-gap)") ?? null;
}

// -- Tests --------------------------------------------------------------------

describe("AmLyricsRenderer", () => {
  beforeAll(() => {
    addGlobalAllowedConsolePattern(/dev mode/i);
  });

  it("highlights the line under the current audio time", async () => {
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);
    await waitForLyrics(el);

    audio.currentTime = 14;
    await expect.poll(() => activeLineText(el)).toContain("second line");
  });

  it("moves the highlight as the audio time advances", async () => {
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);
    await waitForLyrics(el);

    audio.currentTime = 14;
    await expect.poll(() => activeLineText(el)).toContain("second line");

    audio.currentTime = 26;
    await expect.poll(() => activeLineText(el)).toContain("third line");
  });

  it("tracks a newly registered audio element", async () => {
    const firstAudio = new Audio();
    useAudioStore.setState({ audioElement: firstAudio });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);
    await waitForLyrics(el);

    firstAudio.currentTime = 14;
    await expect.poll(() => activeLineText(el)).toContain("second line");

    const replacementAudio = new Audio();
    replacementAudio.currentTime = 26;
    useAudioStore.setState({ audioElement: replacementAudio });

    await expect.poll(() => activeLineText(el)).toContain("third line");
  });

  it("starts playback when a line is clicked", async () => {
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio, isPlaying: false });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);
    await waitForLyrics(el);

    firstLyricLine(el)?.click();

    await expect.poll(() => useAudioStore.getState().isPlaying).toBe(true);
  });

  it("seeks the audio to the clicked line's start time", async () => {
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);
    await waitForLyrics(el);

    firstLyricLine(el)?.click();

    await expect.poll(() => useAudioStore.getState().currentTime).toBe(2);
  });

  it("hides the am-lyrics built-in header", async () => {
    useAudioStore.setState({ audioElement: new Audio() });

    const screen = await render(
      <AmLyricsRenderer ttmlString={buildSyncedTtml()} durationSeconds={SONG_DURATION_SECONDS} />,
    );
    const el = await waitForAmLyrics(screen.container);

    await expect.poll(() => el.shadowRoot?.querySelector("style[data-composer-hide]") !== null).toBe(true);
  });
});
