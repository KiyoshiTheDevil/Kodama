import { describe, expect, it, vi } from "vitest";
import { TimelineSyllableSplitter } from "@/views/timeline/timeline-syllable-splitter";
import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

describe("TimelineSyllableSplitter", () => {
  it("renders nothing initially (no target word selected)", async () => {
    await render(<TimelineSyllableSplitter />);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("ignores the split-syllable event when no word is selected", async () => {
    await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("opens the split dialog when the split-syllable event fires for a selected multi-char word", async () => {
    const line = createLine({ words: [createWord({ text: "hello", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "hello"/ })).toBeInTheDocument();
  });

  it("ignores the event for single-character words", async () => {
    const line = createLine({ words: [createWord({ text: "a", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("stamps a fresh syllableGroupId on every new syllable when splitting a word with no id", async () => {
    const line = createLine({ words: [createWord({ text: "every", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "every"/ })).toBeInTheDocument();

    await vi.waitFor(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
      expect(btns.length).toBeGreaterThan(0);
    });
    const splitButtons = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
    expect(splitButtons.length).toBe(4);
    splitButtons[1].click();
    splitButtons[3].click();

    await screen.getByRole("button", { name: "Split Word" }).click();

    await vi.waitFor(() => {
      const words = useProjectStore.getState().lines[0].words ?? [];
      expect(words.map((w) => w.text)).toEqual(["ev", "er", "y"]);
    });
    const wordsAfter = useProjectStore.getState().lines[0].words ?? [];
    const ids = wordsAfter.map((w) => w.syllableGroupId);
    expect(ids[0]).toBeDefined();
    expect(ids[0]).toBe(ids[1]);
    expect(ids[1]).toBe(ids[2]);
  });

  it("preserves the source word's syllableGroupId on re-split (further-split a syllable)", async () => {
    const line = createLine({
      words: [
        createWord({ text: "ev", begin: 0, end: 0.3, syllableGroupId: "g_source" }),
        createWord({ text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g_source" }),
        createWord({ text: "y", begin: 0.6, end: 1, syllableGroupId: "g_source" }),
      ],
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "ev"/ })).toBeInTheDocument();

    await vi.waitFor(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
      expect(btns.length).toBeGreaterThan(0);
    });
    const splitButtons = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
    expect(splitButtons.length).toBe(1);
    splitButtons[0].click();

    await screen.getByRole("button", { name: "Split Word" }).click();

    await vi.waitFor(() => {
      const words = useProjectStore.getState().lines[0].words ?? [];
      expect(words.length).toBe(4);
    });
    const wordsAfter = useProjectStore.getState().lines[0].words ?? [];
    expect(wordsAfter.every((w) => w.syllableGroupId === "g_source")).toBe(true);
  });

  it("opens with a word-split title and splits into independent words", async () => {
    const line = createLine({ words: [createWord({ text: "hello", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-word"));
    await expect.element(screen.getByRole("heading", { name: /Split "hello" into words/ })).toBeInTheDocument();

    await vi.waitFor(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
      expect(btns.length).toBeGreaterThan(0);
    });
    const splitButtons = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
    expect(splitButtons.length).toBe(4);
    splitButtons[2].click();

    await screen.getByRole("button", { name: "Split Word" }).click();

    await vi.waitFor(() => {
      const words = useProjectStore.getState().lines[0].words ?? [];
      expect(words.length).toBe(2);
    });
    const wordsAfter = useProjectStore.getState().lines[0].words ?? [];
    expect(wordsAfter.map((w) => w.text)).toEqual(["hel ", "lo"]);
    expect(wordsAfter.every((w) => w.syllableGroupId === undefined)).toBe(true);
  });

  it("ignores the split-word event for single-character words", async () => {
    const line = createLine({ words: [createWord({ text: "a", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-word"));
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("hides apply-to-all controls in word-split mode", async () => {
    const line = createLine({ words: [createWord({ text: "hello", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-word"));
    await expect.element(screen.getByRole("heading", { name: /Split "hello" into words/ })).toBeInTheDocument();

    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("reconciles line.text from the new words array after a split", async () => {
    const line = createLine({
      text: "every",
      words: [createWord({ text: "every", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const screen = await render(<TimelineSyllableSplitter />);
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "every"/ })).toBeInTheDocument();

    await vi.waitFor(() => {
      const btns = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
      expect(btns.length).toBeGreaterThan(0);
    });
    const splitButtons = document.querySelectorAll<HTMLButtonElement>("button.w-4.h-8");
    splitButtons[1].click();
    splitButtons[3].click();

    await screen.getByRole("button", { name: "Split Word" }).click();

    await vi.waitFor(() => {
      const words = useProjectStore.getState().lines[0].words ?? [];
      expect(words.length).toBe(3);
    });
    const lineAfter = useProjectStore.getState().lines[0];
    // text is reconciled via reconstructLineText: the split char marks the
    // syllable joints so line.text tokenizes 1:1 back to line.words.
    expect(lineAfter.text).toBe("ev|er|y");
  });
});
