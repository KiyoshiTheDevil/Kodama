import { TARGET_SAMPLE_RATE } from "@/audio/separation/audio-codec";

const SEGMENT_SECONDS = 7.8;
const SEGMENT_SAMPLES = Math.round(SEGMENT_SECONDS * TARGET_SAMPLE_RATE);
const OVERLAP_RATIO = 0.25;
const OVERLAP_SAMPLES = Math.round(SEGMENT_SAMPLES * OVERLAP_RATIO);
const STRIDE_SAMPLES = SEGMENT_SAMPLES - OVERLAP_SAMPLES;

interface Chunk {
  start: number;
  end: number;
  data: Float32Array[];
}

function* iterateChunks(channels: Float32Array[]): Generator<Chunk> {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return;

  let start = 0;
  while (start < length) {
    const end = Math.min(start + SEGMENT_SAMPLES, length);
    const data = channels.map((channel) => {
      const segment = new Float32Array(SEGMENT_SAMPLES);
      segment.set(channel.subarray(start, end));
      return segment;
    });
    yield { start, end, data };
    if (end >= length) break;
    start += STRIDE_SAMPLES;
  }
}

function chunkCount(totalFrames: number): number {
  if (totalFrames === 0) return 0;
  if (totalFrames <= SEGMENT_SAMPLES) return 1;
  return 1 + Math.ceil((totalFrames - SEGMENT_SAMPLES) / STRIDE_SAMPLES);
}

function makeFadeWindow(): Float32Array {
  const win = new Float32Array(OVERLAP_SAMPLES);
  for (let i = 0; i < OVERLAP_SAMPLES; i++) {
    win[i] = 0.5 * (1 - Math.cos((Math.PI * i) / OVERLAP_SAMPLES));
  }
  return win;
}

function stitchChunks(chunks: Chunk[], totalFrames: number, numChannels: number): Float32Array[] {
  const output: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) output.push(new Float32Array(totalFrames));

  if (chunks.length === 0) return output;

  const fadeIn = makeFadeWindow();
  const fadeOut = new Float32Array(OVERLAP_SAMPLES);
  for (let i = 0; i < OVERLAP_SAMPLES; i++) fadeOut[i] = 1 - fadeIn[i];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkLength = chunk.end - chunk.start;
    for (let c = 0; c < numChannels; c++) {
      const target = output[c];
      const source = chunk.data[c];

      for (let n = 0; n < chunkLength; n++) {
        const globalIdx = chunk.start + n;
        if (globalIdx >= totalFrames) break;

        let gain = 1;
        if (i > 0 && n < OVERLAP_SAMPLES) {
          gain = fadeIn[n];
        }
        if (i < chunks.length - 1 && n >= chunkLength - OVERLAP_SAMPLES) {
          const k = n - (chunkLength - OVERLAP_SAMPLES);
          gain *= fadeOut[k];
        }

        if (i === 0 || n >= OVERLAP_SAMPLES) {
          target[globalIdx] += source[n] * gain;
        } else {
          target[globalIdx] += source[n] * gain;
        }
      }
    }
  }

  return output;
}

export { SEGMENT_SECONDS, SEGMENT_SAMPLES, OVERLAP_SAMPLES, STRIDE_SAMPLES, iterateChunks, chunkCount, stitchChunks };
export type { Chunk };
