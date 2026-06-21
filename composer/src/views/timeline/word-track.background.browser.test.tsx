import { describe, expect, it } from "vitest";
import { WordTrack } from "@/views/timeline/word-track";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

// Double-clicking an empty spot on a line's background track inserts a new
// background word. That is a user editing background vocals, so the line's
// backgroundTextSource must become "manual".

async function renderBgTrack(lineId: string) {
  return render(
    <WordTrack
      lineId={lineId}
      lineIndex={0}
      words={useProjectStore.getState().lines[0].backgroundWords ?? []}
      color="#a3c9ff"
      trackType="bg"
      duration={3}
      height={32}
      onUpdateWord={() => {}}
    />,
    { dndContext: true },
  );
}

describe("WordTrack background provenance", () => {
  it("stamps backgroundTextSource manual when a bg word is added by double-click", async () => {
    useAudioStore.setState({ duration: 3 });
    useTimelineStore.setState({ zoom: 100 });
    const line = createLine({
      text: "main",
      words: [createWord({ text: "main", begin: 0, end: 1 })],
      backgroundText: "ooh",
      backgroundWords: [createWord({ text: "ooh", begin: 0, end: 0.5 })],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ lines: [line] });

    const screen = await renderBgTrack(line.id);
    const track = screen.container.querySelector(".relative") as HTMLElement;
    const rect = track.getBoundingClientRect();
    track.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: rect.left + 250, clientY: rect.top + 10 }),
    );

    await expect.poll(() => useProjectStore.getState().lines[0].backgroundWords?.length).toBe(2);
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("manual");
  });

  it("keeps the existing background words intact apart from the added one", async () => {
    useAudioStore.setState({ duration: 3 });
    useTimelineStore.setState({ zoom: 100 });
    const line = createLine({
      text: "main",
      words: [createWord({ text: "main", begin: 0, end: 1 })],
      backgroundText: "ooh",
      backgroundWords: [createWord({ text: "ooh", begin: 0, end: 0.5 })],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ lines: [line] });

    const screen = await renderBgTrack(line.id);
    const track = screen.container.querySelector(".relative") as HTMLElement;
    const rect = track.getBoundingClientRect();
    track.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: rect.left + 250, clientY: rect.top + 10 }),
    );

    await expect.poll(() => useProjectStore.getState().lines[0].backgroundWords?.length).toBe(2);
    const bg = useProjectStore.getState().lines[0].backgroundWords;
    expect(bg?.some((w) => w.text.trim() === "ooh")).toBe(true);
  });
});
