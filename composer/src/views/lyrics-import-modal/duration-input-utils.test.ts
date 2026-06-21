import { describe, expect, it } from "vitest";
import { formatDuration, parseDurationInput } from "@/views/lyrics-import-modal/duration-input-utils";

// -- parseDurationInput -------------------------------------------------------

describe("parseDurationInput", () => {
  it("parses mm:ss form", () => {
    expect(parseDurationInput("3:45")).toBe(225);
    expect(parseDurationInput("5:55")).toBe(355);
    expect(parseDurationInput("0:30")).toBe(30);
  });

  it("parses bare integer seconds", () => {
    expect(parseDurationInput("225")).toBe(225);
    expect(parseDurationInput("0")).toBe(0);
  });

  it("returns undefined for empty or whitespace-only input", () => {
    expect(parseDurationInput("")).toBeUndefined();
    expect(parseDurationInput("   ")).toBeUndefined();
  });

  it("rejects malformed strings", () => {
    expect(parseDurationInput("abc")).toBeUndefined();
    expect(parseDurationInput("3:45:00")).toBeUndefined();
    expect(parseDurationInput("3.45")).toBeUndefined();
    expect(parseDurationInput("--")).toBeUndefined();
  });

  it("rejects seconds >= 60 in mm:ss form", () => {
    expect(parseDurationInput("3:60")).toBeUndefined();
    expect(parseDurationInput("3:99")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(parseDurationInput("  3:45  ")).toBe(225);
    expect(parseDurationInput("  225  ")).toBe(225);
  });
});

// -- formatDuration -----------------------------------------------------------

describe("formatDuration", () => {
  it("formats integer seconds as mm:ss", () => {
    expect(formatDuration(225)).toBe("3:45");
    expect(formatDuration(355)).toBe("5:55");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(0)).toBe("0:00");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(225.4)).toBe("3:45");
    expect(formatDuration(225.6)).toBe("3:46");
  });

  it("clamps negative input to zero", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(-100)).toBe("0:00");
  });

  it("zero-pads the seconds component", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(125)).toBe("2:05");
  });
});

// -- Round-trip ---------------------------------------------------------------

describe("duration round-trip", () => {
  it("parseDurationInput is the inverse of formatDuration for integers", () => {
    for (const value of [0, 1, 59, 60, 61, 225, 355, 3599, 3600]) {
      expect(parseDurationInput(formatDuration(value))).toBe(value);
    }
  });
});
