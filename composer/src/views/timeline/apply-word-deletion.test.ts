/**
 * @vitest-environment node
 */
import type { LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import { applyWordDeletion, type DeletionSelection } from "./apply-word-deletion";

describe("applyWordDeletion", () => {
  it("removes selected words from a word-timed line, leaving the line in place", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "I love you",
        agentId: "v1",
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "love ", begin: 0.3, end: 0.6 },
          { text: "you", begin: 0.6, end: 1 },
        ],
      },
    ];
    const sel: DeletionSelection[] = [{ lineId: "l1", type: "word", wordIndex: 1 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].words?.map((w) => w.text)).toEqual(["I ", "you"]);
  });

  it("leaves a word-timed line in place with empty words AND clears begin/end when ALL words are deleted", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "I love",
        agentId: "v1",
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "love", begin: 0.3, end: 0.6 },
        ],
      },
    ];
    const sel: DeletionSelection[] = [
      { lineId: "l1", type: "word", wordIndex: 0 },
      { lineId: "l1", type: "word", wordIndex: 1 },
    ];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].words).toEqual([]);
    expect(result[0].begin).toBeUndefined();
    expect(result[0].end).toBeUndefined();
    expect(result[0].text).toBe("I love");
  });

  it("clears begin/end on a word-timed line with no line-level timing too", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "I",
        agentId: "v1",
        words: [{ text: "I", begin: 0, end: 1 }],
      },
    ];
    const sel: DeletionSelection[] = [{ lineId: "l1", type: "word", wordIndex: 0 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].words).toEqual([]);
    expect(result[0].begin).toBeUndefined();
  });

  it("clears a line-synced line's timing (no longer renders as line-synced) when synthetic word is deleted", () => {
    const lines: LyricLine[] = [{ id: "l1", text: "I love you", agentId: "v1", begin: 1, end: 2 }];
    const sel: DeletionSelection[] = [{ lineId: "l1", type: "word", wordIndex: 0 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("I love you");
    expect(result[0].words).toBeUndefined();
    expect(result[0].begin).toBeUndefined();
    expect(result[0].end).toBeUndefined();
  });

  it("clears multiple line-synced lines' timing when marquee-deleted (lines stay in project)", () => {
    const lines: LyricLine[] = [
      { id: "l1", text: "first", agentId: "v1", begin: 0, end: 1 },
      { id: "l2", text: "second", agentId: "v1", begin: 1, end: 2 },
      { id: "l3", text: "third", agentId: "v1", begin: 2, end: 3 },
    ];
    const sel: DeletionSelection[] = [
      { lineId: "l1", type: "word", wordIndex: 0 },
      { lineId: "l2", type: "word", wordIndex: 0 },
      { lineId: "l3", type: "word", wordIndex: 0 },
    ];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(3);
    for (const line of result) {
      expect(line.begin).toBeUndefined();
      expect(line.end).toBeUndefined();
      expect(line.words).toBeUndefined();
    }
  });

  it("preserves line ordering and edits multiple lines without removing any", () => {
    const lines: LyricLine[] = [
      { id: "keep1", text: "intact", agentId: "v1", begin: 0, end: 1 },
      {
        id: "edit",
        text: "I love",
        agentId: "v1",
        words: [
          { text: "I ", begin: 1, end: 1.3 },
          { text: "love", begin: 1.3, end: 1.6 },
        ],
      },
      { id: "drop", text: "to clear", agentId: "v1", begin: 2, end: 3 },
      { id: "keep2", text: "intact 2", agentId: "v1", begin: 3, end: 4 },
    ];
    const sel: DeletionSelection[] = [
      { lineId: "edit", type: "word", wordIndex: 0 },
      { lineId: "drop", type: "word", wordIndex: 0 },
    ];
    const result = applyWordDeletion(lines, sel);
    expect(result.map((l) => l.id)).toEqual(["keep1", "edit", "drop", "keep2"]);
    expect(result[1].words?.map((w) => w.text)).toEqual(["love"]);
    expect(result[2].begin).toBeUndefined();
    expect(result[2].end).toBeUndefined();
    expect(result[2].words).toBeUndefined();
    expect(result[2].text).toBe("to clear");
  });

  it("removes selected bg words and clears the bg fields when none remain", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "bg",
        backgroundWords: [{ text: "bg", begin: 0, end: 1 }],
      },
    ];
    const sel: DeletionSelection[] = [{ lineId: "l1", type: "bg", wordIndex: 0 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toBeUndefined();
    expect(result[0].backgroundText).toBeUndefined();
    expect(result[0].words?.length).toBe(1);
  });

  it("does not remove the line when only some bg words are removed", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "ohoh",
        backgroundWords: [
          { text: "oh", begin: 0, end: 0.5 },
          { text: "oh", begin: 0.5, end: 1 },
        ],
      },
    ];
    const sel: DeletionSelection[] = [{ lineId: "l1", type: "bg", wordIndex: 0 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords?.map((w) => w.text)).toEqual(["oh"]);
    expect(result[0].backgroundText).toBe("oh");
  });

  it("clears backgroundTextSource when the deletion empties the background", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "bg",
        backgroundWords: [{ text: "bg", begin: 0, end: 1 }],
        backgroundTextSource: "extraction",
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "l1", type: "bg", wordIndex: 0 }]);
    expect(result[0].backgroundWords).toBeUndefined();
    expect(result[0].backgroundText).toBeUndefined();
    expect(result[0].backgroundTextSource).toBeUndefined();
  });

  it("stamps backgroundTextSource manual when a partial bg deletion leaves words behind", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "main",
        agentId: "v1",
        words: [{ text: "main", begin: 0, end: 1 }],
        backgroundText: "ohoh",
        backgroundWords: [
          { text: "oh", begin: 0, end: 0.5 },
          { text: "oh", begin: 0.5, end: 1 },
        ],
        backgroundTextSource: "extraction",
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "l1", type: "bg", wordIndex: 0 }]);
    expect(result[0].backgroundWords?.map((w) => w.text)).toEqual(["oh"]);
    expect(result[0].backgroundTextSource).toBe("manual");
  });

  it("leaves backgroundTextSource untouched when only main words are deleted", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "I love",
        agentId: "v1",
        words: [
          { text: "I ", begin: 0, end: 0.3 },
          { text: "love", begin: 0.3, end: 0.6 },
        ],
        backgroundText: "ohoh",
        backgroundWords: [
          { text: "oh", begin: 0, end: 0.5 },
          { text: "oh", begin: 0.5, end: 1 },
        ],
        backgroundTextSource: "extraction",
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "l1", type: "word", wordIndex: 0 }]);
    expect(result[0].words?.map((w) => w.text)).toEqual(["love"]);
    expect(result[0].backgroundWords?.length).toBe(2);
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("leaves a word-timed line empty (not removed) when all main + bg words are deleted in one pass", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "I",
        agentId: "v1",
        words: [{ text: "I", begin: 0, end: 1 }],
        backgroundText: "ah",
        backgroundWords: [{ text: "ah", begin: 0, end: 1 }],
      },
    ];
    const sel: DeletionSelection[] = [
      { lineId: "l1", type: "word", wordIndex: 0 },
      { lineId: "l1", type: "bg", wordIndex: 0 },
    ];
    const result = applyWordDeletion(lines, sel);
    expect(result).toHaveLength(1);
    expect(result[0].words).toEqual([]);
    expect(result[0].backgroundWords).toBeUndefined();
    expect(result[0].begin).toBeUndefined();
    expect(result[0].end).toBeUndefined();
  });

  it("returns the original array when there are no selections", () => {
    const lines: LyricLine[] = [{ id: "l1", text: "x", agentId: "v1" }];
    expect(applyWordDeletion(lines, [])).toBe(lines);
  });

  it("ignores selections referencing missing lines", () => {
    const lines: LyricLine[] = [{ id: "l1", text: "x", agentId: "v1", begin: 0, end: 1 }];
    const sel: DeletionSelection[] = [{ lineId: "ghost", type: "word", wordIndex: 0 }];
    const result = applyWordDeletion(lines, sel);
    expect(result).toEqual(lines);
  });

  it("preserves pre-existing intra-group gaps after deleting a non-group word", () => {
    const lines: LyricLine[] = [
      {
        id: "l1",
        text: "every world",
        agentId: "v1",
        words: [
          { text: "ev", begin: 0, end: 0.2, syllableGroupId: "g1" },
          { text: "er", begin: 0.3, end: 0.5, syllableGroupId: "g1" },
          { text: "y", begin: 0.5, end: 0.7, syllableGroupId: "g1" },
          { text: "world", begin: 0.7, end: 1 },
        ],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "l1", type: "word", wordIndex: 3 }]);
    expect(result[0].words?.[0].end).toBe(0.2);
    expect(result[0].words?.[1].begin).toBe(0.3);
  });
});

// -- Auto-cleanup of fully-empty instances ------------------------------------
//
// When every line of an instance is emptied of all timed content (no words,
// no bg words, no begin/end), strip the group attrs from those lines. The
// rows remain as standalone empty placeholders for the existing Cmd+D / paste
// fill flow to repopulate later. Without this, the instance lingered in the
// data model and rendered a confusing zero-bounds banner at x=0.

describe("applyWordDeletion · auto-cleanup of fully-empty grouped instances", () => {
  it("strips group attrs when a single-line instance has its only word deleted", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "x",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "x", begin: 5, end: 6 }],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }]);
    expect(result[0].groupId).toBeUndefined();
    expect(result[0].instanceIdx).toBeUndefined();
    expect(result[0].templateLineIdx).toBeUndefined();
    // Row remains as an empty placeholder (text and id preserved)
    expect(result[0].id).toBe("L1");
    expect(result[0].text).toBe("x");
    // Existing applyWordDeletion contract: words becomes [] after deleting all words
    expect(result[0].words).toEqual([]);
    expect(result[0].begin).toBeUndefined();
    expect(result[0].end).toBeUndefined();
  });

  it("strips group attrs from ALL lines of a multi-line instance when every line is emptied", () => {
    const lines: LyricLine[] = [
      {
        id: "A1",
        text: "I love",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 5, end: 5.5 },
          { text: "love", begin: 5.5, end: 6 },
        ],
      },
      {
        id: "A2",
        text: "you",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 1,
        words: [{ text: "you", begin: 6, end: 7 }],
      },
    ];
    const result = applyWordDeletion(lines, [
      { lineId: "A1", type: "word", wordIndex: 0 },
      { lineId: "A1", type: "word", wordIndex: 1 },
      { lineId: "A2", type: "word", wordIndex: 0 },
    ]);
    expect(result.every((l) => l.groupId === undefined)).toBe(true);
    expect(result.every((l) => l.instanceIdx === undefined)).toBe(true);
    expect(result.every((l) => l.templateLineIdx === undefined)).toBe(true);
  });

  it("keeps group attrs intact when only SOME lines of a multi-line instance are emptied", () => {
    // A1 gets emptied, A2 still has words. Instance is not fully empty → keep linked.
    const lines: LyricLine[] = [
      {
        id: "A1",
        text: "I love",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "I love", begin: 5, end: 6 }],
      },
      {
        id: "A2",
        text: "you",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 1,
        words: [{ text: "you", begin: 6, end: 7 }],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "A1", type: "word", wordIndex: 0 }]);
    // A1 is now empty but A2 still has words → instance stays alive
    expect(result.find((l) => l.id === "A1")?.groupId).toBe("cannon");
    expect(result.find((l) => l.id === "A2")?.groupId).toBe("cannon");
    expect(result.find((l) => l.id === "A1")?.words).toEqual([]);
    expect(result.find((l) => l.id === "A2")?.words).toEqual([{ text: "you", begin: 6, end: 7 }]);
  });

  it("strips group attrs when a single-line instance has only BG words and they all get deleted", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "main",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        backgroundText: "ah ah",
        backgroundWords: [
          { text: "ah ", begin: 5, end: 5.5 },
          { text: "ah", begin: 5.5, end: 6 },
        ],
      },
    ];
    const result = applyWordDeletion(lines, [
      { lineId: "L1", type: "bg", wordIndex: 0 },
      { lineId: "L1", type: "bg", wordIndex: 1 },
    ]);
    expect(result[0].groupId).toBeUndefined();
    expect(result[0].backgroundWords).toBeUndefined();
  });

  it("keeps group attrs when a line has main + bg and only one track is emptied (other still has content)", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "main",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "main", begin: 5, end: 6 }],
        backgroundText: "ah",
        backgroundWords: [{ text: "ah", begin: 5, end: 5.5 }],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }]);
    // Main words gone but bg still present → not fully empty → instance stays
    expect(result[0].groupId).toBe("cannon");
    expect(result[0].words).toEqual([]);
    expect(result[0].backgroundWords?.length).toBe(1);
  });

  it("strips group attrs from a line-synced (no words, has begin/end) instance when its single line is deleted", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "verse",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        begin: 5,
        end: 7,
      },
    ];
    // Selecting wordIndex 0 on a line-synced row deletes the synthetic word AND clears begin/end
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }]);
    expect(result[0].groupId).toBeUndefined();
    expect(result[0].begin).toBeUndefined();
    expect(result[0].end).toBeUndefined();
  });

  it("handles two separate instances both becoming empty in one deletion call", () => {
    const lines: LyricLine[] = [
      {
        id: "A1",
        text: "x",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "x", begin: 5, end: 6 }],
      },
      {
        id: "B1",
        text: "y",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "y", begin: 10, end: 11 }],
      },
    ];
    const result = applyWordDeletion(lines, [
      { lineId: "A1", type: "word", wordIndex: 0 },
      { lineId: "B1", type: "word", wordIndex: 0 },
    ]);
    expect(result.every((l) => l.groupId === undefined)).toBe(true);
  });

  it("does NOT touch instances that weren't part of the deletion selection", () => {
    const lines: LyricLine[] = [
      {
        id: "A1",
        text: "x",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [{ text: "x", begin: 5, end: 6 }],
      },
      {
        id: "B1",
        text: "y",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "y", begin: 10, end: 11 }],
      },
    ];
    // Only delete A1's word, not B1's
    const result = applyWordDeletion(lines, [{ lineId: "A1", type: "word", wordIndex: 0 }]);
    expect(result.find((l) => l.id === "A1")?.groupId).toBeUndefined();
    expect(result.find((l) => l.id === "B1")?.groupId).toBe("cannon");
  });

  it("non-grouped lines that get fully emptied: nothing to strip, just left as empty rows", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "x", agentId: "v1", words: [{ text: "x", begin: 5, end: 6 }] }];
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }]);
    expect(result[0].groupId).toBeUndefined();
    expect(result[0].words).toEqual([]);
    expect(result[0].id).toBe("L1");
    expect(result[0].text).toBe("x");
  });

  it("preserves the detached flag's semantics when stripping (detached lines also clear it)", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "x",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        detached: true,
        words: [{ text: "x", begin: 5, end: 6 }],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 0 }]);
    expect(result[0].groupId).toBeUndefined();
    expect(result[0].detached).toBeUndefined();
  });

  it("partial deletion (some words remain): instance stays linked", () => {
    const lines: LyricLine[] = [
      {
        id: "L1",
        text: "I love you",
        agentId: "v1",
        groupId: "cannon",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 5, end: 5.3 },
          { text: "love ", begin: 5.3, end: 5.6 },
          { text: "you", begin: 5.6, end: 6 },
        ],
      },
    ];
    const result = applyWordDeletion(lines, [{ lineId: "L1", type: "word", wordIndex: 1 }]);
    expect(result[0].groupId).toBe("cannon");
    expect(result[0].words?.length).toBe(2);
  });
});
