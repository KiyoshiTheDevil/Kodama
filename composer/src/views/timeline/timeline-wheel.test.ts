/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { computeScrubTime, decideWheelAction, normalizeWheelDelta } from "./timeline-wheel";

// -- Fixtures ------------------------------------------------------------------

function baseInput() {
  return {
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    overWaveform: false,
    horizontalScrollSetting: false,
  };
}

// -- decideWheelAction ---------------------------------------------------------

describe("decideWheelAction", () => {
  it("returns zoom when ctrl is held", () => {
    expect(decideWheelAction({ ...baseInput(), ctrlKey: true })).toEqual({ kind: "zoom" });
  });

  it("returns zoom when meta is held", () => {
    expect(decideWheelAction({ ...baseInput(), metaKey: true })).toEqual({ kind: "zoom" });
  });

  it("returns scrub when cursor is over the waveform", () => {
    expect(decideWheelAction({ ...baseInput(), overWaveform: true })).toEqual({ kind: "scrub" });
  });

  it("scrub wins over the horizontal-scroll setting when over the waveform", () => {
    expect(decideWheelAction({ ...baseInput(), overWaveform: true, horizontalScrollSetting: true })).toEqual({
      kind: "scrub",
    });
  });

  it("scrub wins over Shift when over the waveform", () => {
    expect(decideWheelAction({ ...baseInput(), overWaveform: true, shiftKey: true })).toEqual({
      kind: "scrub",
    });
  });

  it("returns native when the horizontal-scroll setting is off", () => {
    expect(decideWheelAction({ ...baseInput(), deltaY: 120 })).toEqual({ kind: "native" });
  });

  it("returns scroll x when setting on and wheel is vertical-dominant", () => {
    expect(decideWheelAction({ ...baseInput(), deltaY: 120, horizontalScrollSetting: true })).toEqual({
      kind: "scroll",
      axis: "x",
    });
  });

  it("returns scroll y when setting on and Shift is held", () => {
    expect(
      decideWheelAction({
        ...baseInput(),
        deltaY: 120,
        shiftKey: true,
        horizontalScrollSetting: true,
      }),
    ).toEqual({ kind: "scroll", axis: "y" });
  });

  it("returns native when setting on but wheel delta is horizontal-dominant", () => {
    expect(
      decideWheelAction({
        ...baseInput(),
        deltaX: 120,
        deltaY: 10,
        horizontalScrollSetting: true,
      }),
    ).toEqual({ kind: "native" });
  });

  it("returns scroll y when setting on and Shift is held even when the browser puts the delta in deltaX", () => {
    expect(
      decideWheelAction({
        ...baseInput(),
        deltaX: 200,
        deltaY: 0,
        shiftKey: true,
        horizontalScrollSetting: true,
      }),
    ).toEqual({ kind: "scroll", axis: "y" });
  });
});

// -- computeScrubTime ----------------------------------------------------------

describe("computeScrubTime", () => {
  it("moves forward on positive deltaY", () => {
    expect(computeScrubTime(10, 100, 50, 60)).toBe(12);
  });

  it("moves backward on negative deltaY", () => {
    expect(computeScrubTime(10, -100, 50, 60)).toBe(8);
  });

  it("clamps to 0", () => {
    expect(computeScrubTime(1, -500, 50, 60)).toBe(0);
  });

  it("clamps to duration", () => {
    expect(computeScrubTime(58, 500, 50, 60)).toBe(60);
  });

  it("returns currentTime unchanged when zoom is zero or negative", () => {
    expect(computeScrubTime(10, 100, 0, 60)).toBe(10);
    expect(computeScrubTime(10, 100, -5, 60)).toBe(10);
  });
});

// -- normalizeWheelDelta -------------------------------------------------------

describe("normalizeWheelDelta", () => {
  it("returns the delta unchanged in pixel mode", () => {
    expect(normalizeWheelDelta(120, 0)).toBe(120);
  });

  it("scales line-mode deltas up to pixels", () => {
    expect(normalizeWheelDelta(3, 1)).toBe(120);
  });

  it("scales page-mode deltas up to pixels", () => {
    expect(normalizeWheelDelta(1, 2)).toBe(800);
  });

  it("preserves sign when scaling", () => {
    expect(normalizeWheelDelta(-3, 1)).toBe(-120);
  });
});
