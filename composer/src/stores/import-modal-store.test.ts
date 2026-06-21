import { beforeEach, describe, expect, it } from "vitest";
import type { LyricLine } from "@/domain/line/model";
import { INITIAL_STATE, useImportModal, useImportModalStore } from "@/stores/import-modal-store";
import type { ParseResult } from "@/utils/lyrics-parsers/shared";

function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  const lines: LyricLine[] = [];
  return { lines, metadata: {}, hasTimingData: false, ...overrides };
}

beforeEach(() => {
  useImportModalStore.setState({ ...INITIAL_STATE });
  window.localStorage.removeItem("composer-import-modal");
});

describe("import-modal-store", () => {
  it("starts closed with no prefill and no initial section", () => {
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBeNull();
    expect(state.lastImportResult).toBeNull();
  });

  it("open() with no args sets isOpen and leaves prefill/section null", () => {
    useImportModalStore.getState().open();
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBeNull();
  });

  it("open({ prefill }) populates the prefill query verbatim", () => {
    useImportModalStore.getState().open({ prefill: { track: "Bohemian Rhapsody" } });
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toEqual({ track: "Bohemian Rhapsody" });
    expect(state.initialSection).toBeNull();
  });

  it("open({ section }) sets initialSection without touching prefill", () => {
    useImportModalStore.getState().open({ section: "paste" });
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBe("paste");
  });

  it("open({ prefill, section }) sets both fields together", () => {
    useImportModalStore.getState().open({
      prefill: { track: "Bohemian Rhapsody", artist: "Queen", videoId: "fJ9rUzIMcZQ" },
      section: "search",
    });
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toEqual({
      track: "Bohemian Rhapsody",
      artist: "Queen",
      videoId: "fJ9rUzIMcZQ",
    });
    expect(state.initialSection).toBe("search");
  });

  it("close() resets isOpen, prefill, and initialSection back to defaults", () => {
    useImportModalStore.getState().open({
      prefill: { track: "X" },
      section: "upload",
    });
    useImportModalStore.getState().close();
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBeNull();
  });

  it("re-opening after close with no args does not leak prior prefill or section", () => {
    useImportModalStore.getState().open({
      prefill: { track: "Old", artist: "Stale" },
      section: "paste",
    });
    useImportModalStore.getState().close();
    useImportModalStore.getState().open();
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBeNull();
  });

  it("useImportModal() returns the store's open action by reference (stable across calls)", () => {
    const first = useImportModal();
    const second = useImportModal();
    const third = useImportModal();
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(first).toBe(useImportModalStore.getState().open);
  });

  it("the open returned by useImportModal() actually toggles state", () => {
    const open = useImportModal();
    open({ prefill: { isrc: "USQX91200002" }, section: "search" });
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toEqual({ isrc: "USQX91200002" });
    expect(state.initialSection).toBe("search");
  });

  it("consecutive opens overwrite prior prefill/section without merging", () => {
    useImportModalStore.getState().open({ prefill: { track: "First" }, section: "paste" });
    useImportModalStore.getState().open({ prefill: { artist: "Only" } });
    const state = useImportModalStore.getState();
    expect(state.prefill).toEqual({ artist: "Only" });
    expect(state.initialSection).toBeNull();
  });

  it("recordImportResult stores the parsed result and source", () => {
    const parsed = makeParseResult();
    useImportModalStore.getState().recordImportResult(parsed, { label: "Paste", filename: "paste.txt" });
    const state = useImportModalStore.getState();
    expect(state.lastImportResult).toEqual({ parsed, source: { label: "Paste", filename: "paste.txt" } });
  });

  it("clearImportResult resets lastImportResult to null", () => {
    useImportModalStore.getState().recordImportResult(makeParseResult(), { label: "File", filename: "song.lrc" });
    useImportModalStore.getState().clearImportResult();
    expect(useImportModalStore.getState().lastImportResult).toBeNull();
  });

  it("close() does not wipe lastImportResult so consumers can still read it after the modal closes", () => {
    const parsed = makeParseResult();
    useImportModalStore.getState().open({ section: "paste" });
    useImportModalStore.getState().recordImportResult(parsed, { label: "Paste", filename: "paste.txt" });
    useImportModalStore.getState().close();
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.prefill).toBeNull();
    expect(state.initialSection).toBeNull();
    expect(state.lastImportResult).toEqual({ parsed, source: { label: "Paste", filename: "paste.txt" } });
  });

  it("recordImportResult overwrites a prior result instead of stacking", () => {
    const first = makeParseResult({ hasTimingData: false });
    const second = makeParseResult({ hasTimingData: true });
    useImportModalStore.getState().recordImportResult(first, { label: "Paste", filename: "first.txt" });
    useImportModalStore.getState().recordImportResult(second, { label: "File", filename: "second.lrc" });
    expect(useImportModalStore.getState().lastImportResult).toEqual({
      parsed: second,
      source: { label: "File", filename: "second.lrc" },
    });
  });
});

describe("import-modal-store · defaultPrefill", () => {
  it("starts with no defaultPrefill", () => {
    expect(useImportModalStore.getState().defaultPrefill).toBeNull();
  });

  it("setDefaultPrefill stashes the prefill without opening the modal", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Bohemian Rhapsody", artist: "Queen" });
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.defaultPrefill).toEqual({ track: "Bohemian Rhapsody", artist: "Queen" });
  });

  it("clearDefaultPrefill resets defaultPrefill to null", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "X" });
    useImportModalStore.getState().clearDefaultPrefill();
    expect(useImportModalStore.getState().defaultPrefill).toBeNull();
  });

  it("open() without args falls back to defaultPrefill as the modal's prefill", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Hello", videoId: "abc" });
    useImportModalStore.getState().open();
    const state = useImportModalStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.prefill).toEqual({ track: "Hello", videoId: "abc" });
  });

  it("open({ prefill }) overrides defaultPrefill for that session", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Default" });
    useImportModalStore.getState().open({ prefill: { track: "Override" } });
    const state = useImportModalStore.getState();
    expect(state.prefill).toEqual({ track: "Override" });
    expect(state.defaultPrefill).toEqual({ track: "Default" });
  });

  it("close() preserves defaultPrefill so a refresh or reopen still sees it", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Persists" });
    useImportModalStore.getState().open();
    useImportModalStore.getState().close();
    expect(useImportModalStore.getState().defaultPrefill).toEqual({ track: "Persists" });
  });

  it("defaultPrefill survives a manual write through the persist key", () => {
    window.localStorage.setItem(
      "composer-import-modal",
      JSON.stringify({ state: { defaultPrefill: { track: "Reloaded" } }, version: 0 }),
    );
    useImportModalStore.persist.rehydrate();
    expect(useImportModalStore.getState().defaultPrefill).toEqual({ track: "Reloaded" });
  });
});

describe("import-modal-store · slot coexistence", () => {
  it("recordImportResult does not wipe defaultPrefill", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Persist", artist: "Stays" });
    useImportModalStore.getState().recordImportResult(makeParseResult(), {
      label: "Paste",
      filename: "paste.txt",
    });
    const state = useImportModalStore.getState();
    expect(state.defaultPrefill).toEqual({ track: "Persist", artist: "Stays" });
    expect(state.lastImportResult).not.toBeNull();
  });

  it("clearDefaultPrefill does not wipe lastImportResult", () => {
    useImportModalStore.getState().recordImportResult(makeParseResult(), {
      label: "File",
      filename: "song.lrc",
    });
    useImportModalStore.getState().setDefaultPrefill({ track: "Will be cleared" });
    useImportModalStore.getState().clearDefaultPrefill();
    const state = useImportModalStore.getState();
    expect(state.defaultPrefill).toBeNull();
    expect(state.lastImportResult?.source.filename).toBe("song.lrc");
  });

  it("clearImportResult does not wipe defaultPrefill", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Survives" });
    useImportModalStore.getState().recordImportResult(makeParseResult(), {
      label: "Paste",
      filename: "p.txt",
    });
    useImportModalStore.getState().clearImportResult();
    const state = useImportModalStore.getState();
    expect(state.defaultPrefill).toEqual({ track: "Survives" });
    expect(state.lastImportResult).toBeNull();
  });

  it("open() / close() do not touch lastImportResult or defaultPrefill", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Default" });
    useImportModalStore.getState().recordImportResult(makeParseResult(), {
      label: "File",
      filename: "f.lrc",
    });
    useImportModalStore.getState().open({ prefill: { track: "Session" } });
    useImportModalStore.getState().close();
    const state = useImportModalStore.getState();
    expect(state.defaultPrefill).toEqual({ track: "Default" });
    expect(state.lastImportResult?.source.filename).toBe("f.lrc");
  });

  it("the persist partializer only persists defaultPrefill (not isOpen, prefill, or lastImportResult)", () => {
    useImportModalStore.getState().setDefaultPrefill({ track: "Persist me" });
    useImportModalStore.getState().open({ prefill: { track: "Session-only" }, section: "paste" });
    useImportModalStore.getState().recordImportResult(makeParseResult(), {
      label: "Paste",
      filename: "p.txt",
    });
    const persisted = window.localStorage.getItem("composer-import-modal");
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted!) as { state: Record<string, unknown> };
    expect(parsed.state).toEqual({ defaultPrefill: { track: "Persist me" } });
  });
});
