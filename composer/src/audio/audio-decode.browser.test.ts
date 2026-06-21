import { decodeAudioToWav } from "@/audio/audio-decode";
import { parseLamePriming } from "@/audio/lame-priming";
import { createMp3File } from "@/test/audio-fixtures";
import { describe, expect, it } from "vitest";

describe("decodeAudioToWav", () => {
  it("decodes an mp3 file into a valid wav blob", async () => {
    const blob = await decodeAudioToWav(createMp3File());
    expect(blob.type).toBe("audio/wav");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
  });

  it("produces wav that itself decodes back to playable audio", async () => {
    const blob = await decodeAudioToWav(createMp3File());
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      expect(decoded.numberOfChannels).toBeGreaterThan(0);
      expect(decoded.sampleRate).toBeGreaterThan(0);
      expect(decoded.duration).toBeGreaterThan(0.1);
    } finally {
      await ctx.close();
    }
  });

  it("rejects a file that is not decodable audio", async () => {
    const garbage = new File([new Uint8Array([1, 2, 3, 4, 5])], "broken.mp3", { type: "audio/mpeg" });
    await expect(decodeAudioToWav(garbage)).rejects.toBeTruthy();
  });
});

describe("decodeAudioToWav LAME priming strip", () => {
  it("returns a WAV blob whose sample count is reduced by the parsed LAME priming", async () => {
    const file = createMp3File();
    const bytes = await file.arrayBuffer();
    const { samples, sampleRate } = parseLamePriming(bytes);
    expect(samples).toBeGreaterThan(0);
    expect(sampleRate).toBeGreaterThan(0);

    const blob = await decodeAudioToWav(file);
    const wav = await blob.arrayBuffer();
    const view = new DataView(wav);
    const dataSize = view.getUint32(40, true);
    const channels = view.getUint16(22, true);
    const wavFrames = dataSize / (channels * 2);

    const ctx = new AudioContext();
    const unstripped = await ctx.decodeAudioData(bytes.slice(0));
    await ctx.close();

    const expectedStrip = Math.round((samples * unstripped.sampleRate) / sampleRate);
    expect(wavFrames).toBe(unstripped.length - expectedStrip);
  });
});
