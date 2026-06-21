// -- Constants -----------------------------------------------------------------

const DECODER_DELAY_SAMPLES = 528;
const PRIMING_HARD_CAP = 8192;
const LOG_PREFIX = "[LamePriming]";

const MPEG1_SAMPLE_RATES: readonly number[] = [44_100, 48_000, 32_000];
const MPEG2_SAMPLE_RATES: readonly number[] = [22_050, 24_000, 16_000];
const MPEG25_SAMPLE_RATES: readonly number[] = [11_025, 12_000, 8_000];

const TAG_OFFSET_MPEG1_STEREO = 0x24;
const TAG_OFFSET_MPEG1_MONO = 0x15;
const TAG_OFFSET_MPEG2_STEREO = 0x15;
const TAG_OFFSET_MPEG2_MONO = 0x0d;

const MPEG_VERSION_2_5 = 0;
const MPEG_VERSION_2 = 2;
const MPEG_VERSION_1 = 3;
const CHANNEL_MODE_MONO = 3;

// -- Types ---------------------------------------------------------------------

interface LamePriming {
  samples: number;
  sampleRate: number;
}

// -- Functions -----------------------------------------------------------------

function findFirstMp3FrameOffset(bytes: Uint8Array): number {
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

function readSampleRate(versionBits: number, rateIdx: number): number {
  if (rateIdx === 3) return 0;
  if (versionBits === MPEG_VERSION_1) return MPEG1_SAMPLE_RATES[rateIdx] ?? 0;
  if (versionBits === MPEG_VERSION_2) return MPEG2_SAMPLE_RATES[rateIdx] ?? 0;
  if (versionBits === MPEG_VERSION_2_5) return MPEG25_SAMPLE_RATES[rateIdx] ?? 0;
  return 0;
}

function readTagOffset(versionBits: number, channelMode: number): number {
  const mono = channelMode === CHANNEL_MODE_MONO;
  if (versionBits === MPEG_VERSION_1) return mono ? TAG_OFFSET_MPEG1_MONO : TAG_OFFSET_MPEG1_STEREO;
  if (versionBits === MPEG_VERSION_2 || versionBits === MPEG_VERSION_2_5) {
    return mono ? TAG_OFFSET_MPEG2_MONO : TAG_OFFSET_MPEG2_STEREO;
  }
  return 0;
}

function parseLamePriming(input: ArrayBuffer | Uint8Array): LamePriming {
  const empty: LamePriming = { samples: 0, sampleRate: 0 };
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const frameOffset = findFirstMp3FrameOffset(bytes);
  if (frameOffset + 4 > bytes.length) return empty;
  const syncHigh = bytes[frameOffset];
  const syncLow = bytes[frameOffset + 1];
  if (syncHigh !== 0xff || (syncLow & 0xe0) !== 0xe0) return empty;

  const versionBits = (syncLow >> 3) & 0x03;
  const rateIdx = (bytes[frameOffset + 2] >> 2) & 0x03;
  const channelMode = (bytes[frameOffset + 3] >> 6) & 0x03;
  const sampleRate = readSampleRate(versionBits, rateIdx);
  if (sampleRate === 0) return empty;
  const tagFrameOffset = readTagOffset(versionBits, channelMode);
  if (tagFrameOffset === 0) return empty;

  const tagOffset = frameOffset + tagFrameOffset;
  if (tagOffset + 4 > bytes.length) return empty;
  const tag =
    String.fromCharCode(bytes[tagOffset]) +
    String.fromCharCode(bytes[tagOffset + 1]) +
    String.fromCharCode(bytes[tagOffset + 2]) +
    String.fromCharCode(bytes[tagOffset + 3]);
  if (tag !== "Xing" && tag !== "Info") return empty;

  const lameOffset = tagOffset + 0x78;
  if (lameOffset + 0x18 > bytes.length) return empty;
  const high = bytes[lameOffset + 0x15];
  const mixed = bytes[lameOffset + 0x16];
  const encoderDelay = (high << 4) | (mixed >> 4);
  const samples = encoderDelay + DECODER_DELAY_SAMPLES;
  if (samples > PRIMING_HARD_CAP) {
    console.warn(`${LOG_PREFIX} LAME priming over cap:`, samples);
    return empty;
  }
  return { samples, sampleRate };
}

function stripLeading<T extends Float32Array>(channels: T[], n: number): T[] {
  if (n <= 0) return channels;
  return channels.map((c) => c.slice(n) as T);
}

function cropAudioBufferHead(audio: AudioBuffer, startSample: number, ctx: BaseAudioContext): AudioBuffer {
  if (startSample <= 0) return audio;
  if (startSample >= audio.length) {
    console.warn(`${LOG_PREFIX} priming meets or exceeds buffer length; skipping crop:`, startSample, audio.length);
    return audio;
  }
  const length = audio.length - startSample;
  const out = ctx.createBuffer(audio.numberOfChannels, length, audio.sampleRate);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const src = audio.getChannelData(c);
    out.getChannelData(c).set(src.subarray(startSample, startSample + length));
  }
  return out;
}

// -- Exports -------------------------------------------------------------------

export { cropAudioBufferHead, findFirstMp3FrameOffset, parseLamePriming, stripLeading };
export type { LamePriming };
