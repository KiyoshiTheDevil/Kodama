import { audioBufferToWav, needsWavConversion } from "@/audio/audio-decode";
import { describe, expect, it } from "vitest";

function fakeAudio(channels: number[][], sampleRate = 44100) {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (c: number) => Float32Array.from(channels[c]),
  };
}

function ascii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("needsWavConversion", () => {
  describe("flagged formats (no native seek tables)", () => {
    it("flags audio/mpeg", () => {
      expect(needsWavConversion(new File([], "x", { type: "audio/mpeg" }))).toBe(true);
    });
    it("flags audio/mp3 (non-canonical but seen in the wild)", () => {
      expect(needsWavConversion(new File([], "x", { type: "audio/mp3" }))).toBe(true);
    });
    it("flags .mp3 by extension regardless of case", () => {
      expect(needsWavConversion(new File([], "Song.MP3"))).toBe(true);
      expect(needsWavConversion(new File([], "track.mp3"))).toBe(true);
    });
    it("flags audio/aac (raw AAC bitstream, no container)", () => {
      expect(needsWavConversion(new File([], "x", { type: "audio/aac" }))).toBe(true);
    });
    it("flags .aac by extension regardless of case", () => {
      expect(needsWavConversion(new File([], "song.aac"))).toBe(true);
      expect(needsWavConversion(new File([], "song.AAC"))).toBe(true);
    });
  });

  describe("formats that DO have seek tables (must NOT be flagged)", () => {
    it("does not flag audio/mp4 — m4a carries AAC inside an MP4 container with seek atoms", () => {
      expect(needsWavConversion(new File([], "x.m4a", { type: "audio/mp4" }))).toBe(false);
    });
    it("does not flag .m4a by name (regression: must not be confused with raw aac)", () => {
      expect(needsWavConversion(new File([], "x.m4a"))).toBe(false);
    });
    it("does not flag audio/opus", () => {
      expect(needsWavConversion(new File([], "x.opus", { type: "audio/opus" }))).toBe(false);
    });
    it("does not flag audio/webm", () => {
      expect(needsWavConversion(new File([], "x.webm", { type: "audio/webm" }))).toBe(false);
    });
    it("does not flag audio/ogg", () => {
      expect(needsWavConversion(new File([], "x.ogg", { type: "audio/ogg" }))).toBe(false);
    });
    it("does not flag audio/wav", () => {
      expect(needsWavConversion(new File([], "x.wav", { type: "audio/wav" }))).toBe(false);
    });
    it("does not flag audio/flac", () => {
      expect(needsWavConversion(new File([], "x.flac", { type: "audio/flac" }))).toBe(false);
    });
  });

  describe("ambiguous cases", () => {
    it("does not flag an unknown extension with no mime", () => {
      expect(needsWavConversion(new File([], "mystery"))).toBe(false);
    });
    it("flags when mime type is mp3 even if extension is misleading", () => {
      expect(needsWavConversion(new File([], "Bad.wav", { type: "audio/mpeg" }))).toBe(true);
    });
    it("flags when extension is mp3 even if mime is missing", () => {
      expect(needsWavConversion(new File([], "Bad.mp3", { type: "" }))).toBe(true);
    });
  });
});

describe("audioBufferToWav", () => {
  it("writes a valid RIFF/WAVE 16-bit PCM header", async () => {
    const blob = audioBufferToWav(fakeAudio([[0, 0, 0, 0]], 48000));
    const view = new DataView(await blob.arrayBuffer());
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8); // 4 samples * 2 bytes
    expect(blob.type).toBe("audio/wav");
  });

  it("clamps and converts float samples to 16-bit ints", async () => {
    const blob = audioBufferToWav(fakeAudio([[1, -1, 2, -2, 0]]));
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767); // 2.0 clamps
    expect(view.getInt16(50, true)).toBe(-32768); // -2.0 clamps
    expect(view.getInt16(52, true)).toBe(0);
  });

  it("interleaves stereo channels L,R,L,R", async () => {
    const blob = audioBufferToWav(
      fakeAudio([
        [1, 0],
        [0, -1],
      ]),
    );
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getInt16(44, true)).toBe(32767); // L0
    expect(view.getInt16(46, true)).toBe(0); // R0
    expect(view.getInt16(48, true)).toBe(0); // L1
    expect(view.getInt16(50, true)).toBe(-32768); // R1
  });
});
