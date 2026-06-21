import { describe, expect, it } from "vitest";
import { iterateChunks, chunkCount, stitchChunks, SEGMENT_SAMPLES, STRIDE_SAMPLES } from "@/audio/separation/chunker";

function makeRamp(length: number, channel = 0): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = (i + channel * 0.5) / length;
  return out;
}

describe("chunker", () => {
  it("emits a single chunk for short inputs", () => {
    const channels = [makeRamp(SEGMENT_SAMPLES / 2)];
    const chunks = Array.from(iterateChunks(channels));
    expect(chunks.length).toBe(1);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(SEGMENT_SAMPLES / 2);
    expect(chunks[0].data[0].length).toBe(SEGMENT_SAMPLES);
  });

  it("chunkCount matches iterateChunks length", () => {
    for (const frames of [1000, SEGMENT_SAMPLES, SEGMENT_SAMPLES + 1, SEGMENT_SAMPLES * 2 + 5000]) {
      const channels = [makeRamp(frames)];
      const iterated = Array.from(iterateChunks(channels)).length;
      expect(chunkCount(frames)).toBe(iterated);
    }
  });

  it("strides by SEGMENT_SAMPLES - OVERLAP_SAMPLES", () => {
    const totalFrames = SEGMENT_SAMPLES * 3;
    const channels = [makeRamp(totalFrames)];
    const chunks = Array.from(iterateChunks(channels));
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start - chunks[i - 1].start).toBe(STRIDE_SAMPLES);
    }
  });

  it("stitchChunks recovers original signal when passing chunks through unchanged", () => {
    const totalFrames = SEGMENT_SAMPLES * 2 + 1000;
    const channels = [makeRamp(totalFrames, 0), makeRamp(totalFrames, 1)];
    const chunks = Array.from(iterateChunks(channels));
    const stitched = stitchChunks(chunks, totalFrames, channels.length);
    for (let c = 0; c < channels.length; c++) {
      let maxErr = 0;
      for (let i = 0; i < totalFrames; i++) {
        maxErr = Math.max(maxErr, Math.abs(stitched[c][i] - channels[c][i]));
      }
      expect(maxErr).toBeLessThan(1e-5);
    }
  });
});
