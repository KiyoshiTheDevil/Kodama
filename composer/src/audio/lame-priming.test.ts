import { describe, expect, it } from "vitest";
import { findFirstMp3FrameOffset, parseLamePriming, stripLeading } from "@/audio/lame-priming";

// -- Fixtures ------------------------------------------------------------------

type Mode =
  | { version: "mpeg1"; channels: "stereo" | "mono" }
  | { version: "mpeg2"; channels: "stereo" | "mono" }
  | { version: "mpeg25"; channels: "stereo" | "mono" };

function versionBitsFor(mode: Mode): number {
  if (mode.version === "mpeg1") return 0x03;
  if (mode.version === "mpeg2") return 0x02;
  return 0x00;
}

function channelBitsFor(mode: Mode): number {
  return mode.channels === "mono" ? 0x03 : 0x01;
}

function tagOffsetFor(mode: Mode): number {
  if (mode.version === "mpeg1" && mode.channels === "stereo") return 0x24;
  if (mode.version === "mpeg1") return 0x15;
  if (mode.channels === "stereo") return 0x15;
  return 0x0d;
}

function buildFrame(mode: Mode, encoderDelay: number, tag: "Xing" | "Info" = "Info"): Uint8Array {
  const frame = new Uint8Array(417);
  const sync = 0xe0 | (versionBitsFor(mode) << 3) | (0x01 << 1) | 0x01;
  frame[0] = 0xff;
  frame[1] = sync;
  frame[2] = 0x90;
  frame[3] = channelBitsFor(mode) << 6;
  const tagOffset = tagOffsetFor(mode);
  const tagBytes = new TextEncoder().encode(tag);
  frame.set(tagBytes, tagOffset);
  const lameOffset = tagOffset + 0x78;
  const delayHigh = (encoderDelay >> 4) & 0xff;
  const mixed = ((encoderDelay & 0x0f) << 4) | 0;
  frame[lameOffset + 0x15] = delayHigh;
  frame[lameOffset + 0x16] = mixed;
  return frame;
}

function buildMp3FrameHeader(): Uint8Array {
  const frame = buildFrame({ version: "mpeg1", channels: "stereo" }, 0);
  return frame.slice(0, 4);
}

function buildXingTagFrame(encoderDelay: number, tag: "Xing" | "Info" = "Info"): Uint8Array {
  return buildFrame({ version: "mpeg1", channels: "stereo" }, encoderDelay, tag);
}

function withId3v2Prefix(payload: Uint8Array, sizeBytes = 100): Uint8Array {
  const header = new Uint8Array(10 + sizeBytes);
  header.set(new TextEncoder().encode("ID3"), 0);
  header[3] = 3;
  header[6] = (sizeBytes >> 21) & 0x7f;
  header[7] = (sizeBytes >> 14) & 0x7f;
  header[8] = (sizeBytes >> 7) & 0x7f;
  header[9] = sizeBytes & 0x7f;
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

// -- Tests ---------------------------------------------------------------------

describe("parseLamePriming", () => {
  it("returns samples 1105 + 528 and sampleRate 44100 for a CBR Info tag", () => {
    const frame = buildXingTagFrame(1105, "Info");
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 1105 + 528, sampleRate: 44_100 });
  });

  it("returns samples 2257 + 528 and sampleRate 44100 for a VBR Xing tag", () => {
    const frame = buildXingTagFrame(2257, "Xing");
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 2257 + 528, sampleRate: 44_100 });
  });

  it("skips an ID3v2 header before locating the frame", () => {
    const frame = buildXingTagFrame(1105, "Info");
    const withHeader = withId3v2Prefix(frame, 100);
    expect(parseLamePriming(withHeader.buffer)).toEqual({ samples: 1105 + 528, sampleRate: 44_100 });
  });
});

describe("parseLamePriming across MPEG versions and channel modes", () => {
  it("parses MPEG-1 mono with the Xing tag at offset 0x15", () => {
    const frame = buildFrame({ version: "mpeg1", channels: "mono" }, 576);
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 576 + 528, sampleRate: 44_100 });
  });

  it("parses MPEG-2 stereo at 22050 Hz with the Xing tag at offset 0x15", () => {
    const frame = buildFrame({ version: "mpeg2", channels: "stereo" }, 480);
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 480 + 528, sampleRate: 22_050 });
  });

  it("parses MPEG-2 mono at 22050 Hz with the Xing tag at offset 0x0D", () => {
    const frame = buildFrame({ version: "mpeg2", channels: "mono" }, 320);
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 320 + 528, sampleRate: 22_050 });
  });

  it("parses MPEG-2.5 stereo at 11025 Hz with the Xing tag at offset 0x15", () => {
    const frame = buildFrame({ version: "mpeg25", channels: "stereo" }, 480);
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 480 + 528, sampleRate: 11_025 });
  });
});

describe("parseLamePriming edge cases", () => {
  it("returns zero priming for non-MP3 bytes", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    expect(parseLamePriming(bytes.buffer)).toEqual({ samples: 0, sampleRate: 0 });
  });

  it("returns zero priming when an MP3 frame header is present but no Xing/Info tag follows", () => {
    const frame = new Uint8Array(417);
    frame.set(buildMp3FrameHeader(), 0);
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 0, sampleRate: 0 });
  });

  it("returns zero priming for a truncated buffer", () => {
    const frame = buildXingTagFrame(1105, "Info");
    const truncated = frame.slice(0, 20);
    expect(parseLamePriming(truncated.buffer)).toEqual({ samples: 0, sampleRate: 0 });
  });

  it("accepts the maximum valid 12-bit encoder delay without tripping the hard cap", () => {
    const frame = buildXingTagFrame(0, "Info");
    const tagOffset = 0x24;
    const lameOffset = tagOffset + 0x78;
    frame[lameOffset + 0x15] = 0xff;
    frame[lameOffset + 0x16] = 0xf0;
    expect(parseLamePriming(frame.buffer)).toEqual({ samples: 4095 + 528, sampleRate: 44_100 });
  });

  it("accepts a Uint8Array directly", () => {
    const frame = buildXingTagFrame(1105, "Info");
    expect(parseLamePriming(frame)).toEqual({ samples: 1105 + 528, sampleRate: 44_100 });
  });

  it("returns zero priming for an empty buffer", () => {
    expect(parseLamePriming(new ArrayBuffer(0))).toEqual({ samples: 0, sampleRate: 0 });
  });
});

describe("findFirstMp3FrameOffset", () => {
  it("returns 0 when no ID3 header is present", () => {
    const frame = buildXingTagFrame(1105, "Info");
    expect(findFirstMp3FrameOffset(frame)).toBe(0);
  });

  it("returns 10 + sizeBytes past an ID3v2 header", () => {
    const sizeBytes = 200;
    const frame = buildXingTagFrame(1105, "Info");
    const withHeader = withId3v2Prefix(frame, sizeBytes);
    expect(findFirstMp3FrameOffset(withHeader)).toBe(10 + sizeBytes);
  });

  it("masks the high bit of each ID3v2 size byte per syncsafe spec", () => {
    const payload = buildXingTagFrame(1105, "Info");
    const header = new Uint8Array(10 + payload.length);
    header.set(new TextEncoder().encode("ID3"), 0);
    header[3] = 3;
    header[6] = 0x80;
    header[7] = 0x80;
    header[8] = 0x80;
    header[9] = 0x80;
    const out = new Uint8Array(header.length + payload.length);
    out.set(header, 0);
    out.set(payload, header.length);
    expect(findFirstMp3FrameOffset(out)).toBe(10);
  });
});

describe("stripLeading", () => {
  it("returns the same array references when n is 0", () => {
    const left = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const right = new Float32Array([0.5, 0.6, 0.7, 0.8]);
    const channels = [left, right];
    const result = stripLeading(channels, 0);
    expect(result[0]).toBe(left);
    expect(result[1]).toBe(right);
  });

  it("slices first 2 samples off each channel when n is 2", () => {
    const left = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const right = new Float32Array([0.5, 0.6, 0.7, 0.8]);
    const result = stripLeading([left, right], 2);
    expect(Array.from(result[0])).toEqual(Array.from(new Float32Array([0.3, 0.4])));
    expect(Array.from(result[1])).toEqual(Array.from(new Float32Array([0.7, 0.8])));
  });

  it("is a no-op when n is negative", () => {
    const left = new Float32Array([0.1, 0.2, 0.3]);
    const right = new Float32Array([0.4, 0.5, 0.6]);
    const channels = [left, right];
    const result = stripLeading(channels, -5);
    expect(result[0]).toBe(left);
    expect(result[1]).toBe(right);
  });

  it("returns empty channels when n equals channel length", () => {
    const left = new Float32Array([0.1, 0.2, 0.3]);
    const right = new Float32Array([0.4, 0.5, 0.6]);
    const result = stripLeading([left, right], 3);
    expect(result[0].length).toBe(0);
    expect(result[1].length).toBe(0);
  });
});
