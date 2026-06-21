import {
  advanceSyncPosition,
  buildInitialWordUpdates,
  prepareSyncWord,
  withBgSeedIfNeeded,
} from "@/hooks/useSyncHandlers.helpers";
import type { LyricLine } from "@/domain/line/model";
import { createLine } from "@/test/factories";
import type { SyncState } from "@/utils/sync-helpers";
import { describe, expect, it } from "vitest";

describe("prepareSyncWord", () => {
  it("returns null when lines is empty", () => {
    expect(prepareSyncWord([], 0, 0, false)).toBeNull();
  });

  it("returns null when isComplete", () => {
    const lines = [createLine({ text: "Hello world" })];
    expect(prepareSyncWord(lines, 0, 0, true)).toBeNull();
  });

  it("returns null when line index is out of bounds", () => {
    const lines = [createLine({ text: "Hello" })];
    expect(prepareSyncWord(lines, 99, 0, false)).toBeNull();
  });

  it("returns null when wordIndex exceeds word count", () => {
    const lines = [createLine({ text: "Hello" })];
    expect(prepareSyncWord(lines, 0, 5, false)).toBeNull();
  });

  it("returns prepared word data with trailing space for non-final word", () => {
    const lines = [createLine({ text: "Hello world" })];
    const result = prepareSyncWord(lines, 0, 0, false);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.lineWords).toEqual(["Hello", "world"]);
    expect(result.textWithSpace).toBe("Hello ");
  });

  it("returns prepared word data without trailing space for final word", () => {
    const lines = [createLine({ text: "Hello world" })];
    const result = prepareSyncWord(lines, 0, 1, false);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.textWithSpace).toBe("world");
  });
});

describe("withBgSeedIfNeeded", () => {
  it("returns updates unchanged when line has no backgroundText", () => {
    const line = createLine({ text: "Hello" });
    const updates: Partial<LyricLine> = { begin: 0, end: 1 };
    const result = withBgSeedIfNeeded(updates, line, 0);
    expect(result.backgroundWords).toBeUndefined();
    expect(result).toBe(updates);
  });

  it("seeds backgroundWords when backgroundText exists and backgroundWords empty", () => {
    const line = createLine({ text: "Hello", backgroundText: "ooh ahh" });
    const result = withBgSeedIfNeeded<Partial<LyricLine>>({ begin: 0, end: 1 }, line, 0.5);
    expect(result.backgroundWords).toBeDefined();
    expect((result.backgroundWords ?? []).length).toBeGreaterThan(0);
  });

  it("does not overwrite existing backgroundWords", () => {
    const line = createLine({
      text: "Hello",
      backgroundText: "ooh ahh",
      backgroundWords: [{ text: "ooh", begin: 0, end: 1 }],
    });
    const result = withBgSeedIfNeeded<Partial<LyricLine>>({}, line, 0);
    expect(result.backgroundWords).toBeUndefined();
  });
});

describe("buildInitialWordUpdates", () => {
  it("creates a single-word words array with the given begin/end", () => {
    const line = createLine({ text: "Hello" });
    const result = buildInitialWordUpdates(line, "Hello", 1.5, 2.5);
    expect(result.words).toEqual([{ text: "Hello", begin: 1.5, end: 2.5 }]);
  });

  it("includes a bg seed when the line has backgroundText", () => {
    const line = createLine({ text: "Lead", backgroundText: "ooh" });
    const result = buildInitialWordUpdates(line, "Lead", 0, 0.4);
    expect(result.words?.length).toBe(1);
    expect(result.backgroundWords?.length).toBeGreaterThan(0);
  });
});

describe("advanceSyncPosition", () => {
  function makeSetter() {
    let state: SyncState = { position: { lineIndex: 0, wordIndex: 0 }, isActive: true };
    const setSyncState = (next: SyncState | ((prev: SyncState) => SyncState)) => {
      state = typeof next === "function" ? next(state) : next;
    };
    return { setSyncState, getState: () => state };
  }

  it("advances within the same line when not at the last word", () => {
    const { setSyncState, getState } = makeSetter();
    advanceSyncPosition(setSyncState, 0, 1, 5);
    expect(getState().position).toEqual({ lineIndex: 0, wordIndex: 2 });
  });

  it("advances to the next line when crossing the last word", () => {
    const { setSyncState, getState } = makeSetter();
    advanceSyncPosition(setSyncState, 0, 4, 5);
    expect(getState().position).toEqual({ lineIndex: 1, wordIndex: 0 });
  });

  it("preserves the isActive flag", () => {
    const { setSyncState, getState } = makeSetter();
    advanceSyncPosition(setSyncState, 0, 0, 3);
    expect(getState().isActive).toBe(true);
  });
});
