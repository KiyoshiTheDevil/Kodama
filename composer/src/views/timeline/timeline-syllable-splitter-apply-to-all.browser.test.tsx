import { beforeEach, describe, expect, it } from "vitest";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { ConfirmModalHost } from "@/ui/confirm-modal";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";
import { TimelineSyllableSplitter } from "@/views/timeline/timeline-syllable-splitter";
import { useTimelineStore } from "@/views/timeline/timeline-store";

// -- Helpers ------------------------------------------------------------------

function makeLine(id: string, wordText: string, beginOffset: number) {
  return createLine({
    id,
    text: wordText,
    words: [createWord({ text: wordText, begin: beginOffset, end: beginOffset + 1 })],
  });
}

async function renderSplitter() {
  return render(
    <>
      <TimelineSyllableSplitter />
      <ConfirmModalHost />
    </>,
  );
}

function selectFirstWord(lineId: string) {
  useTimelineStore.setState({
    selectedWords: [{ lineId, lineIndex: 0, wordIndex: 0, type: "word" }],
  });
}

// -- Tests --------------------------------------------------------------------

describe("TimelineSyllableSplitter apply-to-all wiring", () => {
  beforeEach(() => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
  });

  it("seeds checkboxes from project syllableSplitDefaults", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0)],
      syllableSplitDefaults: { applyToAll: true, caseInsensitive: true },
    });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "running"/ })).toBeInTheDocument();

    const applyToAll = screen.getByLabelText("Apply to all identical words").element() as HTMLInputElement;
    const caseInsensitive = screen.getByLabelText("Case-insensitive matching").element() as HTMLInputElement;
    expect(applyToAll.checked).toBe(true);
    expect(caseInsensitive.checked).toBe(true);
  });

  it("recomputes identical count as case-insensitive toggles", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "Running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await expect.element(screen.getByRole("heading", { name: /Split "running"/ })).toBeInTheDocument();

    await screen.getByLabelText("Apply to all identical words").click();
    await expect.element(screen.getByText("No other matching words")).toBeInTheDocument();
    await screen.getByLabelText("Case-insensitive matching").click();
    await expect.element(screen.getByText(/This will also split 1 other "running"/)).toBeInTheDocument();
  });

  it("applies to all matches via the store action and closes the modal", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Split" }).click();

    await expect.poll(() => useProjectStore.getState().lines[1].words?.length).toBe(2);
    await expect.poll(() => document.querySelector("dialog")).toBeNull();
  });

  it("confirm-cancel keeps the modal open and does not mutate lines", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    const before = useProjectStore.getState().lines;
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Cancel" }).click();

    expect(useProjectStore.getState().lines).toBe(before);
    await expect.element(screen.getByRole("heading", { name: /Split "running"/ })).toBeInTheDocument();
  });

  it("settings gate off skips the confirm modal", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    useSettingsStore.setState({ confirmApplyToAllSyllableSplit: false });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();

    await expect.poll(() => useProjectStore.getState().lines[1].words?.length).toBe(2);
  });

  it("single-word path (apply-to-all off) writes via the divergence-aware flow", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();

    await expect.poll(() => useProjectStore.getState().lines[0].words?.length).toBe(2);
    expect(useProjectStore.getState().lines[1].words?.length).toBe(1);
  });

  it("persists checkbox state to syllableSplitDefaults after a successful split", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Split" }).click();

    await expect.poll(() => useProjectStore.getState().syllableSplitDefaults.applyToAll).toBe(true);
  });

  it("playhead-on-word special case still applies on single-word splits", async () => {
    const line = createLine({
      id: "l1",
      text: "running",
      words: [createWord({ text: "running", begin: 0, end: 1 })],
    });
    useProjectStore.setState({
      lines: [line],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    selectFirstWord("l1");
    useAudioStore.setState({
      audioElement: { currentTime: 0.42 } as HTMLAudioElement,
      currentTime: 0.42,
    });
    const screen = await renderSplitter();
    window.dispatchEvent(new Event("timeline:split-syllable"));
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();

    await expect.poll(() => useProjectStore.getState().lines[0].words?.length).toBe(2);
    const wordsAfter = useProjectStore.getState().lines[0].words ?? [];
    expect(wordsAfter[0].end).toBeCloseTo(0.42, 5);
    expect(wordsAfter[1].begin).toBeCloseTo(0.42, 5);
    expect(wordsAfter[0].syllableGroupId).toBeDefined();
    expect(wordsAfter[0].syllableGroupId).toBe(wordsAfter[1].syllableGroupId);
  });
});
