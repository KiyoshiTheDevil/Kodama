import {
  MAGSPEC_CHANNELS,
  NUM_FREQ_BINS,
  NUM_TIME_FRAMES,
  SEGMENT_SAMPLES,
  computeMagspec,
  waveformFromComplexAsChannels,
} from "@/audio/separation/demucs-spec";
import { describe, expect, it } from "vitest";

function silence(): Float32Array[] {
  return [new Float32Array(SEGMENT_SAMPLES), new Float32Array(SEGMENT_SAMPLES)];
}

function tone(freqHz: number, sampleRate = 44_100): Float32Array[] {
  const left = new Float32Array(SEGMENT_SAMPLES);
  const right = new Float32Array(SEGMENT_SAMPLES);
  for (let i = 0; i < SEGMENT_SAMPLES; i++) {
    const v = Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
    left[i] = v;
    right[i] = v * 0.5;
  }
  return [left, right];
}

describe("computeMagspec", () => {
  it("returns a flat tensor of shape [4, 2048, 336]", () => {
    const out = computeMagspec(silence());
    expect(out.length).toBe(MAGSPEC_CHANNELS * NUM_FREQ_BINS * NUM_TIME_FRAMES);
    expect(MAGSPEC_CHANNELS).toBe(4);
    expect(NUM_FREQ_BINS).toBe(2048);
    expect(NUM_TIME_FRAMES).toBe(336);
  });

  it("yields zeros for silence", () => {
    const out = computeMagspec(silence());
    let maxAbs = 0;
    for (let i = 0; i < out.length; i++) {
      const v = Math.abs(out[i]);
      if (v > maxAbs) maxAbs = v;
    }
    expect(maxAbs).toBe(0);
  });

  it("concentrates energy at the expected freq bin for a pure tone", () => {
    const freq = 440;
    const sampleRate = 44_100;
    const nFft = 4096;
    const expectedBin = Math.round((freq * nFft) / sampleRate);

    const out = computeMagspec(tone(freq, sampleRate));

    // Channel 0 is L_real. Sum |coeff| across time frames per freq bin.
    const energyPerBin = new Float32Array(NUM_FREQ_BINS);
    for (let f = 0; f < NUM_FREQ_BINS; f++) {
      let s = 0;
      for (let t = 0; t < NUM_TIME_FRAMES; t++) {
        const reIdx = 0 * NUM_FREQ_BINS * NUM_TIME_FRAMES + f * NUM_TIME_FRAMES + t;
        const imIdx = 1 * NUM_FREQ_BINS * NUM_TIME_FRAMES + f * NUM_TIME_FRAMES + t;
        s += Math.hypot(out[reIdx], out[imIdx]);
      }
      energyPerBin[f] = s;
    }
    let argmax = 0;
    for (let f = 1; f < NUM_FREQ_BINS; f++) if (energyPerBin[f] > energyPerBin[argmax]) argmax = f;
    expect(Math.abs(argmax - expectedBin)).toBeLessThanOrEqual(1);
  });

  it("rejects wrong segment length", () => {
    expect(() => computeMagspec([new Float32Array(1000), new Float32Array(1000)])).toThrow();
  });

  it("rejects mono input", () => {
    expect(() => computeMagspec([new Float32Array(SEGMENT_SAMPLES)])).toThrow();
  });
});

describe("waveformFromComplexAsChannels", () => {
  it("returns silence for an empty source spectrogram", () => {
    const out = waveformFromComplexAsChannels(new Float32Array(MAGSPEC_CHANNELS * NUM_FREQ_BINS * NUM_TIME_FRAMES));
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(SEGMENT_SAMPLES);
    expect(out[1]).toHaveLength(SEGMENT_SAMPLES);
    expect(out[0].some((v) => v !== 0)).toBe(false);
    expect(out[1].some((v) => v !== 0)).toBe(false);
  });

  it("reconstructs a Demucs-shaped complex spectrogram at the original scale", () => {
    const input = tone(440);
    const spec = computeMagspec(input);
    const out = waveformFromComplexAsChannels(spec);

    const start = 8192;
    const end = SEGMENT_SAMPLES - 8192;
    let err = 0;
    let ref = 0;
    for (let i = start; i < end; i++) {
      const d = out[0][i] - input[0][i];
      err += d * d;
      ref += input[0][i] * input[0][i];
    }
    expect(Math.sqrt(err / ref)).toBeLessThan(0.08);
  });
});
