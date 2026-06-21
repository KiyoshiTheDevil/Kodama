import { describe, expect, it } from "vitest";
import { TimelineContextMenu } from "@/views/timeline/timeline-context-menu";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

function findButton(pattern: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => pattern.test(b.textContent ?? ""));
}

function openWordContextMenu(lineId: string) {
  useTimelineStore.setState({
    contextMenu: {
      x: 100,
      y: 100,
      target: { kind: "word", lineId, lineIndex: 0, wordIndex: 0, type: "word" },
    },
    selectedWords: [{ lineId, lineIndex: 0, wordIndex: 0, type: "word" }],
  });
}

describe("TimelineContextMenu", () => {
  it("renders nothing when no context menu is set", async () => {
    useTimelineStore.setState({ contextMenu: null });
    await render(<TimelineContextMenu />);
    const explicitButton = Array.from(document.querySelectorAll("button")).find((b) =>
      /explicit/i.test(b.textContent ?? ""),
    );
    expect(explicitButton).toBeUndefined();
  });

  it("opens the menu when contextMenu state is set", async () => {
    const line = createLine({ words: [createWord({ text: "hi", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    openWordContextMenu(line.id);
    await render(<TimelineContextMenu />);
    expect(document.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("dismisses the menu when an outside click occurs", async () => {
    const line = createLine({ words: [createWord({ text: "hi", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    openWordContextMenu(line.id);
    await render(<TimelineContextMenu />);
    expect(useTimelineStore.getState().contextMenu).not.toBeNull();
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(useTimelineStore.getState().contextMenu).toBeNull();
  });

  it("toggles word explicit flag when the 'Mark explicit' action is invoked", async () => {
    const line = createLine({
      words: [createWord({ text: "darn", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    openWordContextMenu(line.id);
    await render(<TimelineContextMenu />);
    const explicitButton = Array.from(document.querySelectorAll("button")).find((b) =>
      /explicit/i.test(b.textContent ?? ""),
    );
    expect(explicitButton).toBeDefined();
    explicitButton?.click();
    const updated = useProjectStore.getState().lines[0].words?.[0];
    expect(updated?.explicit).toBe(true);
  });

  it("shows 'Merge syllables' on a syllable-group word and collapses the group to one word when clicked", async () => {
    const line = createLine({
      words: [
        createWord({ text: "ev", begin: 0, end: 0.3, syllableGroupId: "g_every" }),
        createWord({ text: "er", begin: 0.3, end: 0.6, syllableGroupId: "g_every" }),
        createWord({ text: "y", begin: 0.6, end: 1, syllableGroupId: "g_every" }),
      ],
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: line.id, lineIndex: 0, wordIndex: 1, type: "word" },
      },
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 1, type: "word" }],
    });
    await render(<TimelineContextMenu />);

    const mergeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Merge syllables/i.test(b.textContent ?? ""),
    );
    expect(mergeBtn).toBeDefined();
    mergeBtn?.click();

    const words = useProjectStore.getState().lines[0].words ?? [];
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe("every");
    expect(words[0].begin).toBe(0);
    expect(words[0].end).toBe(1);
    expect(words[0].syllableGroupId).toBeUndefined();
  });

  it("hides 'Merge syllables' on a standalone word", async () => {
    const line = createLine({ words: [createWord({ text: "hello", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" },
      },
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    await render(<TimelineContextMenu />);

    const mergeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Merge syllables/i.test(b.textContent ?? ""),
    );
    expect(mergeBtn).toBeUndefined();
  });

  it("shows 'Split word' on a word target and dispatches timeline:split-word when clicked", async () => {
    const line = createLine({ words: [createWord({ text: "hello", begin: 0, end: 1 })] });
    useProjectStore.setState({ lines: [line] });
    openWordContextMenu(line.id);
    await render(<TimelineContextMenu />);

    const splitWordBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().startsWith("Split word"),
    );
    expect(splitWordBtn).toBeDefined();

    let dispatched = false;
    const onSplitWord = () => {
      dispatched = true;
    };
    window.addEventListener("timeline:split-word", onSplitWord);
    splitWordBtn?.click();
    window.removeEventListener("timeline:split-word", onSplitWord);

    expect(dispatched).toBe(true);
  });

  it("snaps a gapped syllable group flush when 'Snap syllables flush' is clicked", async () => {
    const line = createLine({
      words: [
        createWord({ text: "beau", begin: 0, end: 0.3, syllableGroupId: "g_beau" }),
        createWord({ text: "ti", begin: 0.5, end: 0.8, syllableGroupId: "g_beau" }),
        createWord({ text: "ful", begin: 1.0, end: 1.3, syllableGroupId: "g_beau" }),
      ],
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: line.id, lineIndex: 0, wordIndex: 1, type: "word" },
      },
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 1, type: "word" }],
    });
    await render(<TimelineContextMenu />);

    const snapBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Snap syllables flush/i.test(b.textContent ?? ""),
    );
    expect(snapBtn).toBeDefined();
    snapBtn?.click();

    const words = useProjectStore.getState().lines[0].words ?? [];
    expect(words[0].end).toBe(words[1].begin);
    expect(words[1].end).toBe(words[2].begin);
    expect(words[0].begin).toBe(0);
    expect(words[2].end).toBe(1.3);
  });
});

describe("TimelineContextMenu background provenance", () => {
  function bgLine() {
    return createLine({
      id: "l1",
      text: "main",
      words: [createWord({ text: "main", begin: 0, end: 1 })],
      backgroundText: "ooh aah",
      backgroundWords: [
        createWord({ text: "ooh ", begin: 1, end: 1.5 }),
        createWord({ text: "aah", begin: 1.5, end: 2 }),
      ],
      backgroundTextSource: "extraction",
    });
  }

  it("stamps backgroundTextSource manual when a bg word is deleted but others remain", async () => {
    useProjectStore.setState({ lines: [bgLine()] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" },
      },
      selectedWords: [{ lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" }],
    });
    await render(<TimelineContextMenu />);

    findButton(/Delete word/i)?.click();

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundWords?.map((w) => w.text)).toEqual(["aah"]);
    expect(updated.backgroundTextSource).toBe("manual");
  });

  it("clears all three background fields when the last bg word is deleted", async () => {
    const single = createLine({
      id: "l1",
      text: "main",
      words: [createWord({ text: "main", begin: 0, end: 1 })],
      backgroundText: "ooh",
      backgroundWords: [createWord({ text: "ooh", begin: 1, end: 2 })],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ lines: [single] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" },
      },
      selectedWords: [{ lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" }],
    });
    await render(<TimelineContextMenu />);

    findButton(/Delete word/i)?.click();

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundWords).toBeUndefined();
    expect(updated.backgroundText).toBeUndefined();
    expect(updated.backgroundTextSource).toBeUndefined();
  });

  it("stamps backgroundTextSource manual when a bg word is added via 'Add word here'", async () => {
    useAudioStore.setState({ duration: 10 });
    useProjectStore.setState({ lines: [bgLine()] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "track", lineId: "l1", lineIndex: 0, time: 5, type: "bg" },
      },
    });
    await render(<TimelineContextMenu />);

    findButton(/Add word here/i)?.click();

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundWords?.length).toBe(3);
    expect(updated.backgroundTextSource).toBe("manual");
  });

  it("stamps backgroundTextSource manual when bg words are merged", async () => {
    useProjectStore.setState({ lines: [bgLine()] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" },
      },
      selectedWords: [
        { lineId: "l1", lineIndex: 0, wordIndex: 0, type: "bg" },
        { lineId: "l1", lineIndex: 0, wordIndex: 1, type: "bg" },
      ],
    });
    await render(<TimelineContextMenu />);

    findButton(/Merge words/i)?.click();

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundWords).toHaveLength(1);
    expect(updated.backgroundTextSource).toBe("manual");
  });

  it("leaves background provenance untouched when a main word is deleted", async () => {
    const line = createLine({
      id: "l1",
      text: "I love",
      words: [createWord({ text: "I ", begin: 0, end: 0.5 }), createWord({ text: "love", begin: 0.5, end: 1 })],
      backgroundText: "ooh",
      backgroundWords: [createWord({ text: "ooh", begin: 1, end: 2 })],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      contextMenu: {
        x: 100,
        y: 100,
        target: { kind: "word", lineId: "l1", lineIndex: 0, wordIndex: 0, type: "word" },
      },
      selectedWords: [{ lineId: "l1", lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    await render(<TimelineContextMenu />);

    findButton(/Delete word/i)?.click();

    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });
});
