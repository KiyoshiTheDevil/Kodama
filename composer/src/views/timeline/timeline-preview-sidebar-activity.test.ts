/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { getTimingState } from "./timeline-preview-sidebar-activity";

describe("getTimingState", () => {
  describe("regular timing (begin < end)", () => {
    it("returns inactive before begin", () => {
      expect(getTimingState(1, 2, 0.5)).toEqual({ isActive: false, isComplete: false, progress: 0 });
    });

    it("returns active at exactly begin", () => {
      const state = getTimingState(1, 2, 1);
      expect(state.isActive).toBe(true);
      expect(state.isComplete).toBe(false);
      expect(state.progress).toBeCloseTo(0);
    });

    it("returns active mid-word with linear progress", () => {
      const state = getTimingState(1, 2, 1.5);
      expect(state.isActive).toBe(true);
      expect(state.isComplete).toBe(false);
      expect(state.progress).toBeCloseTo(0.5);
    });

    it("returns complete at exactly end", () => {
      expect(getTimingState(1, 2, 2)).toEqual({ isActive: false, isComplete: true, progress: 1 });
    });

    it("returns complete after end", () => {
      expect(getTimingState(1, 2, 5)).toEqual({ isActive: false, isComplete: true, progress: 1 });
    });
  });

  describe("zero-duration timing (begin === end)", () => {
    it("returns inactive before begin", () => {
      expect(getTimingState(1.5, 1.5, 1)).toEqual({ isActive: false, isComplete: false, progress: 0 });
    });

    it("returns complete at exactly begin", () => {
      expect(getTimingState(1.5, 1.5, 1.5)).toEqual({ isActive: false, isComplete: true, progress: 1 });
    });

    it("does not stay active forever after begin (regression for #45)", () => {
      const state = getTimingState(1.5, 1.5, 100);
      expect(state.isActive).toBe(false);
      expect(state.isComplete).toBe(true);
      expect(state.progress).toBe(1);
    });
  });
});
