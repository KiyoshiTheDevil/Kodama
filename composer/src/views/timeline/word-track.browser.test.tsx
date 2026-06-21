import { describe, expect, it } from "vitest";
import { WordTrack } from "@/views/timeline/word-track";
import type { WordTiming } from "@/domain/word/timing";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

type UpdateWord = (index: number, updates: object, adjacentIndex?: number, adjacentUpdates?: object) => void;

async function renderTrack(words: WordTiming[], onUpdateWord: UpdateWord = () => {}) {
  const line = createLine({ words });
  useProjectStore.setState({ lines: [line] });
  return render(
    <WordTrack
      lineId={line.id}
      lineIndex={0}
      words={words}
      color="#a3c9ff"
      trackType="word"
      duration={3}
      height={32}
      onUpdateWord={onUpdateWord}
    />,
    { dndContext: true },
  );
}

function dragRightEdge(block: HTMLElement, opts: { altKey?: boolean } = {}) {
  const edge = block.querySelector('[data-edge="right"]') as HTMLElement;
  edge.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 40 }));
  document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 48, altKey: opts.altKey }));
  document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

function dragRightEdgeBy(block: HTMLElement, offsetPx: number) {
  const edge = block.querySelector('[data-edge="right"]') as HTMLElement;
  const startX = 200;
  edge.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: startX }));
  document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: startX + offsetPx }));
  document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}

const WORDS = [createWord({ text: "hello ", begin: 0, end: 1 }), createWord({ text: "world", begin: 1, end: 2 })];

const SYLLABLE_GROUP_WORDS = [
  createWord({ text: "hello ", begin: 0, end: 1 }),
  createWord({ text: "ev", begin: 1, end: 1.2 }),
  createWord({ text: "er", begin: 1.2, end: 1.5 }),
  createWord({ text: "y ", begin: 1.5, end: 1.8 }),
  createWord({ text: "world", begin: 1.8, end: 2.5 }),
];

const SYLLABLE_GROUP_WORDS_SHIFTED = [
  createWord({ text: "hello ", begin: 0, end: 1 }),
  createWord({ text: "ev", begin: 1.4, end: 1.6 }),
  createWord({ text: "er", begin: 1.6, end: 1.9 }),
  createWord({ text: "y ", begin: 1.9, end: 2.2 }),
  createWord({ text: "world", begin: 2.2, end: 2.9 }),
];

describe("WordTrack", () => {
  it("renders one WordBlock per word", async () => {
    const line = createLine({ words: WORDS });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={WORDS}
        color="#a3c9ff"
        trackType="word"
        duration={2}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    expect(screen.container.querySelectorAll("[data-word-block]").length).toBe(WORDS.length);
  });

  it("exposes data-syllable-position=first/middle/last for a split word in the middle of the row", async () => {
    const line = createLine({ words: SYLLABLE_GROUP_WORDS });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={SYLLABLE_GROUP_WORDS}
        color="#a3c9ff"
        trackType="word"
        duration={3}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    expect(blocks.map((b) => b.dataset.syllablePosition)).toEqual(["none", "first", "middle", "last", "none"]);
  });

  it("preserves data-syllable-position after a timing-only update (regression for issue #56)", async () => {
    const line = createLine({ words: SYLLABLE_GROUP_WORDS });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={SYLLABLE_GROUP_WORDS_SHIFTED}
        color="#a3c9ff"
        trackType="word"
        duration={3}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    expect(blocks.map((b) => b.dataset.syllablePosition)).toEqual(["none", "first", "middle", "last", "none"]);
  });

  it("renders id-encoded syllable groups (no trailing-space pattern needed)", async () => {
    const ID_ENCODED = [
      createWord({ text: "hello ", begin: 0, end: 1 }),
      createWord({ text: "ev", begin: 1, end: 1.2, syllableGroupId: "g_every" }),
      createWord({ text: "er", begin: 1.2, end: 1.5, syllableGroupId: "g_every" }),
      createWord({ text: "y", begin: 1.5, end: 1.8, syllableGroupId: "g_every" }),
      createWord({ text: "world", begin: 1.8, end: 2.5 }),
    ];
    const line = createLine({ words: ID_ENCODED });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={ID_ENCODED}
        color="#a3c9ff"
        trackType="word"
        duration={3}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    expect(blocks.map((b) => b.dataset.syllablePosition)).toEqual(["none", "first", "middle", "last", "none"]);
  });

  it("preserves id-encoded syllable positions across a timing-only update", async () => {
    const ID_ENCODED = [
      createWord({ text: "hello ", begin: 0, end: 1 }),
      createWord({ text: "ev", begin: 1, end: 1.2, syllableGroupId: "g_every" }),
      createWord({ text: "er", begin: 1.2, end: 1.5, syllableGroupId: "g_every" }),
      createWord({ text: "y", begin: 1.5, end: 1.8, syllableGroupId: "g_every" }),
      createWord({ text: "world", begin: 1.8, end: 2.5 }),
    ];
    const ID_ENCODED_SHIFTED = [
      createWord({ text: "hello ", begin: 0, end: 1 }),
      createWord({ text: "ev", begin: 1.4, end: 1.6, syllableGroupId: "g_every" }),
      createWord({ text: "er", begin: 1.6, end: 1.9, syllableGroupId: "g_every" }),
      createWord({ text: "y", begin: 1.9, end: 2.2, syllableGroupId: "g_every" }),
      createWord({ text: "world", begin: 2.2, end: 2.9 }),
    ];
    const line = createLine({ words: ID_ENCODED });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={ID_ENCODED_SHIFTED}
        color="#a3c9ff"
        trackType="word"
        duration={3}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    expect(blocks.map((b) => b.dataset.syllablePosition)).toEqual(["none", "first", "middle", "last", "none"]);
  });

  it("dashes both facing syllable edges when the group has a timing gap", async () => {
    const words = [
      createWord({ text: "ev", begin: 0, end: 0.5, syllableGroupId: "g" }),
      createWord({ text: "er", begin: 0.8, end: 1.3, syllableGroupId: "g" }),
    ];
    const screen = await renderTrack(words);
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    expect(blocks[0].style.borderRightStyle).toBe("dashed");
    expect(blocks[1].style.borderLeftStyle).toBe("dashed");
  });

  it("drags a flush syllable boundary conjoined, moving the shared edge as one", async () => {
    const calls: Array<{ index: number; adjacentIndex?: number }> = [];
    const words = [
      createWord({ text: "ev", begin: 0, end: 0.5, syllableGroupId: "g" }),
      createWord({ text: "er", begin: 0.5, end: 1, syllableGroupId: "g" }),
    ];
    const screen = await renderTrack(words, (index, _u, adjacentIndex) => calls.push({ index, adjacentIndex }));
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    dragRightEdge(blocks[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].adjacentIndex).toBe(1);
  });

  it("drags a gapped syllable boundary independently, leaving the gap alone", async () => {
    const calls: Array<{ index: number; adjacentIndex?: number }> = [];
    const words = [
      createWord({ text: "ev", begin: 0, end: 0.5, syllableGroupId: "g" }),
      createWord({ text: "er", begin: 0.8, end: 1.3, syllableGroupId: "g" }),
    ];
    const screen = await renderTrack(words, (index, _u, adjacentIndex) => calls.push({ index, adjacentIndex }));
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    dragRightEdge(blocks[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].adjacentIndex).toBeUndefined();
  });

  it("drags a gapped syllable boundary conjoined when Alt is held", async () => {
    const calls: Array<{ index: number; adjacentIndex?: number }> = [];
    const words = [
      createWord({ text: "ev", begin: 0, end: 0.5, syllableGroupId: "g" }),
      createWord({ text: "er", begin: 0.8, end: 1.3, syllableGroupId: "g" }),
    ];
    const screen = await renderTrack(words, (index, _u, adjacentIndex) => calls.push({ index, adjacentIndex }));
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));
    dragRightEdge(blocks[0], { altKey: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].adjacentIndex).toBe(1);
  });

  it("does not snap a syllable divider back to its start position (regression for issue #76)", async () => {
    useSettingsStore.setState({ timelineSnap: true });
    const calls: Array<{ index: number; updates: { begin?: number; end?: number }; adjacentIndex?: number }> = [];
    const words = [
      createWord({ text: "ev", begin: 1, end: 1.2, syllableGroupId: "g" }),
      createWord({ text: "er", begin: 1.2, end: 1.6, syllableGroupId: "g" }),
      createWord({ text: "y", begin: 1.6, end: 2, syllableGroupId: "g" }),
    ];
    const screen = await renderTrack(words, (index, updates, adjacentIndex) =>
      calls.push({ index, updates, adjacentIndex }),
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));

    dragRightEdgeBy(blocks[0], 10);

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].index).toBe(0);
    expect(calls[0].adjacentIndex).toBe(1);
    expect(calls[0].updates.end).not.toBe(1.2);
    expect(calls[0].updates.end).toBeGreaterThan(1.2);
  });

  it("conjoins a touching word boundary when rolling edit mode is on", async () => {
    useTimelineStore.setState({ rollingEditMode: true, zoom: 100 });
    const calls: Array<{
      index: number;
      updates: { begin?: number; end?: number };
      adjacentIndex?: number;
      adjacentUpdates?: { begin?: number; end?: number };
    }> = [];
    const words = [createWord({ text: "a ", begin: 1, end: 1.5 }), createWord({ text: "b", begin: 1.5, end: 2 })];
    const screen = await renderTrack(words, (index, updates, adjacentIndex, adjacentUpdates) =>
      calls.push({ index, updates, adjacentIndex, adjacentUpdates }),
    );
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));

    dragRightEdgeBy(blocks[0], 30);

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].index).toBe(0);
    expect(calls[0].adjacentIndex).toBe(1);

    const newBoundary = calls[0].updates.end;
    expect(newBoundary).toBeDefined();
    expect(newBoundary).not.toBe(1.5);
    expect(calls[0].adjacentUpdates?.begin).toBe(newBoundary);

    expect(calls[0].updates.begin).toBeUndefined();
    expect(calls[0].adjacentUpdates?.end).toBeUndefined();
  });

  it("resizes one word independently when Alt is held in rolling edit mode", async () => {
    useTimelineStore.setState({ rollingEditMode: true, zoom: 100 });
    const calls: Array<{ index: number; adjacentIndex?: number }> = [];
    const words = [createWord({ text: "a ", begin: 1, end: 1.5 }), createWord({ text: "b", begin: 1.5, end: 2 })];
    const screen = await renderTrack(words, (index, _u, adjacentIndex) => calls.push({ index, adjacentIndex }));
    const blocks = Array.from(screen.container.querySelectorAll<HTMLElement>("[data-word-block]"));

    const edge = blocks[0].querySelector('[data-edge="right"]') as HTMLElement;
    const startX = 200;
    edge.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: startX }));
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: startX - 10, altKey: true }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0].index).toBe(0);
    expect(calls[0].adjacentIndex).toBeUndefined();
  });

  it("sizes the track container to duration × zoom", async () => {
    const line = createLine({ words: WORDS });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <WordTrack
        lineId={line.id}
        lineIndex={0}
        words={WORDS}
        color="#a3c9ff"
        trackType="word"
        duration={2}
        height={32}
        onUpdateWord={() => {}}
      />,
      { dndContext: true },
    );
    const track = screen.container.querySelector(".relative") as HTMLElement;
    expect(track.style.height).toBe("32px");
  });

  it("adds a word on double-click and spaces the seam before it", async () => {
    useAudioStore.setState({ duration: 3 });
    useTimelineStore.setState({ zoom: 100 });
    const screen = await renderTrack(WORDS);
    const track = screen.container.querySelector(".relative") as HTMLElement;
    const rect = track.getBoundingClientRect();

    track.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: rect.left + 250, clientY: rect.top + 10 }),
    );

    await expect.poll(() => useProjectStore.getState().lines[0].words?.length).toBe(3);
    expect(useProjectStore.getState().lines[0].words?.map((w) => w.text)).toEqual(["hello ", "world ", "..."]);
  });
});
