/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { parseLyrics } from "@/views/edit/parse-lyrics";
import { describe, expect, it } from "vitest";

describe("parseLyrics", () => {
  it("matches non-empty input lines to non-empty stored lines in order", () => {
    const lines: LyricLine[] = [
      { id: "A", text: "verse one", agentId: "v1" },
      { id: "B", text: "verse two", agentId: "v2" },
    ];
    const result = parseLyrics("verse one\nverse two", lines, "v1");
    expect(result).toHaveLength(2);
    expect(result[0].lineId).toBe("A");
    expect(result[0].text).toBe("verse one");
    expect(result[1].lineId).toBe("B");
    expect(result[1].text).toBe("verse two");
  });

  it("renders blank input lines as isEmpty=true placeholders without consuming a stored line", () => {
    const lines: LyricLine[] = [
      { id: "A", text: "verse one", agentId: "v1" },
      { id: "B", text: "verse two", agentId: "v2" },
    ];
    const result = parseLyrics("verse one\n\nverse two", lines, "v1");
    expect(result).toHaveLength(3);
    expect(result[0].lineId).toBe("A");
    expect(result[1].isEmpty).toBe(true);
    expect(result[1].lineId).toBe("");
    expect(result[2].lineId).toBe("B");
  });

  it("skips text:'' stored lines so non-empty input lines align correctly", () => {
    // Reproduces the bug from issue #33: an empty draft line in the project
    // store made parseLyrics index off by one, causing every line after the
    // empty to render its predecessor's text.
    const lines: LyricLine[] = [
      { id: "A", text: "Whoa", agentId: "v1" },
      { id: "B", text: "Yeah", agentId: "v1" },
      { id: "EMPTY", text: "", agentId: "v1" },
      { id: "C", text: "Lit City", agentId: "v1" },
      { id: "D", text: "Wave again", agentId: "v1" },
    ];
    const text = "Whoa\nYeah\n\nLit City\nWave again";
    const result = parseLyrics(text, lines, "v1");
    expect(result).toHaveLength(5);
    expect(result[0].lineId).toBe("A");
    expect(result[1].lineId).toBe("B");
    expect(result[2].isEmpty).toBe(true);
    expect(result[2].lineId).toBe("");
    expect(result[3].lineId).toBe("C");
    expect(result[3].text).toBe("Lit City");
    expect(result[4].lineId).toBe("D");
    expect(result[4].text).toBe("Wave again");
  });

  it("falls back to defaultAgentId for unmatched non-empty input", () => {
    const result = parseLyrics("brand new line", [], "v9");
    expect(result[0].agentId).toBe("v9");
    expect(result[0].lineId).toBe("");
  });

  it("propagates groupId/instanceIdx/templateLineIdx from matched stored lines", () => {
    const lines: LyricLine[] = [
      { id: "A", text: "x", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 2 },
    ];
    const result = parseLyrics("x", lines, "v1");
    expect(result[0].groupId).toBe("g1");
    expect(result[0].instanceIdx).toBe(0);
    expect(result[0].templateLineIdx).toBe(2);
  });
});
