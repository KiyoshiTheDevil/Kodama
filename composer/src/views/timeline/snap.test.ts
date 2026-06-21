/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { type SnapAnchor, collectSnapAnchors, findSnapShift, selfKey } from "./snap";

// -- Fixtures ------------------------------------------------------------------

function wordTimedLine(): LyricLine {
  return {
    id: "l1",
    text: "I love you",
    agentId: "v1",
    words: [
      { text: "I ", begin: 0, end: 0.3 },
      { text: "love ", begin: 0.3, end: 0.6 },
      { text: "you", begin: 0.6, end: 1 },
    ],
    backgroundText: "oh yeah",
    backgroundWords: [
      { text: "oh ", begin: 0.4, end: 0.55 },
      { text: "yeah", begin: 0.55, end: 0.8 },
    ],
  };
}

function lineSyncedLine(): LyricLine {
  return {
    id: "l2",
    text: "another line",
    agentId: "v1",
    begin: 2,
    end: 3,
  };
}

// -- collectSnapAnchors --------------------------------------------------------

describe("collectSnapAnchors", () => {
  it("includes begin and end for every word in a word-timed line", () => {
    const anchors = collectSnapAnchors([wordTimedLine()], new Set(), null);
    const wordAnchors = anchors.filter((a) => a.kind === "word-begin" || a.kind === "word-end");
    const times = wordAnchors.map((a) => a.t).sort((a, b) => a - b);
    expect(times).toContain(0);
    expect(times).toContain(0.3);
    expect(times).toContain(0.6);
    expect(times).toContain(1);
  });

  it("includes background word edges", () => {
    const anchors = collectSnapAnchors([wordTimedLine()], new Set(), null);
    const bgAnchors = anchors.filter((a) => a.track === "bg");
    expect(bgAnchors.length).toBe(4);
    const times = bgAnchors.map((a) => a.t).sort((a, b) => a - b);
    expect(times).toEqual([0.4, 0.55, 0.55, 0.8]);
  });

  it("does not emit line-begin or line-end anchors for word-timed lines", () => {
    const anchors = collectSnapAnchors([wordTimedLine()], new Set(), null);
    const lineBegins = anchors.filter((a) => a.kind === "line-begin");
    const lineEnds = anchors.filter((a) => a.kind === "line-end");
    expect(lineBegins.length).toBe(0);
    expect(lineEnds.length).toBe(0);
  });

  it("uses line.begin / line.end for line-synced lines without a words array", () => {
    const anchors = collectSnapAnchors([lineSyncedLine()], new Set(), null);
    const lineBegin = anchors.find((a) => a.kind === "line-begin");
    const lineEnd = anchors.find((a) => a.kind === "line-end");
    expect(lineBegin?.t).toBe(2);
    expect(lineEnd?.t).toBe(3);
    expect(anchors.filter((a) => a.kind === "word-begin" || a.kind === "word-end")).toEqual([]);
  });

  it("excludes self words by composite selfKey(lineId, wordIndex, track)", () => {
    const selfIds = new Set([selfKey("l1", 1, "word")]);
    const anchors = collectSnapAnchors([wordTimedLine()], selfIds, null);
    const selfWordTimes = anchors.flatMap((a) =>
      a.lineId === "l1" && a.wordIndex === 1 && a.track === "word" ? [a.t] : [],
    );
    expect(selfWordTimes).toEqual([]);
    const otherWordTimes = anchors
      .flatMap((a) => (a.lineId === "l1" && a.wordIndex === 2 && a.track === "word" ? [a.t] : []))
      .toSorted((a, b) => a - b);
    expect(otherWordTimes).toEqual([0.6, 1]);
  });

  it("excludes self background words independently from main-track words at the same index", () => {
    const selfIds = new Set([selfKey("l1", 0, "bg")]);
    const anchors = collectSnapAnchors([wordTimedLine()], selfIds, null);
    const selfBgTimes = anchors.flatMap((a) =>
      a.lineId === "l1" && a.wordIndex === 0 && a.track === "bg" ? [a.t] : [],
    );
    expect(selfBgTimes).toEqual([]);
    const mainWordZero = anchors
      .flatMap((a) => (a.lineId === "l1" && a.wordIndex === 0 && a.track === "word" ? [a.t] : []))
      .toSorted((a, b) => a - b);
    expect(mainWordZero).toEqual([0, 0.3]);
  });

  it("includes playhead when a time is provided", () => {
    const anchors = collectSnapAnchors([wordTimedLine()], new Set(), 0.42);
    const playhead = anchors.find((a) => a.kind === "playhead");
    expect(playhead?.t).toBe(0.42);
  });

  it("omits playhead when playheadTime is null", () => {
    const anchors = collectSnapAnchors([wordTimedLine()], new Set(), null);
    expect(anchors.some((a) => a.kind === "playhead")).toBe(false);
  });

  it("returns anchors sorted by t", () => {
    const anchors = collectSnapAnchors([wordTimedLine(), lineSyncedLine()], new Set(), 1.5);
    const times = anchors.map((a) => a.t);
    const sorted = times.toSorted((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("contributes nothing for a line with neither words nor begin/end", () => {
    const empty: LyricLine = { id: "lx", text: "no timing", agentId: "v1" };
    const anchors = collectSnapAnchors([empty], new Set(), null);
    expect(anchors).toEqual([]);
  });
});

// -- findSnapShift -------------------------------------------------------------

describe("findSnapShift", () => {
  it("returns no shift when anchors is empty", () => {
    const result = findSnapShift({ edges: [1.0], anchors: [], zoom: 100, threshold: 8 });
    expect(result).toEqual({ shift: 0, anchor: null });
  });

  it("returns no shift when the nearest anchor is beyond threshold", () => {
    const anchors: SnapAnchor[] = [{ t: 0.0, kind: "word-begin", label: "w" }];
    const result = findSnapShift({ edges: [1.0], anchors, zoom: 100, threshold: 8 });
    expect(result).toEqual({ shift: 0, anchor: null });
  });

  it("snaps to the nearest in-range anchor and returns shift + anchor reference", () => {
    const anchor: SnapAnchor = { t: 1.05, kind: "word-begin", label: "love" };
    const result = findSnapShift({ edges: [1.0], anchors: [anchor], zoom: 100, threshold: 8 });
    expect(result.anchor).toBe(anchor);
    expect(result.shift).toBeCloseTo(0.05, 6);
  });

  it("picks the nearest among multiple in-range anchors", () => {
    const near: SnapAnchor = { t: 1.02, kind: "word-end", label: "near" };
    const far: SnapAnchor = { t: 1.06, kind: "word-begin", label: "far" };
    const result = findSnapShift({ edges: [1.0], anchors: [far, near], zoom: 100, threshold: 8 });
    expect(result.anchor).toBe(near);
    expect(result.shift).toBeCloseTo(0.02, 6);
  });

  it("prefers playhead on a tie at equal pixel distance", () => {
    const word: SnapAnchor = { t: 1.05, kind: "word-begin", label: "word" };
    const playhead: SnapAnchor = { t: 1.05, kind: "playhead", label: "playhead" };
    const result = findSnapShift({ edges: [1.0], anchors: [word, playhead], zoom: 100, threshold: 8 });
    expect(result.anchor).toBe(playhead);
  });

  it("considers all candidate edges and picks the smallest pixel shift across them", () => {
    const a1: SnapAnchor = { t: 0.95, kind: "word-end", label: "left" };
    const a2: SnapAnchor = { t: 2.01, kind: "word-begin", label: "right" };
    const result = findSnapShift({ edges: [1.0, 2.0], anchors: [a1, a2], zoom: 100, threshold: 8 });
    expect(result.anchor).toBe(a2);
    expect(result.shift).toBeCloseTo(0.01, 6);
  });

  it("skips an anchor whose overlapCheck rejects the shift and falls back to the next-best", () => {
    const bad: SnapAnchor = { t: 1.02, kind: "word-begin", label: "bad" };
    const good: SnapAnchor = { t: 1.06, kind: "word-begin", label: "good" };
    const result = findSnapShift({
      edges: [1.0],
      anchors: [bad, good],
      zoom: 100,
      threshold: 8,
      overlapCheck: (shift) => Math.abs(shift - 0.06) < 1e-6,
    });
    expect(result.anchor).toBe(good);
    expect(result.shift).toBeCloseTo(0.06, 6);
  });

  it("returns no shift when every in-range anchor is blocked by overlapCheck", () => {
    const a1: SnapAnchor = { t: 1.02, kind: "word-begin", label: "a" };
    const a2: SnapAnchor = { t: 1.06, kind: "word-begin", label: "b" };
    const result = findSnapShift({
      edges: [1.0],
      anchors: [a1, a2],
      zoom: 100,
      threshold: 8,
      overlapCheck: () => false,
    });
    expect(result).toEqual({ shift: 0, anchor: null });
  });

  it("skips an anchor whose invertCheck rejects the shift and falls back to the next-best", () => {
    const bad: SnapAnchor = { t: 1.02, kind: "word-begin", label: "bad" };
    const good: SnapAnchor = { t: 1.06, kind: "word-begin", label: "good" };
    const result = findSnapShift({
      edges: [1.0],
      anchors: [bad, good],
      zoom: 100,
      threshold: 8,
      invertCheck: (shift) => Math.abs(shift - 0.06) < 1e-6,
    });
    expect(result.anchor).toBe(good);
    expect(result.shift).toBeCloseTo(0.06, 6);
  });
});
