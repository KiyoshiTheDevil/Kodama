/**
 * @vitest-environment node
 */
import { reconcileLine, type LyricLine } from "@/domain/line/model";
import { describe, expect, it } from "vitest";
import {
  detachInstancesFromLines,
  diffEditTextChange,
  findStructurallyImpactedInstances,
  propagateContentUpdates,
} from "./diff-edit-text";

describe("diffEditTextChange", () => {
  it("returns no updates and no structural change when nothing differs", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const result = diffEditTextChange(lines, lines);
    expect(result.contentUpdates).toHaveLength(0);
    expect(result.hasStructuralChange).toBe(false);
  });

  it("emits a content update for a same-id text change", () => {
    const old: LyricLine[] = [{ id: "L1", text: "I love you", agentId: "v1" }];
    const next: LyricLine[] = [{ id: "L1", text: "I luv you", agentId: "v1" }];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(false);
    expect(result.contentUpdates).toEqual([{ id: "L1", updates: { text: "I luv you" } }]);
  });

  it("forwards explicit undefined for words when a word-synced source loses them", () => {
    const old: LyricLine[] = [
      {
        id: "L1",
        text: "I love",
        agentId: "v1",
        words: [{ text: "I love", begin: 0, end: 1 }],
      },
    ];
    const next: LyricLine[] = [{ id: "L1", text: "I luv", agentId: "v1" }];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(false);
    expect(result.contentUpdates).toHaveLength(1);
    const u = result.contentUpdates[0];
    expect(u.id).toBe("L1");
    expect(u.updates.text).toBe("I luv");
    expect("words" in u.updates).toBe(true);
    expect(u.updates.words).toBeUndefined();
  });

  it("forwards explicit undefined for begin/end when a line-synced source loses them", () => {
    const old: LyricLine[] = [{ id: "L1", text: "I love", agentId: "v1", begin: 0, end: 1 }];
    const next: LyricLine[] = [{ id: "L1", text: "I luv", agentId: "v1" }];
    const result = diffEditTextChange(old, next);
    expect(result.contentUpdates).toHaveLength(1);
    const u = result.contentUpdates[0];
    expect("begin" in u.updates).toBe(true);
    expect(u.updates.begin).toBeUndefined();
    expect("end" in u.updates).toBe(true);
    expect(u.updates.end).toBeUndefined();
  });

  it("flags hasStructuralChange when length differs (insertion)", () => {
    const old: LyricLine[] = [{ id: "L1", text: "first", agentId: "v1" }];
    const next: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(true);
  });

  it("flags hasStructuralChange when length differs (deletion)", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const next: LyricLine[] = [{ id: "L1", text: "first", agentId: "v1" }];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(true);
  });

  it("flags hasStructuralChange when ids reorder", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const next: LyricLine[] = [
      { id: "L2", text: "second", agentId: "v1" },
      { id: "L1", text: "first", agentId: "v1" },
    ];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(true);
  });

  it("flags hasStructuralChange when an id is replaced", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L3", text: "second", agentId: "v1" },
    ];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(true);
  });

  it("emits backgroundText update when only background differs", () => {
    const old: LyricLine[] = [{ id: "L1", text: "main", agentId: "v1" }];
    const next: LyricLine[] = [{ id: "L1", text: "main", agentId: "v1", backgroundText: "ah" }];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(false);
    expect(result.contentUpdates).toEqual([{ id: "L1", updates: { backgroundText: "ah" } }]);
  });

  it("emits a backgroundTextSource update when provenance is cleared", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "main", agentId: "v1", backgroundText: "ooh", backgroundTextSource: "extraction" },
    ];
    const next: LyricLine[] = [{ id: "L1", text: "main", agentId: "v1" }];
    const result = diffEditTextChange(old, next);
    expect(result.contentUpdates).toHaveLength(1);
    const u = result.contentUpdates[0];
    expect("backgroundText" in u.updates).toBe(true);
    expect(u.updates.backgroundText).toBeUndefined();
    expect("backgroundTextSource" in u.updates).toBe(true);
    expect(u.updates.backgroundTextSource).toBeUndefined();
  });

  it("does not emit updates for fields untouched by the new line", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "a edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    ];
    const result = diffEditTextChange(old, next);
    expect(result.contentUpdates).toHaveLength(1);
    const u = result.contentUpdates[0];
    expect(Object.keys(u.updates)).toEqual(["text"]);
    expect(u.updates.text).toBe("a edited");
  });

  it("treats a length-equal mix of content edits as content-only", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "first", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "first edit", agentId: "v1" },
      { id: "L2", text: "second", agentId: "v1" },
    ];
    const result = diffEditTextChange(old, next);
    expect(result.hasStructuralChange).toBe(false);
    expect(result.contentUpdates).toEqual([{ id: "L1", updates: { text: "first edit" } }]);
  });
});

describe("propagateContentUpdates", () => {
  it("returns input unchanged when there are no updates", () => {
    const lines: LyricLine[] = [{ id: "L1", text: "a", agentId: "v1" }];
    expect(propagateContentUpdates(lines, lines, [])).toBe(lines);
  });

  it("does nothing when the source line is not grouped", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1" },
      { id: "L2", text: "other", agentId: "v1" },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[1].text).toBe("other");
  });

  it("propagates text to linked siblings (same groupId + templateLineIdx)", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "stale", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[0].text).toBe("edited");
    expect(out[1].text).toBe("edited");
  });

  it("clears sibling words/begin/end when source clears them via text edit", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "I luv", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      {
        id: "L2",
        text: "stale",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [{ text: "I love", begin: 10, end: 11 }],
      },
    ];
    const out = propagateContentUpdates(lines, lines, [
      { id: "L1", updates: { text: "I luv", words: undefined, begin: undefined, end: undefined } },
    ]);
    expect(out[1].text).toBe("I luv");
    expect(out[1].words).toBeUndefined();
    expect(out[1].begin).toBeUndefined();
    expect(out[1].end).toBeUndefined();
  });

  it("propagates a cleared background provenance flag to linked siblings", () => {
    const old: LyricLine[] = [
      {
        id: "L1",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
      {
        id: "L2",
        text: "main",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        backgroundText: "ooh",
        backgroundTextSource: "extraction",
      },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "main", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      old[1],
    ];
    const { contentUpdates } = diffEditTextChange(old, next);
    const out = propagateContentUpdates(old, next, contentUpdates);
    expect(out[1].backgroundText).toBeUndefined();
    expect(out[1].backgroundTextSource).toBeUndefined();
  });

  it("propagates per-word text changes to siblings while preserving sibling word timings", () => {
    const oldLines: LyricLine[] = [
      {
        id: "L1",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 10, end: 10.4 },
          { text: "love ", begin: 10.4, end: 10.8 },
          { text: "you", begin: 10.8, end: 11.2 },
        ],
      },
      {
        id: "L2",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.5 },
          { text: "love ", begin: 30.5, end: 31.0 },
          { text: "you", begin: 31.0, end: 31.5 },
        ],
      },
    ];
    const newLines: LyricLine[] = [
      reconcileLine({
        ...oldLines[0],
        text: "I luv you",
        words: [
          { text: "I ", begin: 10, end: 10.4 },
          { text: "luv ", begin: 10.4, end: 10.8 },
          { text: "you", begin: 10.8, end: 11.2 },
        ],
      }),
      oldLines[1],
    ];

    const out = propagateContentUpdates(oldLines, newLines, [
      {
        id: "L1",
        updates: {
          text: "I luv you",
          words: newLines[0].words,
        },
      },
    ]);

    expect(out[1].text).toBe("I luv you");
    expect(out[1].words?.[1].text).toBe("luv ");
    expect(out[1].words?.[1].begin).toBe(30.5);
    expect(out[1].words?.[1].end).toBe(31.0);
    expect(out[1].words?.[0].text).toBe("I ");
    expect(out[1].words?.[0].begin).toBe(30);
  });

  it("skips detached siblings", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "stale", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0, detached: true },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[1].text).toBe("stale");
  });

  it("skips lines from other groups", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "stale", agentId: "v1", groupId: "g2", instanceIdx: 0, templateLineIdx: 0 },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[1].text).toBe("stale");
  });

  it("skips siblings with a different templateLineIdx", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "stale", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 1 },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[1].text).toBe("stale");
  });

  it("does not touch the target line itself", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "edited", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "stale", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const out = propagateContentUpdates(lines, lines, [{ id: "L1", updates: { text: "edited" } }]);
    expect(out[0]).toBe(lines[0]);
  });
});

describe("findStructurallyImpactedInstances", () => {
  it("returns nothing when both sides have the same instance line ids", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    ];
    expect(findStructurallyImpactedInstances(old, old)).toEqual([]);
  });

  it("flags an instance that lost a line", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    ];
    const impacted = findStructurallyImpactedInstances(old, next);
    expect(impacted).toEqual([{ groupId: "g1", instanceIdx: 0 }]);
  });

  it("flags an instance whose entire line set disappeared", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const next: LyricLine[] = [];
    expect(findStructurallyImpactedInstances(old, next)).toEqual([{ groupId: "g1", instanceIdx: 1 }]);
  });

  it("does not flag standalone insertions outside any group", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "added", agentId: "v1" },
    ];
    expect(findStructurallyImpactedInstances(old, next)).toEqual([]);
  });

  it("flags an instance when a non-grouped line is inserted between its grouped lines", () => {
    const old: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L1", text: "B", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    ];
    const next: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "NEW", text: "x", agentId: "v1" },
      { id: "L1", text: "B", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
    ];
    expect(findStructurallyImpactedInstances(old, next)).toEqual([{ groupId: "g1", instanceIdx: 0 }]);
  });

  it("does not flag when a non-grouped line lives between two DIFFERENT instances", () => {
    const old: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L1", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const next: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "NEW", text: "x", agentId: "v1" },
      { id: "L1", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    expect(findStructurallyImpactedInstances(old, next)).toEqual([]);
  });

  it("dedups when both id-set and positional detection point at the same instance", () => {
    const old: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L1", text: "B", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
      { id: "L2", text: "C", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 2 },
    ];
    const next: LyricLine[] = [
      { id: "L0", text: "A", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "NEW", text: "x", agentId: "v1" },
      { id: "L2", text: "C", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 2 },
    ];
    const impacted = findStructurallyImpactedInstances(old, next);
    expect(impacted).toHaveLength(1);
    expect(impacted[0]).toEqual({ groupId: "g1", instanceIdx: 0 });
  });

  it("flags only the instance whose ids actually differ", () => {
    const old: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L2", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
      { id: "L3", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
      { id: "L4", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 1 },
    ];
    const next: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
      { id: "L3", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
      { id: "L4", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 1 },
    ];
    const impacted = findStructurallyImpactedInstances(old, next);
    expect(impacted).toEqual([{ groupId: "g1", instanceIdx: 0 }]);
  });
});

describe("detachInstancesFromLines", () => {
  it("returns the same array when no instances impacted", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 },
    ];
    expect(detachInstancesFromLines(lines, [])).toBe(lines);
  });

  it("clears group attrs on all lines of impacted instances only", () => {
    const lines: LyricLine[] = [
      { id: "L1", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0, detached: true },
      { id: "L2", text: "b", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 },
      { id: "L3", text: "a", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 },
    ];
    const out = detachInstancesFromLines(lines, [{ groupId: "g1", instanceIdx: 0 }]);
    expect(out[0].groupId).toBeUndefined();
    expect(out[0].instanceIdx).toBeUndefined();
    expect(out[0].templateLineIdx).toBeUndefined();
    expect(out[0].detached).toBeUndefined();
    expect(out[1].groupId).toBeUndefined();
    expect(out[2].groupId).toBe("g1");
    expect(out[2].instanceIdx).toBe(1);
  });
});
