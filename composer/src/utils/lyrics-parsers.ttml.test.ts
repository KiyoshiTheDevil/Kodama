import { describe, expect, it } from "vitest";
import { parseLyricsFile } from "@/utils/lyrics-parsers";

describe("parseLyricsFile - TTML with undeclared namespaces (AMLL)", () => {
  it("parses an AMLL export that uses <amll:meta> without declaring xmlns:amll", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><head><metadata><ttm:agent type="person" xml:id="v1"/><amll:meta key="musicName" value="It Aint Nun"/><amll:meta key="artists" value="CHRIST DILLINGER, Acid Souljah"/><amll:meta key="album" value="It Aint Nun"/></metadata></head><body dur="04:29.370"><div begin="00:01.277" end="04:24.060"><p begin="00:01.277" end="00:02.621" ttm:agent="v1" itunes:key="L1"><span begin="00:01.277" end="00:01.480">Hell</span> <span begin="00:01.480" end="00:01.676">no,</span> <span begin="00:01.676" end="00:01.823">I</span> <span begin="00:01.823" end="00:02.075">can't</span> <span begin="00:02.075" end="00:02.257">be</span> <span begin="00:02.257" end="00:02.411">your</span> <span begin="00:02.411" end="00:02.621">man</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);

    expect(result.lines.length).toBeGreaterThan(0);
    expect(result.hasTimingData).toBe(true);

    const firstLine = result.lines[0];
    expect(firstLine.words).toBeDefined();
    expect(firstLine.words?.length).toBe(7);
    expect(firstLine.words?.[0].text).toBe("Hell ");
    expect(firstLine.words?.[0].begin).toBeCloseTo(1.277, 3);
    expect(firstLine.words?.[6].text).toBe("man");
    expect(firstLine.words?.[6].end).toBeCloseTo(2.621, 3);
    expect(firstLine.text).toBe("Hell no, I can't be your man");
  });

  it("does not leak <amll:meta> content into lyrics text", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><amll:meta key="musicName" value="LEAKED_TITLE"/><amll:meta key="artists" value="LEAKED_ARTIST"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:02.000">Hello</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("Hello");
    expect(result.lines[0].text).not.toContain("LEAKED_TITLE");
    expect(result.lines[0].text).not.toContain("LEAKED_ARTIST");
  });

  it("parses well-formed TTML identically (regression guard)", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">Hello</span> <span begin="00:01.500" end="00:02.000">world</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("Hello world");
    expect(result.lines[0].words).toHaveLength(2);
    expect(result.lines[0].words?.[0].begin).toBeCloseTo(1.0, 3);
    expect(result.lines[0].words?.[1].end).toBeCloseTo(2.0, 3);
  });

  it("tolerates an undeclared prefix used only in an attribute", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1" custom:flag="x"><span begin="00:01.000" end="00:02.000">Hello</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe("Hello");
  });
});

describe("parseLyricsFile - TTML word explicit attribute", () => {
  it('recognizes amll:obscene="true" on a word span', () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:44.055" end="00:45.861" ttm:agent="v1"><span begin="00:44.055" end="00:44.192">Bot</span> <span begin="00:44.192" end="00:44.370">tom</span> <span begin="00:44.370" end="00:44.601">lip</span> <span begin="00:44.601" end="00:44.832" amll:obscene="true">curlin'</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const words = result.lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[3].text).toBe("curlin'");
    expect(words[3].explicit).toBe(true);
  });

  it('recognizes composer:explicit="true" on a word span', () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:composer="https://composer.boidu.dev/ttml"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">clean</span> <span begin="00:01.500" end="00:02.000" composer:explicit="true">dirty</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const words = result.lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[1].explicit).toBe(true);
  });

  it("recognizes an unprefixed obscene attribute", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:02.000" obscene="1">dirty</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    expect(result.lines[0].words![0].explicit).toBe(true);
  });

  it('treats explicit="false" / "0" as not explicit', () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:composer="https://composer.boidu.dev/ttml"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500" composer:explicit="false">clean</span> <span begin="00:01.500" end="00:02.000" composer:explicit="0">also</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const words = result.lines[0].words!;
    expect(words[0].explicit).toBeUndefined();
    expect(words[1].explicit).toBeUndefined();
  });

  it("recognizes explicit on a word inside x-bg, landing on backgroundWords", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:composer="https://composer.boidu.dev/ttml"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.500" ttm:agent="v1"><span begin="00:01.000" end="00:02.000">main</span><span ttm:role="x-bg"><span begin="00:02.000" end="00:02.250">oh</span> <span begin="00:02.250" end="00:02.500" composer:explicit="true">shit</span></span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const line = result.lines[0];
    expect(line.words![0].explicit).toBeUndefined();
    expect(line.backgroundWords).toBeDefined();
    expect(line.backgroundWords![0].explicit).toBeUndefined();
    expect(line.backgroundWords![1].text).toContain("shit");
    expect(line.backgroundWords![1].explicit).toBe(true);
  });
});

describe("parseLyricsFile - TTML background provenance", () => {
  it("stamps backgroundTextSource as manual on a word-synced line with x-bg words", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.500" ttm:agent="v1"><span begin="00:01.000" end="00:02.000">main</span><span ttm:role="x-bg"><span begin="00:02.000" end="00:02.250">oh</span> <span begin="00:02.250" end="00:02.500">yeah</span></span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const line = result.lines[0];
    expect(line.backgroundWords).toBeDefined();
    expect(line.backgroundTextSource).toBe("manual");
  });

  it("stamps backgroundTextSource as manual on a line-synced line with x-bg text", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:03.000" ttm:agent="v1">main line<span ttm:role="x-bg">backing vocal</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    const line = result.lines[0];
    expect(line.text).toBe("main line");
    expect(line.backgroundText).toBe("backing vocal");
    expect(line.backgroundTextSource).toBe("manual");
  });

  it("leaves backgroundTextSource undefined on a line with no x-bg content", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:02.000" ttm:agent="v1"><span begin="00:01.000" end="00:01.500">Hello</span> <span begin="00:01.500" end="00:02.000">world</span></p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    expect(result.lines[0].backgroundText).toBeUndefined();
    expect(result.lines[0].backgroundTextSource).toBeUndefined();
  });

  it("leaves backgroundTextSource undefined on a line-synced line with no x-bg content", () => {
    const content = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head><body><div><p begin="00:01.000" end="00:03.000" ttm:agent="v1">just a plain line</p></div></body></tt>`;
    const result = parseLyricsFile("song.ttml", content);
    expect(result.lines[0].backgroundText).toBeUndefined();
    expect(result.lines[0].backgroundTextSource).toBeUndefined();
  });
});
