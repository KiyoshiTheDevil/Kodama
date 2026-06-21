import { HOP_LENGTH, type Spectrogram, istft, reflectPad, stft } from "@/audio/separation/stft";

// Mirrors HTDemucs's `_spec` / `_magnitude` (sevagh's `standalone_*` helpers).
// For a 7.8s stereo segment at 44.1 kHz (343,980 samples), the model expects
// magspec shape [1, 4, 2048, 336]:
//   - 4 channels = stereo (2) × complex (2), laid out [L_re, L_im, R_re, R_im]
//   - 2048 freq bins = n_fft/2 = 4096/2; the Nyquist bin is dropped
//   - 336 time frames = ceil(343980 / 1024), with 2 leading + 2 trailing context
//     frames produced by the spectro pre-pad and then trimmed off

const SEGMENT_SAMPLES = 343_980;
const PRE_PAD_LEFT = (HOP_LENGTH / 2) * 3; // 1536
const PRE_PAD_RIGHT = PRE_PAD_LEFT + 336 * HOP_LENGTH - SEGMENT_SAMPLES; // 1716
const NUM_TIME_FRAMES = 336;
const NUM_FREQ_BINS = 2048;
const TIME_TRIM_START = 2;
const MAGSPEC_CHANNELS = 4;
const ISTFT_TIME_PAD = 2;
const ISTFT_FREQ_BINS = NUM_FREQ_BINS + 1;
const ISTFT_TIME_FRAMES = NUM_TIME_FRAMES + ISTFT_TIME_PAD * 2;
const ISTFT_LENGTH = Math.ceil(SEGMENT_SAMPLES / HOP_LENGTH) * HOP_LENGTH + 2 * PRE_PAD_LEFT;

function computeMagspec(channels: Float32Array[]): Float32Array {
  if (channels.length !== 2) {
    throw new Error(`HTDemucs magspec requires stereo input (got ${channels.length} channels)`);
  }
  for (const ch of channels) {
    if (ch.length !== SEGMENT_SAMPLES) {
      throw new Error(`HTDemucs magspec expects ${SEGMENT_SAMPLES} samples (got ${ch.length})`);
    }
  }

  const out = new Float32Array(MAGSPEC_CHANNELS * NUM_FREQ_BINS * NUM_TIME_FRAMES);

  for (let c = 0; c < 2; c++) {
    const prePadded = reflectPad(channels[c], PRE_PAD_LEFT, PRE_PAD_RIGHT);
    const spec = stft(prePadded, { center: true, normalized: true });

    const realCh = c * 2;
    const imagCh = c * 2 + 1;
    for (let f = 0; f < NUM_FREQ_BINS; f++) {
      for (let t = 0; t < NUM_TIME_FRAMES; t++) {
        const srcFrame = t + TIME_TRIM_START;
        const srcIdx = srcFrame * spec.numBins + f;
        out[realCh * NUM_FREQ_BINS * NUM_TIME_FRAMES + f * NUM_TIME_FRAMES + t] = spec.real[srcIdx];
        out[imagCh * NUM_FREQ_BINS * NUM_TIME_FRAMES + f * NUM_TIME_FRAMES + t] = spec.imag[srcIdx];
      }
    }
  }

  return out;
}

function waveformFromComplexAsChannels(sourceSpec: Float32Array): Float32Array[] {
  const channelStride = NUM_FREQ_BINS * NUM_TIME_FRAMES;
  if (sourceSpec.length < MAGSPEC_CHANNELS * channelStride) {
    throw new Error(
      `HTDemucs source spectrogram expects at least ${MAGSPEC_CHANNELS * channelStride} samples (got ${sourceSpec.length})`,
    );
  }

  const channels: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const real = new Float32Array(ISTFT_TIME_FRAMES * ISTFT_FREQ_BINS);
    const imag = new Float32Array(ISTFT_TIME_FRAMES * ISTFT_FREQ_BINS);
    const realBase = c * 2 * channelStride;
    const imagBase = (c * 2 + 1) * channelStride;

    for (let f = 0; f < NUM_FREQ_BINS; f++) {
      for (let t = 0; t < NUM_TIME_FRAMES; t++) {
        const srcIdx = f * NUM_TIME_FRAMES + t;
        const dstIdx = (t + ISTFT_TIME_PAD) * ISTFT_FREQ_BINS + f;
        real[dstIdx] = sourceSpec[realBase + srcIdx];
        imag[dstIdx] = sourceSpec[imagBase + srcIdx];
      }
    }

    const reconstructed = istft(
      { real, imag, numFrames: ISTFT_TIME_FRAMES, numBins: ISTFT_FREQ_BINS } satisfies Spectrogram,
      ISTFT_LENGTH,
      { normalized: true },
    );
    const out = new Float32Array(SEGMENT_SAMPLES);
    out.set(reconstructed.subarray(PRE_PAD_LEFT, PRE_PAD_LEFT + SEGMENT_SAMPLES));
    channels.push(out);
  }
  return channels;
}

const MAGSPEC_DIMS: readonly number[] = [1, MAGSPEC_CHANNELS, NUM_FREQ_BINS, NUM_TIME_FRAMES];

export {
  SEGMENT_SAMPLES,
  NUM_TIME_FRAMES,
  NUM_FREQ_BINS,
  MAGSPEC_CHANNELS,
  MAGSPEC_DIMS,
  computeMagspec,
  waveformFromComplexAsChannels,
};
