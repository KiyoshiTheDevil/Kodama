import { SEGMENT_SAMPLES } from "@/audio/separation/chunker";
import {
  MAGSPEC_CHANNELS,
  NUM_FREQ_BINS,
  NUM_TIME_FRAMES,
  waveformFromComplexAsChannels,
} from "@/audio/separation/demucs-spec";

// -- Constants ----------------------------------------------------------------

// add_67 has dims [1, 4, 2, 343980]: batch, stem, channel, sample.
// output has dims [1, 4, 4, 2048, 336]: batch, stem, complex-as-channels, freq, time.
// Vocals = stem index 3. Stride per stem = 2 * SEGMENT_SAMPLES.
const STEM_INDEX_VOCALS = 3;

// -- Types --------------------------------------------------------------------

interface NormalizationStats {
  mean: number;
  std: number;
}

interface NormalizedAudio extends NormalizationStats {
  channels: Float32Array[];
}

// Duck-typed so tests and callers don't need the full ORT tensor surface.
interface TensorLike {
  data: Float32Array;
}

// -- Normalization ------------------------------------------------------------

function normalizeForDemucs(channels: Float32Array[], totalFrames: number): NormalizedAudio {
  if (totalFrames === 0) return { channels, mean: 0, std: 1 };

  let mean = 0;
  for (let i = 0; i < totalFrames; i++) {
    mean += ((channels[0]?.[i] ?? 0) + (channels[1]?.[i] ?? 0)) * 0.5;
  }
  mean /= totalFrames;

  let variance = 0;
  for (let i = 0; i < totalFrames; i++) {
    const mono = ((channels[0]?.[i] ?? 0) + (channels[1]?.[i] ?? 0)) * 0.5;
    const d = mono - mean;
    variance += d * d;
  }
  const std = Math.sqrt(variance / Math.max(1, totalFrames - 1));
  if (!Number.isFinite(std) || std < 1e-8) return { channels, mean: 0, std: 1 };

  return {
    mean,
    std,
    channels: channels.map((channel) => {
      const out = new Float32Array(channel.length);
      for (let i = 0; i < channel.length; i++) out[i] = (channel[i] - mean) / std;
      return out;
    }),
  };
}

function denormalizeDemucsOutput(channels: Float32Array[], normalized: NormalizationStats): Float32Array[] {
  if (normalized.mean === 0 && normalized.std === 1) return channels;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] = channel[i] * normalized.std + normalized.mean;
  }
  return channels;
}

// -- Stem extraction ----------------------------------------------------------

function extractVocalsStem(timeTensor: TensorLike, freqTensor: TensorLike): Float32Array[] {
  const timeData = timeTensor.data;
  const stemStride = 2 * SEGMENT_SAMPLES;
  const channelStride = SEGMENT_SAMPLES;
  const base = STEM_INDEX_VOCALS * stemStride;

  const freqSourceStride = MAGSPEC_CHANNELS * NUM_FREQ_BINS * NUM_TIME_FRAMES;
  const freqBase = STEM_INDEX_VOCALS * freqSourceStride;
  const freqChannels = waveformFromComplexAsChannels(freqTensor.data.subarray(freqBase, freqBase + freqSourceStride));

  const result: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(SEGMENT_SAMPLES);
    const timeBranch = timeData.subarray(base + c * channelStride, base + c * channelStride + SEGMENT_SAMPLES);
    const freqBranch = freqChannels[c];
    for (let i = 0; i < SEGMENT_SAMPLES; i++) {
      out[i] = timeBranch[i] + freqBranch[i];
    }
    result.push(out);
  }
  return result;
}

// -- Exports ------------------------------------------------------------------

export { normalizeForDemucs, denormalizeDemucsOutput, extractVocalsStem };
