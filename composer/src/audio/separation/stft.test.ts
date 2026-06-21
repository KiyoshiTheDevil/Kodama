import { istft, stft } from "@/audio/separation/stft";
import { describe, expect, it } from "vitest";

function rms(a: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / a.length);
}

function diffRms(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / n);
}

describe("stft", () => {
  it("round-trips a sine wave with low RMS error", () => {
    const sr = 44100;
    const length = 32768;
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) signal[i] = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.5;

    const spec = stft(signal);
    const reconstructed = istft(spec, length);
    expect(reconstructed.length).toBe(length);

    const pad = 8192;
    const a = signal.subarray(pad, length - pad);
    const b = reconstructed.subarray(pad, length - pad);
    const err = diffRms(a, b);
    const ref = rms(a);
    expect(err / ref).toBeLessThan(0.05);
  });

  it("round-trips a normalized spectrogram without losing amplitude", () => {
    const sr = 44100;
    const length = 32768;
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i++) signal[i] = Math.sin((2 * Math.PI * 880 * i) / sr) * 0.25;

    const spec = stft(signal, { normalized: true });
    const reconstructed = istft(spec, length, { normalized: true });

    const pad = 8192;
    const a = signal.subarray(pad, length - pad);
    const b = reconstructed.subarray(pad, length - pad);
    const err = diffRms(a, b);
    const ref = rms(a);
    expect(err / ref).toBeLessThan(0.05);
    expect(rms(b) / ref).toBeGreaterThan(0.95);
  });
});
