import { useProjectStore } from "@/stores/project";
import { createLine } from "@/test/factories";
import { commitTappedWord } from "@/utils/sync-helpers";
import { beforeEach, describe, expect, it } from "vitest";

describe("sync incremental tap preserves line.text", () => {
  beforeEach(() => {
    useProjectStore.setState({
      lines: [],
      groups: [],
      history: [],
      historyIndex: -1,
      isDirty: false,
      isDirtySinceHistory: false,
    });
  });

  it("preserves text after the first-word tap on a fresh line", () => {
    useProjectStore.getState().setLines([createLine({ id: "l0", text: "Hello world how are you" })]);

    const words = commitTappedWord([], 0, "Hello ", 0, 1);
    useProjectStore.getState().updateLineWithHistory("l0", { words }, { deriveText: false });

    expect(useProjectStore.getState().lines[0].text).toBe("Hello world how are you");
  });

  it("preserves text across a full word-by-word tap sequence", () => {
    useProjectStore.getState().setLines([createLine({ id: "l0", text: "Hello world how are you" })]);

    const taps = ["Hello ", "world ", "how ", "are ", "you"];
    let words: ReturnType<typeof commitTappedWord> = [];
    for (let i = 0; i < taps.length; i++) {
      words = commitTappedWord(words, i, taps[i], i * 0.5, i * 0.5 + 0.4);
      useProjectStore.getState().updateLineWithHistory("l0", { words }, { deriveText: false });
      expect(useProjectStore.getState().lines[0].text).toBe("Hello world how are you");
    }
  });

  it("preserves text when the previous line's last word end is patched mid-sync", () => {
    useProjectStore
      .getState()
      .setLines([createLine({ id: "l0", text: "Hello world" }), createLine({ id: "l1", text: "Foo bar" })]);

    let words: ReturnType<typeof commitTappedWord> = [];
    words = commitTappedWord(words, 0, "Hello ", 0, 1);
    useProjectStore.getState().updateLineWithHistory("l0", { words }, { deriveText: false });

    const partialPrev = [...(useProjectStore.getState().lines[0].words ?? [])];
    partialPrev[partialPrev.length - 1] = { ...partialPrev[partialPrev.length - 1], end: 2 };
    useProjectStore.getState().updateLine("l0", { words: partialPrev }, { deriveText: false });

    expect(useProjectStore.getState().lines[0].text).toBe("Hello world");
  });
});
