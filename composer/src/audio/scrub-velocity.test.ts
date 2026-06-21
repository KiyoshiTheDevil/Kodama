import { computeScrubVelocity } from "@/audio/scrub-velocity";
import { describe, expect, test } from "vitest";

const OPTS = { minDtMs: 16, minRate: 0.25, maxRate: 4, minAudibleRate: 0.1 };

describe("computeScrubVelocity", () => {
  test("returns 0 when prev is null", () => {
    expect(computeScrubVelocity(null, { time: 1, wallClockMs: 0 }, OPTS)).toBe(0);
  });

  test("returns 0 when magnitude below minAudibleRate", () => {
    const prev = { time: 1, wallClockMs: 0 };
    const curr = { time: 1.001, wallClockMs: 100 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(0);
  });

  test("clamps to maxRate on a very fast drag", () => {
    const prev = { time: 0, wallClockMs: 0 };
    const curr = { time: 10, wallClockMs: 100 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(4);
  });

  test("clamps to minRate when audible but below floor", () => {
    const prev = { time: 0, wallClockMs: 0 };
    const curr = { time: 0.02, wallClockMs: 100 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(0.25);
  });

  test("returns magnitude for reverse drag", () => {
    const prev = { time: 5, wallClockMs: 0 };
    const curr = { time: 3, wallClockMs: 100 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(4);
  });

  test("applies minDtMs floor so tiny dt cannot inflate rate", () => {
    const prev = { time: 0, wallClockMs: 0 };
    const curr = { time: 0.05, wallClockMs: 1 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(4);
  });

  test("does not floor small positive dt; maxRate is the only rate cap", () => {
    const prev = { time: 0, wallClockMs: 0 };
    const curr = { time: 0.001, wallClockMs: 1 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(1);
  });

  test("treats backwards wallClock as zero-dt fallback", () => {
    const prev = { time: 5, wallClockMs: 1000 };
    const curr = { time: 5.5, wallClockMs: 500 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(4);
  });

  test("NaN inputs do not produce a non-zero rate", () => {
    const prev = { time: 0, wallClockMs: 0 };
    const curr = { time: Number.NaN, wallClockMs: 100 };
    expect(computeScrubVelocity(prev, curr, OPTS)).toBe(0);
  });
});
