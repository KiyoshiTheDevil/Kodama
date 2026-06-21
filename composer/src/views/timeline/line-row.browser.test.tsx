import { describe, expect, it } from "vitest";
import { LineRow } from "@/views/timeline/line-row";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

describe("LineRow", () => {
  it("renders one word block per word on a synced line", async () => {
    const line = createLine({
      words: [createWord({ text: "hello ", begin: 0, end: 1 }), createWord({ text: "world", begin: 1, end: 2 })],
    });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    expect(screen.container.querySelectorAll("[data-word-block]").length).toBe(2);
  });

  it("renders the agent gutter with the line's color", async () => {
    const line = createLine();
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    expect(screen.container.querySelector(".sticky.left-0")).not.toBeNull();
  });

  it("places an unsynced line at the audio's current time when the Place button is clicked", async () => {
    useAudioStore.setState({ currentTime: 5 });
    const line = createLine({ text: "hello world" });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={30} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    const placeButton = Array.from(screen.container.querySelectorAll("button")).find((b) => b.textContent === "Place");
    expect(placeButton).toBeDefined();
    placeButton?.click();
    const updated = useProjectStore.getState().lines.find((l) => l.id === line.id);
    expect(updated?.begin).toBeCloseTo(5, 5);
    expect((updated?.end ?? 0) > 5).toBe(true);
  });

  it("does not show the Place button for a line that already has words", async () => {
    const line = createLine({
      words: [createWord({ text: "synced", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    const placeButton = Array.from(screen.container.querySelectorAll("button")).find((b) => b.textContent === "Place");
    expect(placeButton).toBeUndefined();
  });

  it("uses the row height from the timeline store when one is set for this line", async () => {
    const line = createLine({
      words: [createWord({ text: "x", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState((s) => ({ rowHeights: { ...s.rowHeights, [line.id]: 64 } }));
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    const sized = Array.from(screen.container.querySelectorAll<HTMLElement>("[style*='height']")).find(
      (el) => el.style.height === "64px",
    );
    expect(sized).toBeDefined();
  });

  it("shifts horizontally when this line is the target of a group drag", async () => {
    const groupId = "g1";
    const line = createLine({
      words: [createWord({ text: "x", begin: 0, end: 1 })],
      groupId,
      instanceIdx: 0,
    });
    useProjectStore.setState({ lines: [line] });
    useTimelineStore.setState({
      draggedGroupShift: { groupId, instanceIdx: 0, offsetPx: 25 },
    });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    const transformed = Array.from(screen.container.querySelectorAll<HTMLElement>("[style*='translateX']")).find((el) =>
      el.style.transform.includes("translateX(25"),
    );
    expect(transformed).toBeDefined();
  });

  it("renders a separate background-words track when backgroundWords are present", async () => {
    const line = createLine({
      words: [createWord({ text: "main", begin: 0, end: 1 })],
      backgroundText: "(echo)",
      backgroundWords: [createWord({ text: "(echo)", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={5} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );
    const wordBlocks = screen.container.querySelectorAll("[data-word-block]");
    expect(wordBlocks.length).toBe(2);
  });

  it("stamps a manual provenance when a background word is created via the drop-zone", async () => {
    useAudioStore.setState({ duration: 30 });
    const line = createLine({
      id: "l1",
      text: "hello world",
      words: [createWord({ text: "hello", begin: 0, end: 1 })],
    });
    useProjectStore.setState({ lines: [line] });
    const screen = await render(
      <LineRow line={line} lineIndex={0} duration={30} onUpdateWord={() => {}} onUpdateBgWord={() => {}} />,
      { dndContext: true },
    );

    const dropZone = Array.from(screen.container.querySelectorAll("div")).find((d) => d.textContent?.trim() === "BG");
    expect(dropZone).toBeDefined();
    dropZone?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 100 }));

    await expect.poll(() => useProjectStore.getState().lines[0].backgroundWords?.length).toBe(1);
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("manual");
  });
});
