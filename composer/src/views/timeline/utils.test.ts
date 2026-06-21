/**
 * @vitest-environment node
 */
import { reconcileLine, type LooseLine, type LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { describe, expect, it } from "vitest";
import { instanceBounds } from "@/domain/instance/bounds";
import { effectiveBounds } from "@/domain/line/bounds";
import {
  distributeLinesTiming,
  distributeWordsInLine,
  formatTime,
  getEffectiveRows,
  nudgeSelectedWords,
  type GroupHeaderRow,
  getWordsInInstance,
  partitionNudgeSelections,
  shiftLineSyncedRows,
  shiftSelectionsTogether,
} from "./utils";

// -- distributeWordsInLine -----------------------------------------------------

describe("distributeWordsInLine", () => {
  it("distributes words proportionally by character length", () => {
    // "Hello" = 5 chars, "World" = 5 chars, total = 10 chars
    // Duration = 10 seconds, so each word gets 5 seconds
    const words = distributeWordsInLine("Hello World", 0, 10);

    expect(words).toHaveLength(2);
    expect(words[0]).toEqual({ text: "Hello ", begin: 0, end: 5 });
    expect(words[1]).toEqual({ text: "World", begin: 5, end: 10 });
  });

  it("handles single word", () => {
    const words = distributeWordsInLine("Hello", 0, 5);
    expect(words).toEqual([{ text: "Hello", begin: 0, end: 5 }]);
  });

  it("handles empty string", () => {
    const words = distributeWordsInLine("", 0, 5);
    expect(words).toEqual([]);
  });

  it("handles whitespace-only string", () => {
    const words = distributeWordsInLine("   ", 0, 5);
    expect(words).toEqual([]);
  });

  it("handles multiple spaces between words", () => {
    const words = distributeWordsInLine("Hello    World", 0, 10);
    expect(words).toHaveLength(2);
    expect(words[0].text).toBe("Hello ");
    expect(words[1].text).toBe("World");
  });

  it("handles non-zero begin time", () => {
    const words = distributeWordsInLine("Hi", 5, 7);
    expect(words).toEqual([{ text: "Hi", begin: 5, end: 7 }]);
  });
});

// -- distributeLinesTiming -----------------------------------------------------

describe("distributeLinesTiming", () => {
  it("distributes lines evenly across duration as word-synced lines", () => {
    const lines = [
      { id: "1", text: "Line one", agentId: "v1" },
      { id: "2", text: "Line two", agentId: "v1" },
    ];
    const duration = 10;

    const result = distributeLinesTiming(lines, duration);

    expect(result[0].words[0].begin).toBe(0);
    expect(result[0].words[result[0].words.length - 1].end).toBe(5);
    expect(result[1].words[0].begin).toBe(5);
    expect(result[1].words[result[1].words.length - 1].end).toBe(10);
    // Distributed lines are word-synced: no line-level begin/end (both-state).
    expect("begin" in result[0]).toBe(false);
    expect("end" in result[0]).toBe(false);
  });

  it("includes distributed words for each line", () => {
    const lines = [{ id: "1", text: "Hello World", agentId: "v1" }];
    const duration = 11;

    const result = distributeLinesTiming(lines, duration);

    expect(result[0].words).toHaveLength(2);
    expect(result[0].words[0].text).toBe("Hello ");
    expect(result[0].words[1].text).toBe("World");
  });

  it("handles empty array", () => {
    const result = distributeLinesTiming([], 10);
    expect(result).toEqual([]);
  });

  it("preserves original line properties", () => {
    const lines = [{ id: "abc", text: "Test", agentId: "v2", extra: "data" }];
    const result = distributeLinesTiming(lines, 5);

    expect(result[0].id).toBe("abc");
    expect(result[0].agentId).toBe("v2");
    expect((result[0] as { extra: string }).extra).toBe("data");
  });
});

// -- effectiveBounds (originally tested via getLineTiming) --------------------

describe("effectiveBounds (legacy call site coverage)", () => {
  it("returns timing from words when available", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [
        { text: "Hello", begin: 2, end: 5 },
        { text: "World", begin: 5, end: 8 },
      ],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 2, end: 8 });
  });

  it("returns direct timing when no words", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      begin: 3,
      end: 7,
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 3, end: 7 });
  });

  it("returns null when no timing available", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      begin: undefined,
      end: undefined,
    };

    const timing = effectiveBounds(line);

    expect(timing).toBeNull();
  });

  it("prefers words timing over direct timing", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [{ text: "Hello", begin: 2, end: 5 }],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 2, end: 5 });
  });

  it("returns null for a word-synced line with an empty words array", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [] as WordTiming[],
    };

    const timing = effectiveBounds(line);

    expect(timing).toBeNull();
  });

  it("extends end past main words when bg words end later", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [
        { text: "Hello", begin: 2, end: 5 },
        { text: "World", begin: 5, end: 8 },
      ],
      backgroundText: "echo",
      backgroundWords: [
        { text: "ech", begin: 6, end: 9 },
        { text: "o", begin: 9, end: 12 },
      ],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 2, end: 12 });
  });

  it("pulls begin earlier when bg words begin before main words", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [{ text: "Hello", begin: 5, end: 8 }],
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 3, end: 6 }],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 3, end: 8 });
  });

  it("extends line-synced end when bg words extend past it", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      begin: 3,
      end: 7,
      backgroundText: "ahh",
      backgroundWords: [{ text: "ahh", begin: 6, end: 10 }],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 3, end: 10 });
  });

  it("leaves timing unchanged when bg words sit fully inside main range", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [{ text: "Hello", begin: 2, end: 10 }],
      backgroundText: "yeah",
      backgroundWords: [{ text: "yeah", begin: 4, end: 7 }],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 2, end: 10 });
  });

  it("ignores empty bg words array", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      words: [{ text: "Hello", begin: 2, end: 5 }],
      backgroundWords: [],
    };

    const timing = effectiveBounds(line);

    expect(timing).toEqual({ begin: 2, end: 5 });
  });

  it("returns null when bg words exist but no main timing is set", () => {
    const line = {
      id: "1",
      text: "Hello",
      agentId: "v1",
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 3, end: 6 }],
    };

    const timing = effectiveBounds(line);

    expect(timing).toBeNull();
  });
});

// -- formatTime ----------------------------------------------------------------

describe("formatTime", () => {
  it("formats zero", () => {
    expect(formatTime(0)).toBe("0:00.00");
  });

  it("formats seconds with centiseconds", () => {
    expect(formatTime(5.25)).toBe("0:05.25");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(65.5)).toBe("1:05.50");
  });

  it("formats multiple minutes", () => {
    expect(formatTime(126)).toBe("2:06.00");
  });

  it("pads seconds correctly", () => {
    expect(formatTime(61)).toBe("1:01.00");
  });

  it("rounds centiseconds down", () => {
    expect(formatTime(1.999)).toBe("0:01.99");
  });
});

// -- getEffectiveRows ---------------------------------------------------------

describe("getEffectiveRows", () => {
  function l(id: string, extras: Partial<LooseLine> = {}): LyricLine {
    return reconcileLine({ id, text: "x", agentId: "v1", ...extras });
  }

  it("interleaves a header before each instance run", () => {
    const lines: LyricLine[] = [
      l("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0, words: [{ text: "I", begin: 0, end: 1 }] }),
      l("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1, words: [{ text: "you", begin: 1, end: 2 }] }),
      l("c"),
      l("d", { groupId: "g1", instanceIdx: 1, templateLineIdx: 0, words: [{ text: "I", begin: 30, end: 31 }] }),
      l("e", { groupId: "g1", instanceIdx: 1, templateLineIdx: 1, words: [{ text: "you", begin: 31, end: 32 }] }),
    ];

    const rows = getEffectiveRows(lines);
    expect(rows.map((r) => r.kind)).toEqual(["group-header", "line", "line", "line", "group-header", "line", "line"]);

    const h0 = rows[0] as GroupHeaderRow;
    expect(h0.groupId).toBe("g1");
    expect(h0.instanceIdx).toBe(0);
    expect(h0.lineCount).toBe(2);
    expect(h0.instanceStart).toBe(0);
    expect(h0.instanceEnd).toBe(2);

    const h1 = rows[4] as GroupHeaderRow;
    expect(h1.instanceIdx).toBe(1);
    expect(h1.instanceStart).toBe(30);
    expect(h1.instanceEnd).toBe(32);
  });

  it("returns standalone-only rows for projects with no groups", () => {
    const lines: LyricLine[] = [l("a"), l("b"), l("c")];
    const rows = getEffectiveRows(lines);
    expect(rows.every((r) => r.kind === "line")).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it("preserves lineIndex pointers into the original lines array", () => {
    const lines: LyricLine[] = [
      l("a"),
      l("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
      l("c", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
      l("d"),
    ];
    const rows = getEffectiveRows(lines);
    const lineRows = rows.filter((r) => r.kind === "line");
    expect(lineRows.map((r) => (r.kind === "line" ? r.lineIndex : -1))).toEqual([0, 1, 2, 3]);
  });

  it("does NOT emit a header for an instance with no timed content (no words, bg words, begin, or end)", () => {
    const lines: LyricLine[] = [
      l("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
      l("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
    ];
    const rows = getEffectiveRows(lines);
    // Both lines still appear; the header is suppressed
    expect(rows.map((r) => r.kind)).toEqual(["line", "line"]);
  });

  it("emits a header for a line-synced instance (begin/end set, no words), that's real timing", () => {
    const lines: LyricLine[] = [l("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0, begin: 5, end: 7 })];
    const rows = getEffectiveRows(lines);
    expect(rows[0].kind).toBe("group-header");
    const header = rows[0] as GroupHeaderRow;
    expect(header.instanceStart).toBe(5);
    expect(header.instanceEnd).toBe(7);
  });

  it("emits a header for an instance whose only timed content is bg words", () => {
    const lines: LyricLine[] = [
      l("a", {
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        backgroundWords: [{ text: "ah", begin: 4, end: 5 }],
      }),
    ];
    const rows = getEffectiveRows(lines);
    expect(rows[0].kind).toBe("group-header");
    const header = rows[0] as GroupHeaderRow;
    expect(header.instanceStart).toBe(4);
    expect(header.instanceEnd).toBe(5);
  });

  it("suppresses header on an empty instance but emits header on a sibling timed instance", () => {
    const lines: LyricLine[] = [
      // Empty instance 0
      l("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
      l("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
      // Timed instance 1
      l("c", { groupId: "g1", instanceIdx: 1, templateLineIdx: 0, words: [{ text: "x", begin: 30, end: 31 }] }),
    ];
    const rows = getEffectiveRows(lines);
    expect(rows.map((r) => r.kind)).toEqual(["line", "line", "group-header", "line"]);
  });

  it("suppresses header for partially-empty instance only when ALL of its lines have no timing", () => {
    // Instance has line A timed and line B empty: header still appears (instance is partially alive)
    const lines: LyricLine[] = [
      l("a", { groupId: "g1", instanceIdx: 0, templateLineIdx: 0, words: [{ text: "x", begin: 5, end: 6 }] }),
      l("b", { groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
    ];
    const rows = getEffectiveRows(lines);
    expect(rows.map((r) => r.kind)).toEqual(["group-header", "line", "line"]);
    expect((rows[0] as GroupHeaderRow).instanceStart).toBe(5);
    expect((rows[0] as GroupHeaderRow).instanceEnd).toBe(6);
  });
});

describe("instanceBounds (legacy call site coverage)", () => {
  it("uses min/max across word and bg word timings", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "x",
        agentId: "v1",
        words: [
          { text: "hello ", begin: 5, end: 6 },
          { text: "world", begin: 6, end: 7 },
        ],
        backgroundWords: [{ text: "yeah", begin: 4, end: 4.5 }],
      },
    ];
    expect(instanceBounds(lines)).toEqual({ begin: 4, end: 7 });
  });

  it("ignores stale line.begin/end when words are present", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "x",
        agentId: "v1",
        words: [
          { text: "hello", begin: 5, end: 6 },
          { text: "world", begin: 6, end: 7 },
        ],
      },
    ];
    expect(instanceBounds(lines)).toEqual({ begin: 5, end: 7 });
  });

  it("ignores stale line.begin/end when only bg words are present", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "x",
        agentId: "v1",
        begin: 10,
        end: 20,
        backgroundWords: [{ text: "ah", begin: 5, end: 6 }],
      },
    ];
    expect(instanceBounds(lines)).toEqual({ begin: 5, end: 6 });
  });

  it("falls back to line.begin/end ONLY when the line is truly line-synced (no words and no bg words)", () => {
    const lines: LyricLine[] = [{ id: "a", text: "x", agentId: "v1", begin: 5, end: 7 }];
    expect(instanceBounds(lines)).toEqual({ begin: 5, end: 7 });
  });

  it("mixes correctly across multiple lines: word-synced lines use words, line-synced uses begin/end", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "x",
        agentId: "v1",
        words: [{ text: "hello", begin: 5, end: 6 }],
      },
      { id: "b", text: "y", agentId: "v1", begin: 10, end: 12 },
    ];
    expect(instanceBounds(lines)).toEqual({ begin: 5, end: 12 });
  });
});

describe("getWordsInInstance", () => {
  it("collects all words and bg words across all lines of an instance", () => {
    const lines: LyricLine[] = [
      {
        id: "a",
        text: "x",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 0, end: 1 },
          { text: "love", begin: 1, end: 2 },
        ],
        backgroundWords: [{ text: "yeah", begin: 0.5, end: 1.5 }],
      },
      {
        id: "b",
        text: "x",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 1,
        words: [{ text: "you", begin: 2, end: 3 }],
      },
      // Other instance
      {
        id: "c",
        text: "x",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "I", begin: 30, end: 31 }],
      },
    ];

    const sels = getWordsInInstance(lines, "g1", 0);
    expect(sels).toHaveLength(4);
    expect(sels.filter((s) => s.type === "word")).toHaveLength(3);
    expect(sels.filter((s) => s.type === "bg")).toHaveLength(1);
    expect(sels.every((s) => s.lineId === "a" || s.lineId === "b")).toBe(true);
  });

  it("returns empty for unmatched groupId or instanceIdx", () => {
    expect(getWordsInInstance([], "g1", 0)).toEqual([]);
  });
});

// -- nudgeSelectedWords --------------------------------------------------------

function makeLine(id: string, words: { text: string; begin: number; end: number }[]): LyricLine {
  return { id, text: words.map((w) => w.text).join(""), agentId: "v1", words };
}

describe("nudgeSelectedWords", () => {
  it("shifts a single word right preserving duration", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b ", begin: 1, end: 2 },
        { text: "c", begin: 5, end: 6 },
      ]),
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 1 }], 0.05, 10);
    expect(result.appliedDelta).toBeCloseTo(0.05);
    expect(result.updates).toHaveLength(1);
    const updatedWords = result.updates[0].updates.words!;
    expect(updatedWords[1].begin).toBeCloseTo(1.05);
    expect(updatedWords[1].end).toBeCloseTo(2.05);
    expect(updatedWords[0]).toEqual(lines[0].words![0]);
    expect(updatedWords[2]).toEqual(lines[0].words![2]);
  });

  it("shifts a single word left preserving duration", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b", begin: 3, end: 4 },
      ]),
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 1 }], -0.05, 10);
    expect(result.appliedDelta).toBeCloseTo(-0.05);
    expect(result.updates[0].updates.words![1].begin).toBeCloseTo(2.95);
    expect(result.updates[0].updates.words![1].end).toBeCloseTo(3.95);
  });

  it("clamps to neighbor end when partial room left", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b", begin: 1.02, end: 2 },
      ]),
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 1 }], -0.05, 10);
    expect(result.appliedDelta).toBeCloseTo(-0.02);
    expect(result.updates[0].updates.words![1].begin).toBeCloseTo(1);
    expect(result.updates[0].updates.words![1].end).toBeCloseTo(1.98);
  });

  it("is a no-op when already touching previous word", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
      ]),
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 1 }], -0.05, 10);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("is a no-op when already touching next word", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b", begin: 1, end: 2 },
      ]),
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 0 }], 0.05, 10);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("clamps to 0 for the first word", () => {
    const lines = [makeLine("L", [{ text: "a", begin: 0.02, end: 1 }])];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 0 }], -0.05, 10);
    expect(result.appliedDelta).toBeCloseTo(-0.02);
    expect(result.updates[0].updates.words![0].begin).toBeCloseTo(0);
    expect(result.updates[0].updates.words![0].end).toBeCloseTo(0.98);
  });

  it("clamps to duration for the last word", () => {
    const lines = [makeLine("L", [{ text: "a", begin: 8, end: 9.98 }])];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 0 }], 0.05, 10);
    expect(result.appliedDelta).toBeCloseTo(0.02);
    expect(result.updates[0].updates.words![0].end).toBeCloseTo(10);
  });

  it("shifts consecutive selected words as a block", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b ", begin: 1, end: 2 },
        { text: "c ", begin: 2, end: 3 },
        { text: "d", begin: 5, end: 6 },
      ]),
    ];
    const result = nudgeSelectedWords(
      lines,
      [
        { lineId: "L", type: "word", wordIndex: 1 },
        { lineId: "L", type: "word", wordIndex: 2 },
      ],
      0.05,
      10,
    );
    expect(result.appliedDelta).toBeCloseTo(0.05);
    const updated = result.updates[0].updates.words!;
    expect(updated[0]).toEqual(lines[0].words![0]);
    expect(updated[1].begin).toBeCloseTo(1.05);
    expect(updated[1].end).toBeCloseTo(2.05);
    expect(updated[2].begin).toBeCloseTo(2.05);
    expect(updated[2].end).toBeCloseTo(3.05);
    expect(updated[3]).toEqual(lines[0].words![3]);
  });

  it("clamps a block to the most-restrictive non-selected neighbor", () => {
    const lines = [
      makeLine("L", [
        { text: "a ", begin: 0, end: 1 },
        { text: "b ", begin: 1, end: 2 },
        { text: "c ", begin: 2, end: 3 },
        { text: "d", begin: 3.02, end: 4 },
      ]),
    ];
    const result = nudgeSelectedWords(
      lines,
      [
        { lineId: "L", type: "word", wordIndex: 1 },
        { lineId: "L", type: "word", wordIndex: 2 },
      ],
      0.05,
      10,
    );
    expect(result.appliedDelta).toBeCloseTo(0.02);
    const updated = result.updates[0].updates.words!;
    expect(updated[2].end).toBeCloseTo(3.02);
  });

  it("nudges background words via backgroundWords", () => {
    const lines: LyricLine[] = [
      {
        id: "L",
        text: "a",
        agentId: "v1",
        words: [{ text: "a", begin: 0, end: 1 }],
        backgroundText: "ooh",
        backgroundWords: [
          { text: "ooh", begin: 2, end: 3 },
          { text: "ah", begin: 5, end: 6 },
        ],
      },
    ];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "bg", wordIndex: 0 }], 0.1, 10);
    expect(result.appliedDelta).toBeCloseTo(0.1);
    expect(result.updates[0].updates.backgroundWords![0].begin).toBeCloseTo(2.1);
    expect(result.updates[0].updates.backgroundWords![0].end).toBeCloseTo(3.1);
    expect(result.updates[0].updates.words).toBeUndefined();
  });

  it("applies the same clamped delta across multiple lines", () => {
    const lines = [
      makeLine("L1", [{ text: "a", begin: 0, end: 1 }]),
      makeLine("L2", [{ text: "b", begin: 5, end: 5.04 }]),
    ];
    const result = nudgeSelectedWords(
      lines,
      [
        { lineId: "L1", type: "word", wordIndex: 0 },
        { lineId: "L2", type: "word", wordIndex: 0 },
      ],
      0.05,
      5.05,
    );
    expect(result.appliedDelta).toBeCloseTo(0.01);
    expect(result.updates).toHaveLength(2);
  });

  it("returns no-op for empty selection", () => {
    const lines = [makeLine("L", [{ text: "a", begin: 0, end: 1 }])];
    const result = nudgeSelectedWords(lines, [], 0.05, 10);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("returns no-op for zero delta", () => {
    const lines = [makeLine("L", [{ text: "a", begin: 0, end: 1 }])];
    const result = nudgeSelectedWords(lines, [{ lineId: "L", type: "word", wordIndex: 0 }], 0, 10);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });
});

// -- nudgeSelectedWords as instance shift -------------------------------------

describe("nudgeSelectedWords as instance shift", () => {
  it("shifts every word in an instance by the same delta when all words are selected", () => {
    const lines: LyricLine[] = [
      {
        id: "A",
        text: "I love",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 10, end: 10.3 },
          { text: "love", begin: 10.3, end: 10.8 },
        ],
      },
      {
        id: "B",
        text: "all night",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 1,
        words: [
          { text: "all ", begin: 11, end: 11.4 },
          { text: "night", begin: 11.4, end: 12 },
        ],
      },
      // Standalone line OUTSIDE the instance, must NOT be touched
      { id: "C", text: "outside", agentId: "v1", words: [{ text: "outside", begin: 30, end: 31 }] },
    ];
    const allInstanceSelections = [
      { lineId: "A", type: "word" as const, wordIndex: 0 },
      { lineId: "A", type: "word" as const, wordIndex: 1 },
      { lineId: "B", type: "word" as const, wordIndex: 0 },
      { lineId: "B", type: "word" as const, wordIndex: 1 },
    ];
    const result = nudgeSelectedWords(lines, allInstanceSelections, 0.5, 60);
    expect(result.appliedDelta).toBe(0.5);
    const aWords = (result.updates.find((u) => u.id === "A")?.updates.words ?? []) as { begin: number; end: number }[];
    const bWords = (result.updates.find((u) => u.id === "B")?.updates.words ?? []) as { begin: number; end: number }[];
    expect(aWords[0].begin).toBeCloseTo(10.5);
    expect(aWords[1].end).toBeCloseTo(11.3);
    expect(bWords[0].begin).toBeCloseTo(11.5);
    expect(bWords[1].end).toBeCloseTo(12.5);
    expect(result.updates.find((u) => u.id === "C")).toBeUndefined();
  });

  it("clamps shift to song duration when selection touches the end", () => {
    const lines: LyricLine[] = [{ id: "A", text: "x", agentId: "v1", words: [{ text: "x", begin: 59.7, end: 60 }] }];
    const result = nudgeSelectedWords(lines, [{ lineId: "A", type: "word", wordIndex: 0 }], 0.5, 60);
    expect(result.appliedDelta).toBe(0);
  });
});

// -- partitionNudgeSelections -------------------------------------------------

describe("partitionNudgeSelections", () => {
  it("classifies word-synced lines as wordSynced", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "hello", agentId: "v1", words: [{ text: "hello", begin: 0, end: 1 }] },
    ];
    const sels = [{ lineId: "L1", type: "word" as const, wordIndex: 0 }];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.wordSynced).toEqual(sels);
    expect(result.lineSynced).toEqual([]);
  });

  it("classifies line-synced lines as lineSynced", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "verse", agentId: "v1", begin: 5, end: 7 }];
    const sels = [{ lineId: "L1", type: "word" as const, wordIndex: 0 }];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.lineSynced).toEqual(sels);
    expect(result.wordSynced).toEqual([]);
  });

  it("dedupes line-synced selections so the same line shifts only once", () => {
    // Effective lines synthesize a single 'word' for line-synced rows. If a user marquee-selected
    // a line-synced row from a viewport that briefly produced multiple synthetic indices,
    // we should still only shift the line once.
    const lines: LyricLine[] = [{ id: "L1", text: "verse", agentId: "v1", begin: 5, end: 7 }];
    const sels = [
      { lineId: "L1", type: "word" as const, wordIndex: 0 },
      { lineId: "L1", type: "word" as const, wordIndex: 0 },
    ];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.lineSynced).toHaveLength(1);
  });

  it("treats backgroundWords selections as wordSynced regardless of line-sync state", () => {
    // BG words always have explicit timing even on otherwise line-synced rows
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "main",
        agentId: "v1",
        begin: 5,
        end: 7,
        backgroundWords: [{ text: "ah", begin: 5.2, end: 5.6 }],
      },
    ];
    const sels = [{ lineId: "L1", type: "bg" as const, wordIndex: 0 }];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.wordSynced).toEqual(sels);
    expect(result.lineSynced).toEqual([]);
  });

  it("handles mixed selections across line-synced and word-synced rows", () => {
    const lines: LyricLine[] = [
      { id: "A", text: "synced", agentId: "v1", begin: 0, end: 1 },
      { id: "B", text: "with words", agentId: "v1", words: [{ text: "with words", begin: 1, end: 2 }] },
    ];
    const sels = [
      { lineId: "A", type: "word" as const, wordIndex: 0 },
      { lineId: "B", type: "word" as const, wordIndex: 0 },
    ];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.lineSynced.map((s) => s.lineId)).toEqual(["A"]);
    expect(result.wordSynced.map((s) => s.lineId)).toEqual(["B"]);
  });

  it("drops selections referencing missing lines", () => {
    const result = partitionNudgeSelections([], [{ lineId: "ghost", type: "word", wordIndex: 0 }]);
    expect(result.wordSynced).toEqual([]);
    expect(result.lineSynced).toEqual([]);
  });

  it("treats lines with no words and no begin/end as neither (skipped)", () => {
    const lines: LyricLine[] = [{ id: "empty", text: "", agentId: "v1" }];
    const result = partitionNudgeSelections(lines, [{ lineId: "empty", type: "word", wordIndex: 0 }]);
    expect(result.wordSynced).toEqual([]);
    expect(result.lineSynced).toEqual([]);
  });

  it("expands a syllable-group selection to all groupmates in the wordSynced bucket", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "every",
        agentId: "v1",
        words: [
          { text: "ev", begin: 0, end: 0.3, syllableGroupId: "g_every" },
          { text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g_every" },
          { text: "y", begin: 0.6, end: 1, syllableGroupId: "g_every" },
        ],
      },
    ];
    const sels = [{ lineId: "L1", type: "word" as const, wordIndex: 1 }];
    const result = partitionNudgeSelections(lines, sels);
    expect(result.wordSynced.map((s) => s.wordIndex)).toEqual([0, 1, 2]);
  });
});

// -- shiftLineSyncedRows ------------------------------------------------------

describe("shiftLineSyncedRows", () => {
  it("shifts begin and end by the requested delta and preserves line-sync (no words written)", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "verse", agentId: "v1", begin: 5, end: 7 }];
    const result = shiftLineSyncedRows(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }], 0.5, 60);
    expect(result.appliedDelta).toBe(0.5);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].id).toBe("L1");
    expect(result.updates[0].updates).toEqual({ begin: 5.5, end: 7.5 });
    // Critical: no `words` key in the update payload
    expect("words" in result.updates[0].updates).toBe(false);
  });

  it("shifts multiple line-synced rows together by the smallest allowed delta", () => {
    const lines: LyricLine[] = [
      { id: "A", text: "a", agentId: "v1", begin: 0.1, end: 1 },
      { id: "B", text: "b", agentId: "v1", begin: 5, end: 6 },
    ];
    // Request -0.5s shift; A only has 0.1s headroom on the left, so applied delta is -0.1
    const result = shiftLineSyncedRows(
      lines,
      [
        { lineId: "A", type: "word", wordIndex: 0 },
        { lineId: "B", type: "word", wordIndex: 0 },
      ],
      -0.5,
      60,
    );
    expect(result.appliedDelta).toBeCloseTo(-0.1);
    expect((result.updates.find((u) => u.id === "A")?.updates as { begin: number }).begin).toBeCloseTo(0);
    expect((result.updates.find((u) => u.id === "B")?.updates as { begin: number }).begin).toBeCloseTo(4.9);
  });

  it("returns no-op when shift would push past 0 or duration", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "x", agentId: "v1", begin: 0, end: 1 }];
    const r1 = shiftLineSyncedRows(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }], -0.5, 60);
    expect(r1.appliedDelta).toBe(0);
    const lines2: LyricLine[] = [{ id: "L1", text: "x", agentId: "v1", begin: 59, end: 60 }];
    const r2 = shiftLineSyncedRows(lines2, [{ lineId: "L1", type: "word", wordIndex: 0 }], 0.5, 60);
    expect(r2.appliedDelta).toBe(0);
  });

  it("returns no-op for zero delta", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "x", agentId: "v1", begin: 5, end: 6 }];
    const result = shiftLineSyncedRows(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }], 0, 60);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("returns no-op for empty selection", () => {
    const result = shiftLineSyncedRows([], [], 0.5, 60);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("skips selections where line is missing or has no begin/end", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "x", agentId: "v1" }];
    const result = shiftLineSyncedRows(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }], 0.5, 60);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });
});

// -- shiftSelectionsTogether (unified clamp) ----------------------------------

describe("shiftSelectionsTogether", () => {
  it("uses a single clamp across word-synced and line-synced partitions so a mixed instance moves uniformly", () => {
    // The bug this prevents: nudgeSelectedWords clamps based on word-synced
    // headroom, shiftLineSyncedRows clamps based on line-synced headroom.
    // If they apply different deltas, the group banner stretches asymmetrically.
    const lines: LyricLine[] = [
      // Word-synced row whose first word starts at 0.05 → max left shift = 0.05
      { id: "A", text: "x", agentId: "v1", words: [{ text: "x", begin: 0.05, end: 1 }] },
      // Line-synced row with much more left headroom (begin=10)
      { id: "B", text: "y", agentId: "v1", begin: 10, end: 11 },
    ];
    const partitioned = partitionNudgeSelections(lines, [
      { lineId: "A", type: "word", wordIndex: 0 },
      { lineId: "B", type: "word", wordIndex: 0 },
    ]);
    const result = shiftSelectionsTogether(lines, partitioned, -0.5, 60);
    // Without the unified clamp: A shifts by -0.05, B shifts by -0.5 → asymmetric.
    // With unified clamp: both shift by -0.05.
    expect(result.appliedDelta).toBeCloseTo(-0.05);
    const aUpdate = result.updates.find((u) => u.id === "A");
    const bUpdate = result.updates.find((u) => u.id === "B");
    expect((aUpdate?.updates.words as { begin: number }[])?.[0].begin).toBeCloseTo(0);
    expect((bUpdate?.updates as { begin: number }).begin).toBeCloseTo(9.95);
  });

  it("works when only the line-synced partition has selections", () => {
    const lines: LyricLine[] = [{ id: "A", text: "x", agentId: "v1", begin: 5, end: 6 }];
    const partitioned = partitionNudgeSelections(lines, [{ lineId: "A", type: "word", wordIndex: 0 }]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.1, 60);
    expect(result.appliedDelta).toBeCloseTo(0.1);
    expect((result.updates[0].updates as { begin: number }).begin).toBeCloseTo(5.1);
  });

  it("works when only the word-synced partition has selections", () => {
    const lines: LyricLine[] = [{ id: "A", text: "x", agentId: "v1", words: [{ text: "x", begin: 5, end: 6 }] }];
    const partitioned = partitionNudgeSelections(lines, [{ lineId: "A", type: "word", wordIndex: 0 }]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.1, 60);
    expect(result.appliedDelta).toBeCloseTo(0.1);
    expect((result.updates[0].updates.words as { begin: number }[])[0].begin).toBeCloseTo(5.1);
  });

  it("returns empty when both partitions are empty", () => {
    const result = shiftSelectionsTogether([], { wordSynced: [], lineSynced: [] }, 0.5, 60);
    expect(result.appliedDelta).toBe(0);
    expect(result.updates).toEqual([]);
  });

  it("clamps to the smaller of word-synced and line-synced headroom (line-synced wins)", () => {
    const lines: LyricLine[] = [
      // Word-synced row with tons of headroom on both sides
      { id: "A", text: "x", agentId: "v1", words: [{ text: "x", begin: 30, end: 31 }] },
      // Line-synced row with only 0.01s headroom on the right (close to duration=60)
      { id: "B", text: "y", agentId: "v1", begin: 58.99, end: 59.99 },
    ];
    const partitioned = partitionNudgeSelections(lines, [
      { lineId: "A", type: "word", wordIndex: 0 },
      { lineId: "B", type: "word", wordIndex: 0 },
    ]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.5, 60);
    expect(result.appliedDelta).toBeCloseTo(0.01);
  });

  it("preserves direction when clamping (negative requestedDelta yields negative applied)", () => {
    const lines: LyricLine[] = [{ id: "A", text: "x", agentId: "v1", words: [{ text: "x", begin: 0.05, end: 1 }] }];
    const partitioned = partitionNudgeSelections(lines, [{ lineId: "A", type: "word", wordIndex: 0 }]);
    const result = shiftSelectionsTogether(lines, partitioned, -0.5, 60);
    expect(result.appliedDelta).toBeLessThan(0);
    expect(result.appliedDelta).toBeCloseTo(-0.05);
  });

  it("yields a fully symmetric instance shift across all selected rows in a multi-line instance", () => {
    // The user-reported bug: instance with all members selected, nudge left,
    // header right edge stays affixed while left edge moves. Unified clamp prevents.
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "I love",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 10, end: 10.3 },
          { text: "love", begin: 10.3, end: 10.8 },
        ],
      },
      {
        id: "L2",
        text: "all night",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 1,
        words: [
          { text: "all ", begin: 11, end: 11.4 },
          { text: "night", begin: 11.4, end: 12 },
        ],
      },
    ];
    const partitioned = partitionNudgeSelections(lines, [
      { lineId: "L1", type: "word", wordIndex: 0 },
      { lineId: "L1", type: "word", wordIndex: 1 },
      { lineId: "L2", type: "word", wordIndex: 0 },
      { lineId: "L2", type: "word", wordIndex: 1 },
    ]);
    const result = shiftSelectionsTogether(lines, partitioned, -0.5, 60);
    expect(result.appliedDelta).toBeCloseTo(-0.5);
    const l1Words = (result.updates.find((u) => u.id === "L1")?.updates.words ?? []) as {
      begin: number;
      end: number;
    }[];
    const l2Words = (result.updates.find((u) => u.id === "L2")?.updates.words ?? []) as {
      begin: number;
      end: number;
    }[];
    // Min begin shifts by exactly -0.5 (10 → 9.5)
    expect(l1Words[0].begin).toBeCloseTo(9.5);
    // Max end shifts by exactly -0.5 (12 → 11.5)
    expect(l2Words[1].end).toBeCloseTo(11.5);
    // Width preserved exactly
    expect(l2Words[1].end - l1Words[0].begin).toBeCloseTo(2);
  });
});

describe("shiftSelectionsTogether · background provenance", () => {
  it("stamps backgroundTextSource manual when nudging background words", () => {
    const lines: LyricLine[] = [
      {
        id: "A",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "ooh",
        backgroundWords: [{ text: "ooh", begin: 2, end: 3 }],
        backgroundTextSource: "extraction",
      },
    ];
    const partitioned = partitionNudgeSelections(lines, [{ lineId: "A", type: "bg", wordIndex: 0 }]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.1, 60);
    const update = result.updates.find((u) => u.id === "A");
    expect((update?.updates.backgroundWords as { begin: number }[])?.[0].begin).toBeCloseTo(2.1);
    expect(update?.updates.backgroundTextSource).toBe("manual");
  });

  it("leaves the nudged background word data unchanged apart from timing", () => {
    const lines: LyricLine[] = [
      {
        id: "A",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "ooh aah",
        backgroundWords: [
          { text: "ooh ", begin: 2, end: 2.5 },
          { text: "aah", begin: 2.5, end: 3 },
        ],
        backgroundTextSource: "extraction",
      },
    ];
    const partitioned = partitionNudgeSelections(lines, [
      { lineId: "A", type: "bg", wordIndex: 0 },
      { lineId: "A", type: "bg", wordIndex: 1 },
    ]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.1, 60);
    const bg = result.updates.find((u) => u.id === "A")?.updates.backgroundWords as {
      text: string;
      begin: number;
      end: number;
    }[];
    expect(bg.map((w) => w.text)).toEqual(["ooh ", "aah"]);
    expect(bg).toHaveLength(2);
  });

  it("does not touch background provenance when nudging only main words", () => {
    const lines: LyricLine[] = [
      {
        id: "A",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 5, end: 6 }],
        backgroundText: "ooh",
        backgroundWords: [{ text: "ooh", begin: 2, end: 3 }],
        backgroundTextSource: "extraction",
      },
    ];
    const partitioned = partitionNudgeSelections(lines, [{ lineId: "A", type: "word", wordIndex: 0 }]);
    const result = shiftSelectionsTogether(lines, partitioned, 0.1, 60);
    const update = result.updates.find((u) => u.id === "A");
    expect(update?.updates.backgroundTextSource).toBeUndefined();
    expect(update?.updates.backgroundWords).toBeUndefined();
  });
});
