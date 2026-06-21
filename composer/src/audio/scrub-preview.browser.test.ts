import { parseLamePriming } from "@/audio/lame-priming";
import { scrubPreview } from "@/audio/scrub-preview";
import { useSettingsStore } from "@/stores/settings";
import { createMp3File, encodeWav, makeSineBuffer } from "@/test/audio-fixtures";
import { afterEach, describe, expect, test } from "vitest";

describe("scrub-preview", () => {
  afterEach(() => {
    scrubPreview.stop();
    scrubPreview.useBuffer(null);
  });

  test("play with no buffer is a no-op", () => {
    scrubPreview.play(0.5, 1);
    expect(scrubPreview.getActiveSnippet()).toBeNull();
  });

  test("play with buffer + audible velocity records an active snippet", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    scrubPreview.play(0.5, 1);
    const snippet = scrubPreview.getActiveSnippet();
    expect(snippet).not.toBeNull();
    expect(snippet?.time).toBe(0.5);
    expect(snippet?.rate).toBe(1);
  });

  test("play with velocity 0 is a no-op", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    scrubPreview.play(0.5, 0);
    expect(scrubPreview.getActiveSnippet()).toBeNull();
  });

  test("stop clears the active snippet", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    scrubPreview.play(0.5, 1);
    scrubPreview.stop();
    expect(scrubPreview.getActiveSnippet()).toBeNull();
  });

  test("consecutive play calls swap the active snippet without throwing", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    scrubPreview.play(0.2, 1);
    scrubPreview.play(0.4, 2);
    const snippet = scrubPreview.getActiveSnippet();
    expect(snippet?.time).toBe(0.4);
    expect(snippet?.rate).toBe(2);
  });

  test("play clamps time to within buffer duration", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    scrubPreview.play(99, 1);
    const snippet = scrubPreview.getActiveSnippet();
    expect(snippet?.time).toBeCloseTo(1 - 0.12, 2);
  });

  test("play is a no-op when audioScrubPreview setting is off", () => {
    scrubPreview.useBuffer(makeSineBuffer(1));
    const previous = useSettingsStore.getState().audioScrubPreview;
    useSettingsStore.setState({ audioScrubPreview: false });
    try {
      scrubPreview.play(0.5, 1);
      expect(scrubPreview.getActiveSnippet()).toBeNull();
    } finally {
      useSettingsStore.setState({ audioScrubPreview: previous });
    }
  });

  test("decode round-trips an ArrayBuffer into an AudioBuffer", async () => {
    const ctx = new AudioContext();
    const sourceBuffer = ctx.createBuffer(1, 44100, 44100);
    const offline = new OfflineAudioContext(1, 44100, 44100);
    const src = offline.createBufferSource();
    src.buffer = sourceBuffer;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    const wavBytes = encodeWav(rendered);
    const decoded = await scrubPreview.decode(wavBytes);
    expect(decoded.duration).toBeCloseTo(1, 1);
  });

  test("decode strips LAME priming from an MP3 source", async () => {
    const mp3 = createMp3File();
    const bytes = await mp3.arrayBuffer();
    const { samples, sampleRate } = parseLamePriming(bytes);
    expect(samples).toBeGreaterThan(0);
    expect(sampleRate).toBeGreaterThan(0);

    const ctx = new AudioContext();
    const unstripped = await ctx.decodeAudioData(bytes.slice(0));
    await ctx.close();

    const decoded = await scrubPreview.decode(bytes);
    const expectedStrip = Math.round((samples * unstripped.sampleRate) / sampleRate);
    expect(decoded.length).toBe(unstripped.length - expectedStrip);
  });
});
