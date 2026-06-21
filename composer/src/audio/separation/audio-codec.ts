import { parseLamePriming, stripLeading } from "@/audio/lame-priming";

const TARGET_SAMPLE_RATE = 44_100;
const TARGET_CHANNELS = 2;

interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
  numFrames: number;
}

interface DecodeOptions {
  stripPriming?: boolean;
}

async function decodeFileToFloat32(file: File | Blob, opts: DecodeOptions = {}): Promise<DecodedAudio> {
  const buf = await file.arrayBuffer();
  const shouldStrip = opts.stripPriming !== false;
  const priming = shouldStrip ? parseLamePriming(buf) : { samples: 0, sampleRate: 0 };
  const trimAtTarget =
    priming.samples > 0 && priming.sampleRate > 0
      ? Math.round((priming.samples * TARGET_SAMPLE_RATE) / priming.sampleRate)
      : 0;
  const applyStrip = (channels: Float32Array[]): Float32Array[] => stripLeading(channels, trimAtTarget);

  const ctx = new OfflineAudioContext(TARGET_CHANNELS, 1, TARGET_SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(buf);

  if (decoded.sampleRate === TARGET_SAMPLE_RATE && decoded.numberOfChannels === TARGET_CHANNELS) {
    const channels: Float32Array[] = [];
    for (let c = 0; c < TARGET_CHANNELS; c++) {
      const out = new Float32Array(decoded.length);
      decoded.copyFromChannel(out, c);
      channels.push(out);
    }
    const stripped = applyStrip(channels);
    return { channels: stripped, sampleRate: TARGET_SAMPLE_RATE, numFrames: stripped[0]?.length ?? 0 };
  }

  const durationSec = decoded.length / decoded.sampleRate;
  const targetFrames = Math.ceil(durationSec * TARGET_SAMPLE_RATE);
  const resampleCtx = new OfflineAudioContext(TARGET_CHANNELS, targetFrames, TARGET_SAMPLE_RATE);
  const source = resampleCtx.createBufferSource();

  if (decoded.numberOfChannels === 1) {
    const stereoBuffer = resampleCtx.createBuffer(TARGET_CHANNELS, decoded.length, decoded.sampleRate);
    const mono = decoded.getChannelData(0);
    stereoBuffer.copyToChannel(mono, 0);
    stereoBuffer.copyToChannel(mono, 1);
    source.buffer = stereoBuffer;
  } else {
    source.buffer = decoded;
  }
  source.connect(resampleCtx.destination);
  source.start();
  const rendered = await resampleCtx.startRendering();

  const channels: Float32Array[] = [];
  for (let c = 0; c < TARGET_CHANNELS; c++) {
    const out = new Float32Array(rendered.length);
    rendered.copyFromChannel(out, c);
    channels.push(out);
  }
  const stripped = applyStrip(channels);
  return { channels: stripped, sampleRate: TARGET_SAMPLE_RATE, numFrames: stripped[0]?.length ?? 0 };
}

function floatChannelsToWavBlob(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  }
  function writeUint32(v: number) {
    view.setUint32(offset, v, true);
    offset += 4;
  }
  function writeUint16(v: number) {
    view.setUint16(offset, v, true);
    offset += 2;
  }

  writeString("RIFF");
  writeUint32(36 + dataSize);
  writeString("WAVE");
  writeString("fmt ");
  writeUint32(16);
  writeUint16(1);
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(16);
  writeString("data");
  writeUint32(dataSize);

  for (let frame = 0; frame < numFrames; frame++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashFile(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  return sha256Hex(buf);
}

export { TARGET_SAMPLE_RATE, TARGET_CHANNELS, decodeFileToFloat32, floatChannelsToWavBlob, sha256Hex, hashFile };
export type { DecodedAudio };
