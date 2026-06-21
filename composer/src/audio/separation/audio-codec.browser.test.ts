import { parseLamePriming } from "@/audio/lame-priming";
import { decodeFileToFloat32, TARGET_SAMPLE_RATE } from "@/audio/separation/audio-codec";
import { createAudioFile, createMp3File } from "@/test/audio-fixtures";
import { describe, expect, it } from "vitest";

describe("decodeFileToFloat32 LAME priming", () => {
  it("strips LAME priming from the head of the decoded channels for an MP3", async () => {
    const file = createMp3File();
    const bytes = await file.arrayBuffer();
    const { samples, sampleRate } = parseLamePriming(bytes);
    expect(samples).toBeGreaterThan(0);
    expect(sampleRate).toBeGreaterThan(0);

    const decoded = await decodeFileToFloat32(file);
    const undecorated = await decodeFileToFloat32(file, { stripPriming: false });
    const expectedStrip = Math.round((samples * TARGET_SAMPLE_RATE) / sampleRate);
    expect(decoded.numFrames).toBe(undecorated.numFrames - expectedStrip);
    expect(decoded.channels[0].length).toBe(decoded.numFrames);
    expect(decoded.channels[1].length).toBe(decoded.numFrames);
  });

  it("is a no-op for a WAV file", async () => {
    const wav = createAudioFile();
    const decoded = await decodeFileToFloat32(wav);
    const undecorated = await decodeFileToFloat32(wav, { stripPriming: false });
    expect(decoded.numFrames).toBe(undecorated.numFrames);
  });

  it("returns 2 channels and the correct sample rate", async () => {
    const file = createMp3File();
    const decoded = await decodeFileToFloat32(file);
    expect(decoded.channels.length).toBe(2);
    expect(decoded.sampleRate).toBe(44100);
  });
});
