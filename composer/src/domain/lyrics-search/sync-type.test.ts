import { describe, expect, it } from "vitest";
import { detectLrcSyncType, detectTtmlSyncType } from "@/domain/lyrics-search/sync-type";

// -- detectLrcSyncType --------------------------------------------------------

describe("detectLrcSyncType", () => {
  it("returns unsynced for an empty string", () => {
    expect(detectLrcSyncType("")).toBe("unsynced");
  });

  it("returns unsynced for whitespace-only input", () => {
    expect(detectLrcSyncType("   \n\t  \n")).toBe("unsynced");
  });

  it("returns unsynced for metadata-only LRC", () => {
    const content = "[ar:Queen]\n[ti:Bohemian Rhapsody]\n[al:A Night at the Opera]";
    expect(detectLrcSyncType(content)).toBe("unsynced");
  });

  it("returns unsynced for plain text lines with no timestamps", () => {
    const content = "Is this the real life\nIs this just fantasy\nCaught in a landslide";
    expect(detectLrcSyncType(content)).toBe("unsynced");
  });

  it("returns line for LRC with one line-level timestamp", () => {
    expect(detectLrcSyncType("[01:23.45]Lyric text")).toBe("line");
  });

  it("returns line for multi-line LRC with line-level timestamps only", () => {
    const content = "[00:12.34]Is this the real life\n[00:15.67]Is this just fantasy";
    expect(detectLrcSyncType(content)).toBe("line");
  });

  it("returns word for enhanced LRC with inline word markers", () => {
    const content = "[00:12.34]<00:12.34>I <00:12.50>wanna <00:12.80>be";
    expect(detectLrcSyncType(content)).toBe("word");
  });

  it("returns word when any single line carries inline word markers", () => {
    const content = ["[00:12.34]No markers here", "[00:15.00]<00:15.00>With <00:15.50>markers"].join("\n");
    expect(detectLrcSyncType(content)).toBe("word");
  });

  it("returns line for mixed-case short timestamp form like [1:2.3]", () => {
    expect(detectLrcSyncType("[1:2.3]Lyric")).toBe("line");
  });

  it("returns line for millisecond form like [01:02.345]", () => {
    expect(detectLrcSyncType("[01:02.345]Lyric")).toBe("line");
  });

  it("returns line for metadata + content where only content carries timestamps", () => {
    const content = "[ar:Queen]\n[ti:Title]\n[00:12.34]Content line";
    expect(detectLrcSyncType(content)).toBe("line");
  });

  it("returns line when valid timestamps coexist with malformed ones", () => {
    const content = "[01:xx.45]Garbage\n[00:12.34]Valid line";
    expect(detectLrcSyncType(content)).toBe("line");
  });

  it("does not crash on suspicious bracket content that is not a timestamp", () => {
    const content = "[00:01.00]<bad>not a marker";
    expect(() => detectLrcSyncType(content)).not.toThrow();
    expect(detectLrcSyncType(content)).toBe("line");
  });

  it("treats unicode whitespace as empty for unsynced detection", () => {
    expect(detectLrcSyncType("  \n")).toBe("unsynced");
  });

  it("returns word for colon-separated millisecond form <01:02:345>", () => {
    expect(detectLrcSyncType("[01:02.345]<01:02:345>word")).toBe("word");
  });
});

// -- detectTtmlSyncType -------------------------------------------------------

describe("detectTtmlSyncType", () => {
  it("returns unsynced for an empty string", () => {
    expect(detectTtmlSyncType("")).toBe("unsynced");
  });

  it("returns unsynced for whitespace-only input", () => {
    expect(detectTtmlSyncType("   \n  ")).toBe("unsynced");
  });

  it("returns unsynced for non-XML garbage", () => {
    expect(detectTtmlSyncType("not xml at all <<>>")).toBe("unsynced");
  });

  it("returns line for TTML with only <p begin end> line-level timing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:01.000" end="00:02.000">hello world</p>
    <p begin="00:02.000" end="00:03.000">second line</p>
  </div></body>
</tt>`;
    expect(detectTtmlSyncType(xml)).toBe("line");
  });

  it("returns syllable for TTML with nested <span begin> inside <p>", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:01.000" end="00:02.000">
      <span begin="00:01.000" end="00:01.500">word</span>
    </p>
  </div></body>
</tt>`;
    expect(detectTtmlSyncType(xml)).toBe("syllable");
  });

  it("returns syllable when at least one <p> has nested timed spans (mixed)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p begin="00:01.000" end="00:02.000">line-only</p>
    <p begin="00:02.000" end="00:03.000">
      <span begin="00:02.000" end="00:02.500">syllable</span>
    </p>
  </div></body>
</tt>`;
    expect(detectTtmlSyncType(xml)).toBe("syllable");
  });

  it("returns unsynced for TTML with no begin attributes anywhere", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body><div>
    <p>hello world</p>
    <p>another line</p>
  </div></body>
</tt>`;
    expect(detectTtmlSyncType(xml)).toBe("unsynced");
  });

  it("returns syllable for background-vocal container (no begin on container, begins on children)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <body><div>
    <p begin="00:01.000" end="00:02.000">
      <span ttm:role="x-bg">
        <span begin="00:01.000" end="00:01.250">ah</span>
        <span begin="00:01.250" end="00:01.500">ah</span>
      </span>
    </p>
  </div></body>
</tt>`;
    expect(detectTtmlSyncType(xml)).toBe("syllable");
  });

  it("does not throw on malformed XML", () => {
    const xml = '<tt><body><div><p begin="00:01.000">unterminated';
    expect(() => detectTtmlSyncType(xml)).not.toThrow();
  });

  it("falls back to a sane sync-type when DOMParser fails on malformed XML", () => {
    const xml = '<tt><body><div><p begin="00:01.000">unterminated';
    const result = detectTtmlSyncType(xml);
    expect(["line", "unsynced"]).toContain(result);
  });

  it("returns line for malformed-but-recoverable XML with only <p begin>", () => {
    const xml = `<tt><body><div><p begin="00:01.000" end="00:02.000">x</p></div></body></tt>`;
    expect(detectTtmlSyncType(xml)).toBe("line");
  });
});
