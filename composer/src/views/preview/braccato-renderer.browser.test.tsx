import type { BraccatoElement } from "@braccato/core";
import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { useAudioStore } from "@/stores/audio";
import { addGlobalAllowedConsolePattern } from "@/test/console-guard";
import { render } from "@/test/render";
import { buildSyncedTtml } from "@/test/ttml-fixtures";
import { BraccatoRenderer } from "@/views/preview/braccato-renderer";

// -- Helpers ------------------------------------------------------------------
function makeAudio(src: string): HTMLAudioElement {
  const audio = document.createElement("audio");
  audio.id = "composer-audio";
  audio.src = src;
  document.body.appendChild(audio);
  return audio;
}

function getBraccatoElement(container: Element): BraccatoElement {
  const el = container.querySelector("braccato-lyrics");
  if (!el) throw new Error("braccato-lyrics element not rendered");
  return el as BraccatoElement;
}

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function waitForLyrics(el: BraccatoElement): Promise<void> {
  await expect.poll(() => el.shadowRoot?.querySelectorAll(".braccato--line").length ?? 0).toBeGreaterThan(0);
}

afterEach(() => {
  for (const el of document.querySelectorAll("#composer-audio")) {
    el.remove();
  }
});

function activeLineText(el: BraccatoElement): string {
  return el.shadowRoot?.querySelector(".braccato--line.braccato--active")?.textContent ?? "";
}

// -- Tests --------------------------------------------------------------------

describe("BraccatoRenderer", () => {
  beforeAll(() => {
    addGlobalAllowedConsolePattern(/dev mode/i);
  });

  it("highlights the line under the current audio time", async () => {
    const ttml = buildSyncedTtml();
    const audio = new Audio();
    audio.currentTime = 14;
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(<BraccatoRenderer ttmlString={ttml} />);
    const el = getBraccatoElement(screen.container);
    await waitForLyrics(el);

    await expect.poll(() => activeLineText(el)).toContain("second line");
  });

  it("moves the highlight as the audio time advances", async () => {
    const ttml = buildSyncedTtml();
    const audio = new Audio();
    audio.currentTime = 14;
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(<BraccatoRenderer ttmlString={ttml} />);
    const el = getBraccatoElement(screen.container);
    await waitForLyrics(el);
    await expect.poll(() => activeLineText(el)).toContain("second line");

    audio.currentTime = 26;
    await expect.poll(() => activeLineText(el)).toContain("third line");
  });

  it("tracks a newly registered audio element", async () => {
    const ttml = buildSyncedTtml();
    const firstAudio = new Audio();
    firstAudio.currentTime = 14;
    useAudioStore.setState({ audioElement: firstAudio });

    const screen = await render(<BraccatoRenderer ttmlString={ttml} />);
    const el = getBraccatoElement(screen.container);
    await waitForLyrics(el);
    await expect.poll(() => activeLineText(el)).toContain("second line");

    const replacementAudio = new Audio();
    replacementAudio.currentTime = 26;
    useAudioStore.setState({ audioElement: replacementAudio });

    await expect.poll(() => activeLineText(el)).toContain("third line");
  });

  it("starts playback when a line is clicked", async () => {
    const ttml = buildSyncedTtml();
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio, isPlaying: false });

    const screen = await render(<BraccatoRenderer ttmlString={ttml} />);
    const el = getBraccatoElement(screen.container);
    await waitForLyrics(el);

    el.shadowRoot?.querySelector<HTMLElement>(".braccato--line")?.click();

    await expect.poll(() => useAudioStore.getState().isPlaying).toBe(true);
  });

  it("seeks the audio to the clicked line's start time", async () => {
    const ttml = buildSyncedTtml();
    const audio = new Audio();
    useAudioStore.setState({ audioElement: audio });

    const screen = await render(<BraccatoRenderer ttmlString={ttml} />);
    const el = getBraccatoElement(screen.container);
    await waitForLyrics(el);

    el.shadowRoot?.querySelector<HTMLElement>(".braccato--line")?.click();

    await expect.poll(() => useAudioStore.getState().currentTime).toBe(2);
  });

  it("does not bind to #composer-audio before the audio element is registered", async () => {
    const screen = await render(<BraccatoRenderer ttmlString="<tt></tt>" />);
    const el = screen.container.querySelector("braccato-lyrics");
    expect(el?.getAttribute("source")).toBeNull();
  });

  it("rebinds when the registered audio element is replaced", async () => {
    const firstAudio = makeAudio("https://example.test/first.mp3");
    useAudioStore.setState({ audioElement: firstAudio });

    const screen = await render(<BraccatoRenderer ttmlString="<tt></tt>" />);
    await waitFor(
      () => screen.container.querySelector("braccato-lyrics")?.getAttribute("source") === "#composer-audio",
    );
    const firstRenderer = screen.container.querySelector("braccato-lyrics");

    firstAudio.remove();
    const secondAudio = makeAudio("https://example.test/second.mp3");
    useAudioStore.setState({ audioElement: secondAudio });

    await waitFor(() => screen.container.querySelector("braccato-lyrics") !== firstRenderer);
    const secondRenderer = screen.container.querySelector("braccato-lyrics");
    expect(secondRenderer?.getAttribute("source")).toBe("#composer-audio");
  });
});
