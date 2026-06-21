import { describe, expect, it } from "vitest";
import { extractVideoId } from "@/utils/youtube-url";

const VALID_ID = "dQw4w9WgXcQ";

describe("extractVideoId - valid inputs", () => {
  it("accepts a raw 11-character videoId", () => {
    expect(extractVideoId(VALID_ID)).toBe(VALID_ID);
  });

  it("accepts a videoId with underscores and hyphens", () => {
    expect(extractVideoId("a_b-c_d-e_f")).toBe("a_b-c_d-e_f");
  });

  it("extracts from a standard youtube.com watch URL", () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from a watch URL with extra params", () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VALID_ID}&t=42&list=PLabc`)).toBe(VALID_ID);
  });

  it("extracts from a no-www youtube.com URL", () => {
    expect(extractVideoId(`https://youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from m.youtube.com", () => {
    expect(extractVideoId(`https://m.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from music.youtube.com", () => {
    expect(extractVideoId(`https://music.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from a youtu.be short URL", () => {
    expect(extractVideoId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from youtu.be with timestamp", () => {
    expect(extractVideoId(`https://youtu.be/${VALID_ID}?t=42`)).toBe(VALID_ID);
  });

  it("extracts from a /shorts/ URL", () => {
    expect(extractVideoId(`https://www.youtube.com/shorts/${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from an /embed/ URL", () => {
    expect(extractVideoId(`https://www.youtube.com/embed/${VALID_ID}`)).toBe(VALID_ID);
  });

  it("extracts from a /live/ URL", () => {
    expect(extractVideoId(`https://www.youtube.com/live/${VALID_ID}`)).toBe(VALID_ID);
  });

  it("trims surrounding whitespace", () => {
    expect(extractVideoId(`  ${VALID_ID}  `)).toBe(VALID_ID);
    expect(extractVideoId(`\nhttps://youtu.be/${VALID_ID}\n`)).toBe(VALID_ID);
  });
});

describe("extractVideoId - invalid inputs", () => {
  it("rejects empty string", () => {
    expect(extractVideoId("")).toBeNull();
    expect(extractVideoId("   ")).toBeNull();
  });

  it("rejects a 10-char string", () => {
    expect(extractVideoId("dQw4w9WgXc")).toBeNull();
  });

  it("rejects a 12-char string", () => {
    expect(extractVideoId("dQw4w9WgXcQX")).toBeNull();
  });

  it("rejects videoId with invalid characters", () => {
    expect(extractVideoId("dQw4w9WgX!Q")).toBeNull();
  });

  it("rejects a non-YouTube domain", () => {
    expect(extractVideoId(`https://example.com/watch?v=${VALID_ID}`)).toBeNull();
  });

  it("rejects a YouTube URL with no videoId", () => {
    expect(extractVideoId("https://www.youtube.com/feed/trending")).toBeNull();
  });

  it("rejects a youtube.com watch URL with malformed v param", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=tooShort")).toBeNull();
  });

  it("rejects ftp and other protocols", () => {
    expect(extractVideoId(`ftp://youtube.com/watch?v=${VALID_ID}`)).toBeNull();
  });

  it("rejects garbage strings", () => {
    expect(extractVideoId("not a url at all")).toBeNull();
    expect(extractVideoId("https://")).toBeNull();
  });
});
